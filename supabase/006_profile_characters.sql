-- Run after 003 (and 005 for the general-plan UI). Safe to repeat.
begin;
create table if not exists public.pds_profiles(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 character_id text not null check(character_id in ('cat','dog','rabbit','bear','panda','fox','tiger','lion','koala','penguin','frog','hamster','apple','pear','orange','lemon','banana','watermelon','grapes','strawberry','cherry','peach','pineapple','kiwi')),
 updated_at timestamptz not null default now());
alter table public.pds_profiles enable row level security;
revoke all on public.pds_profiles from public,anon,authenticated;
grant select,insert,update,delete on public.pds_profiles to service_role;
create or replace function public.pds_profile_mutate(p_action text,p_data jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_workspace uuid;v_old public.pds_requests;v_result jsonb;v_character text;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v_workspace from public.pds_workspaces where owner_id=v_owner for update;
 if p_action<>'profile.save' then raise sqlstate 'PT400' using message='지원하지 않는 요청입니다.';end if;
 v_character:=p_data->>'character_id';
 if v_character is null or v_character not in ('cat','dog','rabbit','bear','panda','fox','tiger','lion','koala','penguin','frog','hamster','apple','pear','orange','lemon','banana','watermelon','grapes','strawberry','cherry','peach','pineapple','kiwi') then raise sqlstate 'PT400' using message='목록에서 캐릭터를 선택하세요.';end if;
 select * into v_old from public.pds_requests where workspace_id=v_workspace and id=p_request_id;
 if found then
  if v_old.action<>p_action or v_old.payload<>p_data then raise exception 'Request key reused' using errcode='23505';end if;
  return v_old.result;
 end if;
 insert into public.pds_profiles(owner_id,character_id) values(v_owner,v_character)
 on conflict(owner_id) do update set character_id=excluded.character_id,updated_at=now();
 v_result:=jsonb_build_object('ok',true,'character_id',v_character);
 insert into public.pds_requests(id,workspace_id,action,payload,result) values(p_request_id,v_workspace,p_action,p_data,v_result);
 return v_result;
end$$;
revoke all on function public.pds_profile_mutate(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pds_profile_mutate(text,jsonb,uuid,text) to service_role;
create or replace function public.pds_snapshot(p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid;v_owner uuid;v_result jsonb;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v from public.pds_workspaces where owner_id=v_owner;
 with plans as(select * from public.pds_plans where workspace_id=v),
 tasks as(select t.* from public.pds_tasks t join plans p on t.plan_id=p.id),
 observations as(select * from public.pds_observations where workspace_id=v)
 select jsonb_build_object('schema_version',3,'exported_at',now(),'timezone','Asia/Seoul','time_unit','minute',
 'profile',(select jsonb_build_object('character_id',character_id,'updated_at',updated_at) from public.pds_profiles where owner_id=v_owner),
 'workspaces',(select jsonb_agg(w) from public.pds_workspaces w where id=v),
 'plans',coalesce((select jsonb_agg(p order by created_at,id) from plans p),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(t order by created_at,id) from tasks t),'[]'::jsonb),
 'plan_versions',coalesce((select jsonb_agg(t order by t.revision) from public.pds_plan_versions t join plans p on p.id=t.plan_id),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(s order by started_at,id) from public.pds_sessions s where task_id in(select id from tasks)),'[]'::jsonb),
 'completions',coalesce((select jsonb_agg(s) from public.pds_completions s where task_id in(select id from tasks)),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(s order by created_at,id) from public.pds_reviews s where plan_id in(select id from plans)),'[]'::jsonb),
 'observations',coalesce((select jsonb_agg(o) from observations o),'[]'::jsonb),
 'observation_days',coalesce((select jsonb_agg(d order by day_number) from public.pds_observation_days d where observation_id in(select id from observations)),'[]'::jsonb),
 'rule_changes',coalesce((select jsonb_agg(c) from public.pds_rule_changes c where observation_id in(select id from observations)),'[]'::jsonb)) into v_result;
 return v_result;
end$$;
commit;
