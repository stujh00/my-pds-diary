-- Run after 008. Old task dates/values are preserved; existing start_date remains null.
begin;
alter table public.pds_tasks add column if not exists start_date date;
alter table public.pds_tasks drop constraint if exists pds_tasks_start_due_check;
alter table public.pds_tasks add constraint pds_tasks_start_due_check check(start_date is null or start_date<=due_date);
create or replace function public.pds_mutate(p_action text,p_data jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 insert into public.pds_tasks(plan_id,title,due_date,priority,tags,estimated_minutes,start_date)values((p_data->>'plan_id')::uuid,p_data->>'title',(p_data->>'due_date')::date,(p_data->>'priority')::int,array(select jsonb_array_elements_text(p_data->'tags')),(p_data->>'estimated_minutes')::int,nullif(p_data->>'start_date','')::date)returning id into v_id;
 else update public.pds_tasks set start_date=case when p_data?'start_date' then nullif(p_data->>'start_date','')::date else start_date end,title=p_data->>'title',due_date=(p_data->>'due_date')::date,priority=(p_data->>'priority')::int,tags=array(select jsonb_array_elements_text(p_data->'tags')),estimated_minutes=(p_data->>'estimated_minutes')::int,revision=revision+1,updated_at=now()where id=v_id and deleted_at is null and revision=(p_data->>'revision')::int;
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

revoke all on function public.pds_mutate(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pds_mutate(text,jsonb,uuid,text) to service_role;
commit;
