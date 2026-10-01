-- Run after 003. Owner/session checks are enforced inside the server-only RPC.
begin;
create or replace function public.pds_plan_delete(p_action text,p_data jsonb,p_request_id uuid,p_session_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner uuid;v_workspace uuid;v_plan public.pds_plans;v_id uuid;v_old public.pds_requests;v_result jsonb;begin
 v_owner:=public.pds_auth_owner(p_session_hash);
 select id into strict v_workspace from public.pds_workspaces where owner_id=v_owner for update;
 if p_action<>'plan.delete' or p_data->>'confirmation' is distinct from '계획 삭제' then raise sqlstate 'PT400' using message='삭제 확인 문구를 확인하세요.';end if;
 v_id:=nullif(p_data->>'id','')::uuid;
 select * into v_old from public.pds_requests where workspace_id=v_workspace and id=p_request_id;
 if found then
  if v_old.action<>p_action or v_old.payload<>p_data then raise exception 'Request key reused' using errcode='23505';end if;
  return v_old.result;
 end if;
 select * into v_plan from public.pds_plans where id=v_id and workspace_id=v_workspace for update;
 if not found then raise sqlstate 'PT404' using message='자료를 찾을 수 없습니다.';end if;
 if v_plan.revision is distinct from (p_data->>'revision')::int then raise sqlstate 'PT409' using message='계획이 변경되었습니다. 새로고침 후 확인하세요.';end if;
 -- Preserve fixed five-day observations and their source records.
 if exists(select 1 from public.pds_observation_days d join public.pds_observations o on o.id=d.observation_id
  where o.workspace_id=v_workspace and exists(select 1 from public.pds_sessions s join public.pds_tasks t on t.id=s.task_id where t.plan_id=v_id and s.id=any(d.session_ids))) then
  raise sqlstate 'PT409' using message='5일 관찰의 근거 기록이 포함된 계획은 삭제할 수 없습니다. 관찰 기록을 유지하세요.';
 end if;
 delete from public.pds_plans where id=v_id and workspace_id=v_workspace;
 v_result:=jsonb_build_object('ok',true,'id',v_id);
 insert into public.pds_requests(id,workspace_id,action,payload,result) values(p_request_id,v_workspace,p_action,p_data,v_result);
 return v_result;
end$$;
revoke all on function public.pds_plan_delete(text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.pds_plan_delete(text,jsonb,uuid,text) to service_role;
commit;
