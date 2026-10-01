import {readFile,writeFile,mkdir} from 'node:fs/promises';import {dirname} from 'node:path';import {randomUUID} from 'node:crypto';
const [input,owner,output='local-data/restore-private.sql']=process.argv.slice(2);
if(!input||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner||''))throw new Error('Usage: node scripts/restore-t06.mjs BACKUP.json VERIFIED_OWNER_UUID [OUTPUT.sql]');
const data=JSON.parse(await readFile(input,'utf8'));
if(data.schema_version!==2||data.workspaces?.length!==1||data.workspaces[0].owner_id!==null)throw new Error('Only a single unowned T06 schema-v2 workspace backup is supported.');
for(const [child,parent,key] of [['plans','workspaces','workspace_id'],['tasks','plans','plan_id'],['sessions','tasks','task_id'],['completions','tasks','task_id'],['reviews','plans','plan_id'],['plan_versions','plans','plan_id']]){
 if(!Array.isArray(data[child]))throw new Error(`Missing ${child}`);const parents=new Set(data[parent].map(r=>r.id));
 if(data[child].some(r=>!parents.has(r[key])))throw new Error(`Orphan reference in ${child}`);
 if(new Set(data[child].map(r=>r.id)).size!==data[child].length)throw new Error(`Duplicate ID in ${child}`);
}
const workspace=data.workspaces[0].id;if(!/^[0-9a-f-]{36}$/i.test(workspace))throw new Error('Bad workspace UUID');
const tag='$backup_'+randomUUID().replaceAll('-','')+'$';
const sql=`-- PRIVATE: contains your diary. Never commit this generated file or publish it.
-- Verify this user UUID belongs to YOUR account in Supabase Authentication > Users.
-- Only run on an empty T07 project after 001_schema.sql and 003_t07_auth.sql.
begin;
lock table public.pds_workspaces in exclusive mode;
alter table public.pds_plans disable trigger pds_plan_before;
alter table public.pds_plans disable trigger pds_plan_archive;
do $restore$
declare b jsonb:=${tag}${JSON.stringify(data)}${tag}::jsonb;v_owner uuid:='${owner}';v_workspace uuid:='${workspace}';r jsonb;begin
 if not exists(select 1 from auth.users where id=v_owner) then raise exception 'Verify owner UUID first';end if;
 if exists(select 1 from public.pds_plans p join public.pds_workspaces w on w.id=p.workspace_id where w.owner_id=v_owner or w.id=v_workspace) or exists(select 1 from public.pds_observations o join public.pds_workspaces w on w.id=o.workspace_id where w.owner_id=v_owner or w.id=v_workspace) then raise exception 'Target must be empty; do not overwrite existing diary';end if;
 if exists(select 1 from public.pds_workspaces where id=v_workspace and owner_id is not null) then raise exception 'Workspace already assigned';end if;
 delete from public.pds_workspaces where owner_id=v_owner and id<>v_workspace;
 insert into public.pds_workspaces(id,owner_id,title)values(v_workspace,v_owner,b->'workspaces'->0->>'title')
 on conflict(id)do update set owner_id=excluded.owner_id,title=excluded.title;
 -- Break review->next-plan cycle while retaining the original IDs and timestamps.
 insert into public.pds_plans select * from jsonb_populate_recordset(null::public.pds_plans,(select jsonb_agg(p||jsonb_build_object('source_review_id',null))from jsonb_array_elements(b->'plans')p));
 insert into public.pds_tasks select * from jsonb_populate_recordset(null::public.pds_tasks,b->'tasks');
 insert into public.pds_sessions select * from jsonb_populate_recordset(null::public.pds_sessions,b->'sessions');
 insert into public.pds_completions select * from jsonb_populate_recordset(null::public.pds_completions,b->'completions');
 insert into public.pds_reviews select * from jsonb_populate_recordset(null::public.pds_reviews,b->'reviews');
 for r in select * from jsonb_array_elements(b->'plans')loop
 update public.pds_plans set source_review_id=nullif(r->>'source_review_id','')::uuid where id=(r->>'id')::uuid;
 end loop;
 insert into public.pds_plan_versions select * from jsonb_populate_recordset(null::public.pds_plan_versions,b->'plan_versions');
end$restore$;
alter table public.pds_plans enable trigger pds_plan_before;
alter table public.pds_plans enable trigger pds_plan_archive;
commit;
-- Verify counts for the assigned workspace, not the entire project:
select (select count(*) from public.pds_plans where workspace_id='${workspace}') as plans,
 (select count(*) from public.pds_tasks t join public.pds_plans p on p.id=t.plan_id where p.workspace_id='${workspace}') as tasks,
 (select count(*) from public.pds_sessions s join public.pds_tasks t on t.id=s.task_id join public.pds_plans p on p.id=t.plan_id where p.workspace_id='${workspace}') as sessions;
`;
await mkdir(dirname(output),{recursive:true});await writeFile(output,sql,{mode:0o600});console.log(`Wrote private restore SQL: ${output}. Expected plans=${data.plans.length}, tasks=${data.tasks.length}, sessions=${data.sessions.length}. Do not upload this file to GitHub.`);
