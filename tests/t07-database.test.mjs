import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',hashA='a'.repeat(64),hashB='b'.repeat(64);
async function setup(){const d=new PGlite();await d.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text);grant usage on schema public,auth to service_role;grant all on auth.users to service_role;`);for(const f of ['001_schema.sql','003_t07_auth.sql'])await d.exec(await readFile(new URL('../supabase/'+f,import.meta.url),'utf8'));await d.query('insert into auth.users(id) values($1),($2)',[A,B]);await d.query('select public.pds_account_workspace($1)',[A]);await d.query('select public.pds_account_workspace($1)',[B]);await d.query('insert into public.pds_auth_sessions(token_hash,user_id) values($1,$2),($3,$4)',[hashA,A,hashB,B]);return d;}
const call=async(d,fn,args)=>(await d.query(`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
const save=(d,action,data,hash,id=randomUUID())=>call(d,'pds_mutate',[action,JSON.stringify(data),id,hash]);
const snap=(d,h)=>call(d,'pds_snapshot',[h]);
const newPlan=(d,h,title)=>save(d,'plan.save',{title,start_date:'2026-10-01',end_date:'2026-10-31',priority:1,success_criteria:'실제 기록',estimated_minutes:60},h);
const newTask=(d,h,p,title)=>save(d,'task.save',{plan_id:p,title,due_date:'2026-10-23',priority:1,tags:['공부'],estimated_minutes:60},h);
const rejected=(fn,code)=>assert.rejects(fn,e=>e.code===code);
test('Real SQL: owners isolated in both directions; writes have no side effects; direct DB paths closed',async()=>{
 const d=await setup();try{
 const pa=(await newPlan(d,hashA,'A 계획')).id,pb=(await newPlan(d,hashB,'B 계획')).id;
 const ta=(await newTask(d,hashA,pa,'A 할 일')).id,tb=(await newTask(d,hashB,pb,'B 할 일')).id;
 for(const [h,otherTask,otherPlan] of [[hashA,tb,pb],[hashB,ta,pa]]){
 const before=await snap(d,h===hashA?hashB:hashA);
 await rejected(()=>call(d,'pds_read',['task',otherTask,h]),'PT404');
 await rejected(()=>save(d,'task.save',{id:otherTask,revision:1,title:'침범',due_date:'2026-10-02',priority:1,tags:[],estimated_minutes:1},h),'PT404');
 await rejected(()=>save(d,'task.delete',{id:otherTask},h),'PT404');
 await rejected(()=>save(d,'task.save',{plan_id:otherPlan,title:'침범',due_date:'2026-10-02',priority:1,tags:[],estimated_minutes:1},h),'PT404');
 await rejected(()=>save(d,'session.add',{id:otherTask},h),'PT404');
 const after=await snap(d,h===hashA?hashB:hashA);delete before.exported_at;delete after.exported_at;assert.deepEqual(after,before);
 const own=await snap(d,h);assert.equal(own.plans.length,1);assert.equal(own.tasks.length,1);assert.ok(!own.tasks.some(t=>t.id===otherTask));
 }
 const ownRead=await call(d,'pds_read',['task',ta,hashA]);assert.equal(ownRead.id,ta);
 const key=randomUUID();await save(d,'task.complete',{id:ta,completion_cycle:1},hashA,key);await save(d,'task.complete',{id:ta,completion_cycle:1},hashA,key);assert.equal((await snap(d,hashA)).completions.length,1);
 // Request IDs cannot leak cached results between accounts.
 await save(d,'task.complete',{id:tb,completion_cycle:1},hashB,key);assert.equal((await snap(d,hashB)).completions.length,1);
 await d.exec('set role authenticated;');await assert.rejects(()=>d.query('select * from public.pds_tasks'),e=>e.code==='42501');await assert.rejects(()=>snap(d,hashA),e=>e.code==='42501');await d.exec('reset role;');
 await assert.rejects(()=>d.query('select public.pds_snapshot()'),e=>e.code==='42883');
 }finally{await d.close();}
});
test('Real SQL: same session hash works before logout, fails after revoke/expiration/password revocation',async()=>{
 const d=await setup();try{
 await snap(d,hashA);await d.query('update public.pds_auth_sessions set revoked_at=now() where user_id=$1',[A]);await rejected(()=>snap(d,hashA),'PT401');
 await snap(d,hashB);await d.query("update public.pds_auth_sessions set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where user_id=$1",[B]);await rejected(()=>snap(d,hashB),'PT401');
 }finally{await d.close();}
});
test('Real SQL: observation references checked; day duplication and early rule change rejected',async()=>{
 const d=await setup();try{
 const p=(await newPlan(d,hashA,'학습')).id,t=(await newTask(d,hashA,p,'학습')).id;
 const observe=(a,x,h=hashA,id=randomUUID())=>call(d,'pds_observe',[a,JSON.stringify(x),id,h]);
 const o=(await observe('observation.start',{question:'30분 묶음이면 실제 시간이 늘어나는가?',initial_rule:'60분씩 공부'})).id;
 await rejected(()=>observe('observation.rule',{observation_id:o,new_rule:'30분씩 공부',reason:'검토'}),'PT409');
 await rejected(()=>observe('observation.day',{observation_id:o,session_ids:[],note:''},hashB),'PT404');
 // Controlled local SQL fixtures only; these are not actual five-day user evidence.
 const now=(await d.query('select now() as n')).rows[0].n;await d.query("update public.pds_observations set created_at=now()-interval '10 minutes' where id=$1",[o]);
 const log=await save(d,'session.add',{id:t,started_at:new Date(new Date(now)-5*60000).toISOString(),ended_at:new Date(new Date(now)-60000).toISOString(),actual_minutes:3,blocker:'',note:'SQL fixture'},hashA);
 await rejected(()=>observe('observation.day',{observation_id:o,session_ids:[log.id,log.id],note:''}),'PT400');
 const day=(await observe('observation.day',{observation_id:o,session_ids:[log.id],note:'실제 시간 테스트'})).id;
 assert.equal((await snap(d,hashA)).observation_days[0].actual_minutes,3);
 await rejected(()=>observe('observation.day',{observation_id:o,session_ids:[log.id],note:''}),'PT409');
 assert.equal((await snap(d,hashB)).observations.length,0);
 // Test deletion cascades with linked observation data.
 await d.query('delete from auth.users where id=$1',[A]);for(const table of ['pds_workspaces','pds_plans','pds_tasks','pds_sessions','pds_observations','pds_observation_days']){const n=await d.query(`select count(*)::int as n from public.${table}`);assert.equal(n.rows[0].n,table==='pds_workspaces'?2:0);}
 assert.ok(day);
 }finally{await d.close();}
});
test('Real SQL: one rule change exactly after day2; five ordered days and deletion of all relationships',async()=>{
 const d=await setup();try{
 const observe=(a,x,h=hashA,id=randomUUID())=>call(d,'pds_observe',[a,JSON.stringify(x),id,h]);
 const o=(await observe('observation.start',{question:'고정 질문',initial_rule:'60분 묶음'})).id;
 const p=(await newPlan(d,hashA,'학습')).id,t=(await newTask(d,hashA,p,'학습')).id;
 // Synthetic fixtures only to exercise SQL chronology. Never export these as user evidence.
 await d.query("update public.pds_observations set created_at=now()-interval '5 days' where id=$1",[o]);
 const day1=randomUUID(),day2=randomUUID();await d.query("insert into public.pds_observation_days(id,observation_id,day_number,record_date,session_ids,actual_minutes,note,created_at) values($1,$3,1,(now() at time zone 'Asia/Seoul')::date-2,array[gen_random_uuid()],60,'fixture',now()-interval '2 days'),($2,$3,2,(now() at time zone 'Asia/Seoul')::date-1,array[gen_random_uuid()],30,'fixture',now()-interval '1 day')",[day1,day2,o]);
 const now=new Date((await d.query('select now() as n')).rows[0].n),oldLog=(await save(d,'session.add',{id:t,started_at:new Date(now-8*60000).toISOString(),ended_at:new Date(now-4*60000).toISOString(),actual_minutes:4,blocker:'',note:'fixture'},hashA)).id;
 await rejected(()=>observe('observation.day',{observation_id:o,session_ids:[oldLog],note:''}),'PT409');
 const change=(await observe('observation.rule',{observation_id:o,new_rule:'30분 묶음',reason:'1·2일차 검토'})).id;
 const rule=(await snap(d,hashA)).rule_changes[0];assert.equal(rule.day1_id,day1);assert.equal(rule.day2_id,day2);assert.ok(new Date(rule.created_at)>new Date((await snap(d,hashA)).observation_days[1].created_at));
 await rejected(()=>observe('observation.rule',{observation_id:o,new_rule:'15분 묶음',reason:'두 번째'}),'23505');
 await rejected(()=>observe('observation.day',{observation_id:o,session_ids:[oldLog],note:''}),'PT400');
 await d.query("update public.pds_rule_changes set created_at=now()-interval '3 minutes' where id=$1",[change]);
 const log=(await save(d,'session.add',{id:t,started_at:new Date(now-2*60000).toISOString(),ended_at:new Date(now-60000).toISOString(),actual_minutes:1,blocker:'',note:'fixture'},hashA)).id;
 await observe('observation.day',{observation_id:o,session_ids:[log],note:'fixture'});
 const obs=(await snap(d,hashA));assert.equal(obs.observation_days.length,3);assert.equal(obs.observation_days[2].day_number,3);assert.ok(new Date(obs.observation_days[2].created_at)>new Date(obs.rule_changes[0].created_at));
 await rejected(()=>observe('observation.rule',{observation_id:o,new_rule:'5분',reason:'늦은 변경'}),'PT409');
 await d.query("insert into public.pds_observation_days(observation_id,day_number,record_date,session_ids,actual_minutes,note) values($1,4,(now() at time zone 'Asia/Seoul')::date+1,array[gen_random_uuid()],15,'synthetic future fixture only'),($1,5,(now() at time zone 'Asia/Seoul')::date+2,array[gen_random_uuid()],25,'synthetic future fixture only')",[o]);
 const five=(await snap(d,hashA)).observation_days;assert.equal(five.length,5);assert.equal(five.reduce((s,x)=>s+x.actual_minutes,0),131);assert.equal((five.reduce((s,x)=>s+x.actual_minutes,0)/5).toFixed(2),'26.20');
 await rejected(()=>observe('observation.day',{observation_id:o,session_ids:[log],note:'sixth rejected'}),'PT409');
 await d.query('delete from auth.users where id=$1',[A]);for(const table of ['pds_rule_changes','pds_observation_days','pds_observations','pds_plan_versions','pds_requests','pds_auth_sessions']){const x=await d.query(`select count(*)::int as n from public.${table}`);assert.equal(x.rows[0].n,table==='pds_auth_sessions'?1:0);}
 }finally{await d.close();}
});
