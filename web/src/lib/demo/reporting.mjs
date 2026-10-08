import { reportPeriod } from '../report-period.mjs'

export function demoUtilization(rows, args) {
  const { p_start_date: start, p_end_date: end, p_project_id: project = null, p_offset: offset = 0, p_limit: limit = 50 } = args
  if (!start || !end || reportPeriod(start,end,'2000-01-01').invalid || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('INVALID_REPORT_RANGE')
  }
  const employees = rows.hr_employee.filter((employee) => employee.status === 'active' && (!project ||
    rows.project_membership.some((member) => member.user_id === employee.user_id && member.project_id === project &&
      member.status === 'active' && !member.revoked_at && member.start_date <= end && (!member.end_date || member.end_date >= start)) ||
    rows.work_worklog.some((log) => log.employee_id === employee.id && log.project_id === project && log.logged_date >= start && log.logged_date <= end)))
  const result = employees.map((employee) => {
    const logs = rows.work_worklog.filter((log) => log.employee_id === employee.id && log.status === 'approved' &&
      log.logged_date >= start && log.logged_date <= end && (!project || log.project_id === project))
    const approved_hours = logs.reduce((sum,log) => sum + Number(log.hours),0)
    let capacity_hours = 0
    const day = new Date(`${start}T12:00:00Z`)
    for (; day.toISOString().slice(0,10) <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0,10)
      if ([0,6].includes(day.getUTCDay()) || (employee.hire_date && date < employee.hire_date) ||
        (employee.terminate_date && date > employee.terminate_date) || rows.hr_leave_request.some((leave) =>
          leave.employee_id === employee.id && leave.status === 'approved' && leave.start_date <= date && leave.end_date >= date)) continue
      const percent = project ? Math.min(100,rows.project_allocation.filter((allocation) => allocation.employee_id === employee.id &&
        allocation.project_id === project && allocation.status === 'approved' && allocation.start_date <= date && allocation.end_date >= date)
        .reduce((sum,allocation) => sum + Number(allocation.allocation_percent),0)) : 100
      capacity_hours += 8 * percent / 100
    }
    return { employee_id: employee.id,full_name: employee.full_name,approved_hours,capacity_hours,
      utilization_pct: capacity_hours ? Math.round(approved_hours * 10000 / capacity_hours) / 100 : null,
      active_projects: new Set(logs.map((log) => log.project_id)).size,total_count: employees.length,
    }
  }).sort((a,b) => b.approved_hours - a.approved_hours || a.full_name.localeCompare(b.full_name,'vi') || a.employee_id.localeCompare(b.employee_id))
  return result.slice(offset,offset + limit)
}
