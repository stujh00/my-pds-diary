export const seoulDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function targetTasks(data,planId,from,to){return data.tasks.filter(t=>!t.deleted_at&&t.plan_id===planId&&(!from||t.due_date>=from)&&(!to||t.due_date<=to));}
export function aggregate(data,tasks,today=seoulDate()){
 const ids=new Set(tasks.map(t=>t.id)),sessions=data.sessions.filter(s=>ids.has(s.task_id));
 const blocked=new Set(sessions.filter(s=>s.blocker.trim()).map(s=>s.task_id));
 const estimated=tasks.reduce((a,t)=>a+t.estimated_minutes,0),actual=sessions.reduce((a,s)=>a+s.actual_minutes,0);
 return {planned:tasks.length,done:tasks.filter(t=>t.status==='done').length,delayed:tasks.filter(t=>t.status!=='done'&&t.due_date<today).length,blocked:blocked.size,estimated,actual,difference:actual-estimated};
}
export function sortTasks(tasks,sort){return [...tasks].sort((a,b)=>{let c=sort==='priority'?a.priority-b.priority:sort==='estimate'?a.estimated_minutes-b.estimated_minutes:a.due_date.localeCompare(b.due_date);return c||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);});}
export const kstISO=value=>new Date(value+':00+09:00').toISOString();
