-- Run after 006. Existing selections and timestamps are preserved. Safe to repeat.
begin;
alter table public.pds_profiles drop constraint if exists pds_profiles_character_id_check;
alter table public.pds_profiles add constraint pds_profiles_character_id_check check(character_id in ('cat','dog','rabbit','bear','panda','fox','tiger','lion','koala','penguin','frog','hamster','apple','pear','orange','lemon','banana','watermelon','grapes','strawberry','cherry','peach','pineapple','kiwi','monkey','dolphin','wolf','seal','shark','squirrel','mango','melon','orientalmelon','plum','blueberry','avocado'));
create or replace function public.pds_profile_mutate(p_action text,p_data jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_workspace uuid;v_old public.pds_requests;v_result jsonb;v_character text;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v_workspace from public.pds_workspaces where owner_id=v_owner for update;
 if p_action<>'profile.save' then raise sqlstate 'PT400' using message='지원하지 않는 요청입니다.';end if;
 v_character:=p_data->>'character_id';
 if v_character is null or v_character not in ('cat','dog','rabbit','bear','panda','fox','tiger','lion','koala','penguin','frog','hamster','apple','pear','orange','lemon','banana','watermelon','grapes','strawberry','cherry','peach','pineapple','kiwi','monkey','dolphin','wolf','seal','shark','squirrel','mango','melon','orientalmelon','plum','blueberry','avocado') then raise sqlstate 'PT400' using message='목록에서 캐릭터를 선택하세요.';end if;
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
commit;
