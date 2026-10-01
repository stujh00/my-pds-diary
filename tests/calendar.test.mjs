import test from 'node:test';import assert from 'node:assert/strict';
import {monthGrid,shiftMonth,onDate,monthTasks} from '../public/calendar.js';
const task=(id,start,due,extra={})=>({id,start_date:start,due_date:due,plan_id:'A',status:'open',created_at:'2026-10-01T00:00:00Z',deleted_at:null,...extra});
test('Calendar Monday grid, leap year and year boundary are timezone independent',()=>{
 const oct=monthGrid('2026-10');assert.equal(oct.first,'2026-10-01');assert.equal(oct.last,'2026-10-31');assert.equal(oct.cells[0],'2026-09-28');assert.equal(oct.cells.at(-1),'2026-11-01');assert.equal(oct.cells.length,35);
 assert.equal(monthGrid('2024-02').last,'2024-02-29');assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('Calendar includes start and due dates; legacy tasks appear only on due date; deleted excluded',()=>{
 const t=task('a','2026-09-29','2026-10-02');assert.ok(onDate(t,'2026-09-29'));assert.ok(onDate(t,'2026-10-02'));assert.ok(!onDate(t,'2026-10-03'));
 assert.ok(!onDate(task('b',null,'2026-10-02'),'2026-10-01'));assert.ok(onDate(task('b',null,'2026-10-02'),'2026-10-02'));assert.ok(!onDate({...t,deleted_at:'2026-10-01'},'2026-10-01'));
});
test('Calendar overlapping month count is unique; filters and stable order respect selected plan/status',()=>{
 const list=[task('z','2026-09-01','2026-11-01'),task('b',null,'2026-10-02'),task('a',null,'2026-10-02',{status:'done',plan_id:'B'}),task('del',null,'2026-10-03',{deleted_at:'2026-10-01'}),task('out',null,'2026-11-03')];
 assert.deepEqual(monthTasks(list,'2026-10').map(t=>t.id),['a','b','z']);assert.deepEqual(monthTasks(list,'2026-10','B','done').map(t=>t.id),['a']);assert.deepEqual(monthTasks(list,'2026-10','A','open').map(t=>t.id),['b','z']);assert.deepEqual(monthTasks([],'2026-10'),[]);
});
