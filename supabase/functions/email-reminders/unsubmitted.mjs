function clean(value) {
 return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,180)
}

/** One daily reminder per employee, covering all projects with missing submission. */
export function groupUnsubmitted(rows) {
 const groups=new Map()
 for(const row of rows) {
   if(!row.user_id || !row.employee_id) continue
   const key=`${row.employee_id}:${row.period_start}:${row.period_end}`
   const group=groups.get(key) || {
     entityId:row.employee_id,recipientId:row.user_id,name:clean(row.full_name),
     start:row.period_start,end:row.period_end,projects:new Map(),
   }
   group.projects.set(row.project_id,{name:clean(row.project_name),hours:Number(row.draft_hours) || 0})
   groups.set(key,group)
 }
 return [...groups.values()]
}

export function unsubmittedReminder(group,email) {
 const projects=[...group.projects.values()]
 const hours=projects.reduce((sum,project)=>sum+project.hours,0)
 const names=projects.slice(0,10).map(project=>project.name).join(', ')
 return {
   type:'timesheet_unsubmitted',entityId:group.entityId,recipientId:group.recipientId,email,
   subject:'Bạn chưa nộp đầy đủ timesheet tuần trước',
   message:`${group.name || 'Bạn'} chưa nộp đầy đủ timesheet kỳ ${group.start} đến ${group.end} cho ${names}${projects.length>10?` và ${projects.length-10} dự án khác`:''}.${hours>0?` Có ${Math.round(hours*100)/100} giờ nháp chưa gửi.`:''} Vui lòng kiểm tra giờ làm và gửi duyệt.`,
   link:`/dashboard/worklogs?week=${encodeURIComponent(group.start)}`,
 }
}
