import test from 'node:test'
import assert from 'node:assert/strict'
import { groupUnsubmitted, unsubmittedReminder } from '../../supabase/functions/email-reminders/unsubmitted.mjs'

const row={employee_id:'employee',user_id:'user',full_name:'Nguyễn An',project_id:'project',project_name:'Dự án A',draft_hours:8,period_start:'2025-12-29',period_end:'2026-01-04'}
test('Missing submissions group projects per employee and deduplicate membership rows',()=>{
 const groups=groupUnsubmitted([row,row,{...row,project_id:'other',project_name:'B',draft_hours:2},{...row,employee_id:'another',user_id:'another-user'},{...row,user_id:null}])
 assert.equal(groups.length,2);assert.equal(groups[0].projects.size,2)
 const reminder=unsubmittedReminder(groups[0],'an@example.test')
 assert.equal(reminder.entityId,row.employee_id);assert.equal(reminder.recipientId,row.user_id)
 assert.equal(reminder.type,'timesheet_unsubmitted');assert.match(reminder.message,/10 giờ nháp/)
 assert.equal(reminder.link,'/dashboard/worklogs?week=2025-12-29')
})
test('Employees with no worklog receive a submission reminder without inventing hours',()=>{
 const reminder=unsubmittedReminder(groupUnsubmitted([{...row,draft_hours:0}])[0],'an@example.test')
 assert.match(reminder.subject,/chưa nộp/);assert(!reminder.message.includes('giờ nháp'))
})
test('Separate completed periods stay separate; names cannot introduce control characters',()=>{
 const groups=groupUnsubmitted([row,{...row,full_name:'An\n\u0000',project_name:'B\r\nC',period_start:'2026-01-05',period_end:'2026-01-11'}])
 assert.equal(groups.length,2)
 const reminder=unsubmittedReminder(groups[1],'an@example.test')
 assert(!/[\u0000-\u001f\u007f]/.test(reminder.message))
})
