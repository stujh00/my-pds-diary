-- Run after 003_t07_auth.sql on the EXISTING T06 DB.
-- First create YOUR account, then copy its UUID from Authentication > Users.
-- Replace ONLY the marker below. Do not use a test account UUID.
-- Preserves every T06 plan/task/log ID, timestamp, value and unit.
begin;
lock table public.pds_workspaces in exclusive mode;
do $assign$
declare v_owner uuid:='REPLACE_WITH_VERIFIED_OWNER_UUID';
 v_legacy uuid:='06000000-0000-4000-8000-000000000001';
begin
 if not exists(select 1 from auth.users where id=v_owner) then raise exception 'Owner account does not exist';end if;
 if not exists(select 1 from public.pds_workspaces where id=v_legacy and owner_id is null) then raise exception 'Legacy workspace missing or already assigned';end if;
 if exists(select 1 from public.pds_plans p join public.pds_workspaces w on w.id=p.workspace_id where w.owner_id=v_owner)
 or exists(select 1 from public.pds_observations o join public.pds_workspaces w on w.id=o.workspace_id where w.owner_id=v_owner) then raise exception 'New account workspace must still be empty';end if;
 delete from public.pds_workspaces where owner_id=v_owner and id<>v_legacy;
 update public.pds_workspaces set owner_id=v_owner where id=v_legacy;
end$assign$;
commit;
select id,owner_id,title from public.pds_workspaces where id='06000000-0000-4000-8000-000000000001';
