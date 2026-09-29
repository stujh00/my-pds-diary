-- Run once in a dedicated Supabase project's SQL Editor. No authentication in T06.
begin;
create table public.pds_workspaces(id uuid primary key, owner_id uuid references auth.users(id), title text not null);
insert into public.pds_workspaces values('06000000-0000-4000-8000-000000000001',null,'정보처리기사 공부');
create table public.pds_plans(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.pds_workspaces,
 title text not null check(length(trim(title)) between 1 and 200), start_date date not null,end_date date not null,
 priority int not null check(priority between 1 and 3), success_criteria text not null check(length(success_criteria) between 1 and 3000),
 estimated_minutes int not null check(estimated_minutes between 0 and 1000000), revision int not null default 1,
 improvement text not null default '' check(length(improvement)<=3000), source_review_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),check(end_date>=start_date));
create table public.pds_plan_versions(id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.pds_plans,revision int not null,snapshot jsonb not null,created_at timestamptz not null default now(),unique(plan_id,revision));
create table public.pds_tasks(
 id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.pds_plans,title text not null check(length(trim(title)) between 1 and 200),due_date date not null,
 priority int not null check(priority between 1 and 3),tags text[] not null default '{}',estimated_minutes int not null check(estimated_minutes between 0 and 1000000),
 status text not null default 'open' check(status in('open','done')),completion_cycle int not null default 1,revision int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 check(cardinality(tags)<=10),check(length(array_to_string(tags,','))<=500));
create table public.pds_sessions(id uuid primary key default gen_random_uuid(),task_id uuid not null references public.pds_tasks,started_at timestamptz not null,ended_at timestamptz not null,actual_minutes int not null check(actual_minutes between 1 and 1440),blocker text not null default '' check(length(blocker)<=3000),note text not null default '' check(length(note)<=3000),created_at timestamptz not null default now(),check(ended_at>started_at),check(actual_minutes<=ceil(extract(epoch from(ended_at-started_at))/60)));
create table public.pds_completions(id uuid primary key default gen_random_uuid(),task_id uuid not null references public.pds_tasks,cycle int not null,created_at timestamptz not null default now(),unique(task_id,cycle));
create table public.pds_reviews(id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.pds_plans,from_date date not null,to_date date not null,improvement text not null check(length(trim(improvement)) between 1 and 3000),metrics jsonb not null,created_at timestamptz not null default now(),check(to_date>=from_date));
alter table public.pds_plans add foreign key(source_review_id) references public.pds_reviews;
create table public.pds_requests(id uuid primary key,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
create function public.pds_version_plan() returns trigger language plpgsql set search_path='' as $$begin
 if TG_OP='UPDATE' then new.revision:=old.revision+1;new.updated_at:=now();end if;return new;end$$;
create trigger pds_plan_before before update on public.pds_plans for each row execute function public.pds_version_plan();
create function public.pds_archive_plan() returns trigger language plpgsql set search_path='' as $$begin
 insert into public.pds_plan_versions(plan_id,revision,snapshot)values(new.id,new.revision,to_jsonb(new));return new;end$$;
create trigger pds_plan_archive after insert or update on public.pds_plans for each row execute function public.pds_archive_plan();
create function public.pds_snapshot() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('schema_version',2,'exported_at',now(),'timezone','Asia/Seoul','time_unit','minute',
 'workspaces',coalesce((select jsonb_agg(t)from public.pds_workspaces t),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(t order by created_at,id)from public.pds_plans t),'[]'::jsonb),
 'plan_versions',coalesce((select jsonb_agg(t order by revision)from public.pds_plan_versions t),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(t order by created_at,id)from public.pds_tasks t),'[]'::jsonb),
 'sessions',coalesce((select jsonb_agg(t order by started_at,id)from public.pds_sessions t),'[]'::jsonb),
 'completions',coalesce((select jsonb_agg(t)from public.pds_completions t),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(t order by created_at,id)from public.pds_reviews t),'[]'::jsonb));$$;
create function public.pds_mutate(p_action text,p_data jsonb,p_request_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_id uuid;v_plan uuid;v_task public.pds_tasks;v_old public.pds_requests;v_result jsonb;v_metrics jsonb;v_review uuid;v_next uuid;
begin
 -- Serialize mutations in this one public diary, including retries and concurrent completion.
 perform 1 from public.pds_workspaces where id='06000000-0000-4000-8000-000000000001' for update;
 select * into v_old from public.pds_requests where id=p_request_id;
 if found then if v_old.action<>p_action or v_old.payload<>p_data then raise exception 'Request key reused' using errcode='23505';end if;return v_old.result;end if;
 v_id:=nullif(p_data->>'id','')::uuid;
 case p_action
 when 'plan.save' then
 if v_id is null then
 insert into public.pds_plans(workspace_id,title,start_date,end_date,priority,success_criteria,estimated_minutes)
 values('06000000-0000-4000-8000-000000000001',p_data->>'title',(p_data->>'start_date')::date,(p_data->>'end_date')::date,(p_data->>'priority')::int,p_data->>'success_criteria',(p_data->>'estimated_minutes')::int) returning id into v_id;
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
 values('06000000-0000-4000-8000-000000000001',p_data->>'next_title',(p_data->>'next_start')::date,(p_data->>'next_end')::date,1,p_data->>'improvement',0,p_data->>'improvement',v_review)returning id into v_next;
 v_id:=v_next;
 else raise exception 'Invalid action';end case;
 v_result:=jsonb_build_object('id',v_id,'ok',true);
 insert into public.pds_requests(id,action,payload,result)values(p_request_id,p_action,p_data,v_result);
 return v_result;
end;$$;
-- No browser access to tables or RPCs. T06 public access is only the intentional Vercel API.
do $$declare n text;begin foreach n in array array['workspaces','plans','plan_versions','tasks','sessions','completions','reviews','requests']loop
 execute format('alter table public.pds_%I enable row level security',n);
 execute format('revoke all on public.pds_%I from anon, authenticated',n);
 execute format('grant select, insert, update, delete on public.pds_%I to service_role',n);
 end loop;end$$;
revoke all on function public.pds_snapshot() from public,anon,authenticated;
revoke all on function public.pds_mutate(text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.pds_version_plan() from public,anon,authenticated;
revoke all on function public.pds_archive_plan() from public,anon,authenticated;
grant execute on function public.pds_snapshot(), public.pds_mutate(text,jsonb,uuid) to service_role;
commit;
