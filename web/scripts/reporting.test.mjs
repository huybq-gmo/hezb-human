import test from 'node:test'
import assert from 'node:assert/strict'
import { reportPeriod } from '../src/lib/report-period.mjs'
import { demoUtilization } from '../src/lib/demo/reporting.mjs'

test('Report periods reject impossible dates, reversed dates and excessive ranges', () => {
  assert.deepEqual(reportPeriod('','','2028-02-15'),{ start: '2028-02-01',end: '2028-02-29',invalid: false })
  for (const [start,end] of [['2026-02-30','2026-03-01'],['2026-10-08','2026-10-01'],['2025-01-01','2026-10-01'],['2026-10-01','']]) {
    assert.equal(reportPeriod(start,end,'2026-10-06').invalid,true)
  }
})

function fixture() {
  return {
    hr_employee: [{ id: 'e1',user_id: 'u1',full_name: 'Employee 1',status: 'active',hire_date: '2026-01-01' },
      { id: 'e2',user_id: 'u2',full_name: 'Employee 2',status: 'active',hire_date: '2026-01-01' }],
    project_membership: [{ user_id: 'u1',project_id: 'p1',status: 'active',start_date: '2026-01-01',end_date: null }],
    work_worklog: [{ employee_id: 'e1',project_id: 'p1',status: 'approved',logged_date: '2026-10-05',hours: 8 },
      { employee_id: 'e1',project_id: 'p1',status: 'draft',logged_date: '2026-10-05',hours: 12 },
      { employee_id: 'e1',project_id: 'p2',status: 'approved',logged_date: '2026-10-05',hours: 4 },
      { employee_id: 'e1',project_id: 'p1',status: 'approved',logged_date: '2026-09-30',hours: 10 }],
    hr_leave_request: [{ employee_id: 'e1',status: 'approved',start_date: '2026-10-06',end_date: '2026-10-06' },
      { employee_id: 'e1',status: 'pending',start_date: '2026-10-07',end_date: '2026-10-07' }],
    project_allocation: [{ employee_id: 'e1',project_id: 'p1',status: 'approved',start_date: '2026-10-05',end_date: '2026-10-11',allocation_percent: 50 }],
  }
}
const period = { p_start_date: '2026-10-05',p_end_date: '2026-10-11' }
test('Utilization excludes draft/out-of-period hours, weekends and approved leave', () => {
  const [employee] = demoUtilization(fixture(),period)
  assert.equal(employee.approved_hours,12)
  assert.equal(employee.capacity_hours,32)
  assert.equal(employee.utilization_pct,37.5)
  assert.equal(employee.active_projects,2)
})
test('Project utilization uses only the selected project and allocation', () => {
  const rows = demoUtilization(fixture(),{ ...period,p_project_id: 'p1' })
  assert.equal(rows.length,1)
  assert.equal(rows[0].approved_hours,8)
  assert.equal(rows[0].capacity_hours,16)
  assert.equal(rows[0].utilization_pct,50)
})
test('No capacity returns null, and report paging keeps the full employee count', () => {
  const rows = fixture()
  rows.project_allocation = []
  assert.equal(demoUtilization(rows,{ ...period,p_project_id: 'p1' })[0].utilization_pct,null)
  const page = demoUtilization(rows,{ ...period,p_offset: 1,p_limit: 1 })
  assert.equal(page.length,1)
  assert.equal(page[0].total_count,2)
  assert.throws(() => demoUtilization(rows,{ ...period,p_offset: -1 }),/INVALID_REPORT_RANGE/)
  assert.throws(() => demoUtilization(rows,{ ...period,p_start_date: 'invalid' }),/INVALID_REPORT_RANGE/)
})
