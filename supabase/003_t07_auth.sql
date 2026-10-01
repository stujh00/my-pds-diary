-- T07: run on the EXISTING T06 database (001_schema.sql is already installed).
-- Do not run 001/002 again. Existing diary rows are retained.
-- Closes T06 unscoped RPCs. Older API deployments using this DB cannot read data.
begin;
drop function public.pds_snapshot();
drop function public.pds_mutate(text,jsonb,uuid);
-- Replace FK deletion behavior for complete account data removal.
do $$declare x record;mode text;begin
 for x in select c.conname,c.conrelid::regclass as tbl,pg_get_constraintdef(c.oid) as def from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace and c.conrelid::regclass::text like 'pds_%' loop
  mode:=case when x.conname='pds_plans_source_review_id_fkey' then 'SET NULL' else 'CASCADE' end;
  execute format('alter table %s drop constraint %I',x.tbl,x.conname);
  execute format('alter table %s add constraint %I %s ON DELETE %s',x.tbl,x.conname,x.def,mode);
 end loop;
end$$;
create unique index pds_one_workspace_per_owner on public.pds_workspaces(owner_id) where owner_id is not null;
alter table public.pds_requests add column workspace_id uuid references public.pds_workspaces(id) on delete cascade;
update public.pds_requests set workspace_id='06000000-0000-4000-8000-000000000001';
alter table public.pds_requests alter column workspace_id set not null;
alter table public.pds_requests drop constraint pds_requests_pkey;
alter table public.pds_requests add primary key(workspace_id,id);
create table public.pds_auth_sessions(
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '1 hour'),revoked_at timestamptz,
 check(expires_at>created_at));
create table public.pds_observations(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.pds_workspaces(id) on delete cascade,
 question text not null check(length(trim(question)) between 1 and 2000),
 metric text not null default '실제 공부 시간' check(metric='실제 공부 시간'),unit text not null default '분' check(unit='분'),
 calculation_rule text not null default '서울 날짜별 선택한 실행 기록의 actual_minutes 합계',
 initial_rule text not null check(length(trim(initial_rule)) between 1 and 2000),
 created_at timestamptz not null default now(),unique(workspace_id));
create table public.pds_observation_days(
 id uuid primary key default gen_random_uuid(),observation_id uuid not null references public.pds_observations(id) on delete cascade,
 day_number int not null check(day_number between 1 and 5),record_date date not null,
 session_ids uuid[] not null check(cardinality(session_ids)>0),actual_minutes int not null check(actual_minutes>=1),
 note text not null check(length(note)<=3000),created_at timestamptz not null default now(),
 unique(observation_id,day_number),unique(observation_id,record_date));
create table public.pds_rule_changes(
 id uuid primary key default gen_random_uuid(),observation_id uuid not null unique references public.pds_observations(id) on delete cascade,
 day1_id uuid not null references public.pds_observation_days(id),day2_id uuid not null references public.pds_observation_days(id),
 new_rule text not null check(length(trim(new_rule)) between 1 and 2000),reason text not null check(length(trim(reason)) between 1 and 3000),
 created_at timestamptz not null default now());
create function public.pds_auth_owner(p_session_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;begin
 select user_id into v from public.pds_auth_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() for share;
 if v is null then raise sqlstate 'PT401' using message='로그인이 필요합니다.';end if;
 return v;
end$$;
create function public.pds_account_workspace(p_user uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;begin
 insert into public.pds_workspaces(id,owner_id,title) values(gen_random_uuid(),p_user,'내 공부 다이어리') on conflict(owner_id) where owner_id is not null do nothing;
 select id into strict v from public.pds_workspaces where owner_id=p_user;return v;
end$$;
create function public.pds_snapshot(p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v uuid;v_owner uuid;v_result jsonb;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v from public.pds_workspaces where owner_id=v_owner;
 with plans as(select * from public.pds_plans where workspace_id=v),
 tasks as(select t.* from public.pds_tasks t join plans p on t.plan_id=p.id),
 observations as(select * from public.pds_observations where workspace_id=v)
 select jsonb_build_object('schema_version',3,'exported_at',now(),'timezone','Asia/Seoul','time_unit','minute',
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
create function public.pds_read(p_kind text,p_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_result jsonb;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 if p_kind='task' then
 select to_jsonb(t) into v_result from public.pds_tasks t join public.pds_plans p on p.id=t.plan_id join public.pds_workspaces w on w.id=p.workspace_id where t.id=p_id and w.owner_id=v_owner and t.deleted_at is null;
 elsif p_kind='plan' then
 select to_jsonb(p) into v_result from public.pds_plans p join public.pds_workspaces w on w.id=p.workspace_id where p.id=p_id and w.owner_id=v_owner;
 end if;
 if v_result is null then raise sqlstate 'PT404' using message='자료를 찾을 수 없습니다.';end if;return v_result;
end$$;
create function public.pds_mutate(p_action text,p_data jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_workspace uuid;v_id uuid;v_plan uuid;v_task public.pds_tasks;v_old public.pds_requests;v_result jsonb;v_metrics jsonb;v_review uuid;v_next uuid;
begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v_workspace from public.pds_workspaces where owner_id=v_owner;
 v_id:=nullif(p_data->>'id','')::uuid;
 -- Check ownership before retries and before any write. Never trust owner_id from client.
 if p_action='plan.save' and v_id is not null then
   if not exists(select 1 from public.pds_plans where id=v_id and workspace_id=v_workspace) then raise sqlstate 'PT404' using message='자료를 찾을 수 없습니다.';end if;
 elsif p_action='task.save' and v_id is null or p_action='review.save' then
   if not exists(select 1 from public.pds_plans where id=(p_data->>'plan_id')::uuid and workspace_id=v_workspace) then raise sqlstate 'PT404' using message='자료를 찾을 수 없습니다.';end if;
 elsif p_action in ('task.save','task.complete','task.reopen','task.delete','session.add') then
   if not exists(select 1 from public.pds_tasks t join public.pds_plans p on p.id=t.plan_id where t.id=v_id and p.workspace_id=v_workspace) then raise sqlstate 'PT404' using message='자료를 찾을 수 없습니다.';end if;
 end if;
 perform 1 from public.pds_workspaces where id=v_workspace for update;
 select * into v_old from public.pds_requests where id=p_request_id and workspace_id=v_workspace;
 if found then if v_old.action<>p_action or v_old.payload<>p_data then raise exception 'Request key reused' using errcode='23505';end if;return v_old.result;end if;
 v_id:=nullif(p_data->>'id','')::uuid;
 case p_action
 when 'plan.save' then
 if v_id is null then
 insert into public.pds_plans(workspace_id,title,start_date,end_date,priority,success_criteria,estimated_minutes)
 values(v_workspace,p_data->>'title',(p_data->>'start_date')::date,(p_data->>'end_date')::date,(p_data->>'priority')::int,p_data->>'success_criteria',(p_data->>'estimated_minutes')::int) returning id into v_id;
 else
 update public.pds_plans set title=p_data->>'title',start_date=(p_data->>'start_date')::date,end_date=(p_data->>'end_date')::date,priority=(p_data->>'priority')::int,success_criteria=p_data->>'success_criteria',estimated_minutes=(p_data->>'estimated_minutes')::int where id=v_id and revision=(p_data->>'revision')::int;
 if not found then raise exception 'Stale plan' using errcode='40001';end if;end if;
 when 'task.save' then
 if v_id is null then
 insert into public.pds_tasks(plan_id,title,due_date,priority,tags,estimated_minutes)values((p_data->>'plan_id')::uuid,p_data->>'title',(p_data->>'due_date')::date,(p_data->>'priority')::int,array(select jsonb_array_elements_text(p_data->'tags')),(p_data->>'estimated_minutes')::int)returning id into v_id;
 else update public.pds_tasks set title=p_data->>'title',due_date=(p_data->>'due_date')::date,priority=(p_data->>'priority')::int,tags=array(select jsonb_array_elements_text(p_data->'tags')),estimated_minutes=(p_data->>'estimated_minutes')::int,revision=revision+1,updated_at=now()where id=v_id and deleted_at is null and revision=(p_data->>'revision')::int;
 if not found then raise exception 'Stale task' using errcode='40001';end if;end if;
 when 'task.complete','task.reopen','task.delete','session.add' then
 select * into v_task from public.pds_tasks where id=v_id and deleted_at is null for update;
 if not found then raise exception 'Task not found';end if;
 if p_action='task.complete' then
 if v_task.completion_cycle is distinct from (p_data->>'completion_cycle')::int then raise exception 'Stale cycle' using errcode='40001';end if;
 insert into public.pds_completions(task_id,cycle)values(v_id,v_task.completion_cycle)on conflict(task_id,cycle)do nothing;
 update public.pds_tasks set status='done',updated_at=now(),revision=revision+1 where id=v_id and status<>'done';
 elsif p_action='task.reopen' then
 if v_task.completion_cycle is distinct from (p_data->>'completion_cycle')::int then raise exception 'Stale cycle' using errcode='40001';end if;
 update public.pds_tasks set status='open',completion_cycle=completion_cycle+1,revision=revision+1,updated_at=now()where id=v_id and status='done';
 elsif p_action='task.delete' then
 update public.pds_tasks set deleted_at=now(),revision=revision+1 where id=v_id;
 else
 if (p_data->>'ended_at')::timestamptz>now() then raise exception 'Future execution is not allowed';end if;
 insert into public.pds_sessions(task_id,started_at,ended_at,actual_minutes,blocker,note)values(v_id,(p_data->>'started_at')::timestamptz,(p_data->>'ended_at')::timestamptz,(p_data->>'actual_minutes')::int,coalesce(p_data->>'blocker',''),coalesce(p_data->>'note','')) returning id into v_id;
 end if;
 when 'review.save' then
 v_plan:=(p_data->>'plan_id')::uuid;
 with target as(select * from public.pds_tasks where plan_id=v_plan and deleted_at is null and due_date between (p_data->>'from_date')::date and (p_data->>'to_date')::date), logs as(select s.* from public.pds_sessions s join target t on t.id=s.task_id)
 select jsonb_build_object('planned',count(*),'done',count(*)filter(where status='done'),'delayed',count(*)filter(where status='open' and due_date<(now() at time zone 'Asia/Seoul')::date),'blocked',count(*)filter(where exists(select 1 from logs l where l.task_id=target.id and l.blocker ~ '[^[:space:]]')),'estimated',coalesce(sum(estimated_minutes),0),'actual',(select coalesce(sum(actual_minutes),0)from logs),'difference',(select coalesce(sum(actual_minutes),0)from logs)-coalesce(sum(estimated_minutes),0),'task_ids',coalesce(jsonb_agg(id),'[]'::jsonb),'session_ids',(select coalesce(jsonb_agg(id),'[]'::jsonb)from logs),'as_of',now())into v_metrics from target;
 insert into public.pds_reviews(plan_id,from_date,to_date,improvement,metrics)values(v_plan,(p_data->>'from_date')::date,(p_data->>'to_date')::date,p_data->>'improvement',v_metrics)returning id into v_review;
 insert into public.pds_plans(workspace_id,title,start_date,end_date,priority,success_criteria,estimated_minutes,improvement,source_review_id)
 values(v_workspace,p_data->>'next_title',(p_data->>'next_start')::date,(p_data->>'next_end')::date,1,p_data->>'improvement',0,p_data->>'improvement',v_review)returning id into v_next;
 v_id:=v_next;
 else raise exception 'Invalid action';end case;
 v_result:=jsonb_build_object('id',v_id,'ok',true);
 insert into public.pds_requests(id,workspace_id,action,payload,result)values(p_request_id,v_workspace,p_action,p_data,v_result);
 return v_result;
end;$$;

create function public.pds_observe(p_action text,p_data jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_workspace uuid;v_obs public.pds_observations;v_old public.pds_requests;v_id uuid;v_result jsonb;
 v_count int;v_number int;v_ids uuid[];v_total int;v_found int;v_first public.pds_observation_days;v_second public.pds_observation_days;v_change public.pds_rule_changes;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v_workspace from public.pds_workspaces where owner_id=v_owner for update;
 select * into v_obs from public.pds_observations where workspace_id=v_workspace;
 if p_action<>'observation.start' and (v_obs.id is null or v_obs.id is distinct from (p_data->>'observation_id')::uuid) then raise sqlstate 'PT404' using message='자료를 찾을 수 없습니다.';end if;
 select * into v_old from public.pds_requests where workspace_id=v_workspace and id=p_request_id;
 if found then if v_old.action<>p_action or v_old.payload<>p_data then raise exception 'Request key reused' using errcode='23505';end if;return v_old.result;end if;
 case p_action
 when 'observation.start' then
 if v_obs.id is not null then raise sqlstate 'PT409' using message='이미 시작한 관찰이 있습니다.';end if;
 insert into public.pds_observations(workspace_id,question,initial_rule) values(v_workspace,p_data->>'question',p_data->>'initial_rule') returning id into v_id;
 when 'observation.day' then
 select count(*) into v_count from public.pds_observation_days where observation_id=v_obs.id;
 v_number:=v_count+1;
 if v_number>5 then raise sqlstate 'PT409' using message='5일 기록을 모두 저장했습니다.';end if;
 if exists(select 1 from public.pds_observation_days where observation_id=v_obs.id and record_date>=(now() at time zone 'Asia/Seoul')::date) then raise sqlstate 'PT409' using message='서로 다른 실제 날짜에 하루 한 번 기록하세요.';end if;
 if v_number=1 and (v_obs.created_at at time zone 'Asia/Seoul')::date<>(now() at time zone 'Asia/Seoul')::date then raise sqlstate 'PT409' using message='관찰을 시작한 날에 1일차 기록을 저장하세요.';end if;
 select * into v_change from public.pds_rule_changes where observation_id=v_obs.id;
 if v_number>=3 and v_change.id is null then raise sqlstate 'PT409' using message='2일차 뒤 3일차 전에 계획 규칙을 한 번 변경하세요.';end if;
 v_ids:=array(select jsonb_array_elements_text(p_data->'session_ids')::uuid);
 if cardinality(v_ids)=0 or cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids)x) then raise sqlstate 'PT400' using message='실행 기록을 중복 없이 선택하세요.';end if;
 select count(*),coalesce(sum(s.actual_minutes),0) into v_found,v_total from public.pds_sessions s join public.pds_tasks t on t.id=s.task_id join public.pds_plans p on p.id=t.plan_id
 where s.id=any(v_ids) and p.workspace_id=v_workspace and (s.started_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date
 and (s.created_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date and s.created_at>=v_obs.created_at and s.started_at>=v_obs.created_at;
 if v_total>240 and length(trim(coalesce(p_data->>'note','')))=0 then raise sqlstate 'PT400' using message='240분 초과 값은 실제 값인지 확인한 메모를 적으세요.';end if;
 if v_found<>cardinality(v_ids) then raise sqlstate 'PT400' using message='오늘 실제로 저장한 본인 실행 기록만 선택할 수 있습니다.';end if;
 if v_number>=3 and exists(select 1 from public.pds_sessions where id=any(v_ids) and (created_at<=v_change.created_at or started_at<=v_change.created_at)) then raise sqlstate 'PT400' using message='규칙 변경 뒤 시작하고 저장한 실행 기록을 선택하세요.';end if;
 insert into public.pds_observation_days(observation_id,day_number,record_date,session_ids,actual_minutes,note)
 values(v_obs.id,v_number,(now() at time zone 'Asia/Seoul')::date,v_ids,v_total,coalesce(p_data->>'note',''))returning id into v_id;
 when 'observation.rule' then
 select count(*) into v_count from public.pds_observation_days where observation_id=v_obs.id;
 if v_count<>2 then raise sqlstate 'PT409' using message='2일차 기록 뒤, 3일차 기록 전에만 변경할 수 있습니다.';end if;
 if p_data->>'new_rule'=v_obs.initial_rule then raise sqlstate 'PT400' using message='기존 규칙과 다른 규칙을 적으세요.';end if;
 select * into strict v_first from public.pds_observation_days where observation_id=v_obs.id and day_number=1;
 select * into strict v_second from public.pds_observation_days where observation_id=v_obs.id and day_number=2;
 insert into public.pds_rule_changes(observation_id,day1_id,day2_id,new_rule,reason)values(v_obs.id,v_first.id,v_second.id,p_data->>'new_rule',p_data->>'reason')returning id into v_id;
 else raise sqlstate 'PT400' using message='지원하지 않는 요청입니다.';end case;
 v_result:=jsonb_build_object('ok',true,'id',v_id);
 insert into public.pds_requests(id,workspace_id,action,payload,result)values(p_request_id,v_workspace,p_action,p_data,v_result);
 return v_result;
end$$;
-- No direct browser/SDK DB access, including with a Supabase JWT.
-- All diary requests go through server-only RPCs that derive owner from a live app session.
do $$declare x record;begin
 for x in select tablename from pg_tables where schemaname='public' and tablename like 'pds_%' loop
 execute format('alter table public.%I enable row level security',x.tablename);
 execute format('revoke all on public.%I from public,anon,authenticated',x.tablename);
 execute format('grant select,insert,update,delete on public.%I to service_role',x.tablename);
 end loop;
 for x in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pds_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',x.fn);
 execute format('grant execute on function %s to service_role',x.fn);
 end loop;
end$$;
commit;
