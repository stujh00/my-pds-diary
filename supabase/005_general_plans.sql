-- Run once after 003. Safe to repeat. Existing observations and records are preserved.
begin;
alter table public.pds_observations drop constraint if exists pds_observations_metric_check;
alter table public.pds_observations add constraint pds_observations_metric_check check(metric in ('실제 공부 시간','실제 실행 시간'));
alter table public.pds_observations alter column metric set default '실제 실행 시간';
create or replace function public.pds_account_workspace(p_user uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;begin
 insert into public.pds_workspaces(id,owner_id,title) values(gen_random_uuid(),p_user,'내 계획 다이어리') on conflict(owner_id) where owner_id is not null do nothing;
 select id into strict v from public.pds_workspaces where owner_id=p_user;return v;
end$$;
commit;
