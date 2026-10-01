// Date-only arithmetic uses UTC so browser timezone cannot shift calendar dates.
const iso = date => date.toISOString().slice(0,10);
export function shiftMonth(month, delta) {
 const [year,number]=month.split('-').map(Number);
 return iso(new Date(Date.UTC(year,number-1+delta,1))).slice(0,7);
}
export function monthGrid(month) {
 const [year,number]=month.split('-').map(Number);
 const first=new Date(Date.UTC(year,number-1,1)),last=new Date(Date.UTC(year,number,0));
 const offset=(first.getUTCDay()+6)%7,days=last.getUTCDate();
 const cells=Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>iso(new Date(Date.UTC(year,number-1,1-offset+i))));
 return {first:iso(first),last:iso(last),cells};
}
export function onDate(task, date) {
 return !task.deleted_at && (task.start_date||task.due_date)<=date && date<=task.due_date;
}
export function monthTasks(tasks,month,planId='',status='all') {
 const {first,last}=monthGrid(month);
 return tasks.filter(t=>!t.deleted_at&&(!planId||t.plan_id===planId)&&(status==='all'||t.status===status)&&(t.start_date||t.due_date)<=last&&t.due_date>=first)
  .sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
