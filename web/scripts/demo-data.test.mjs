import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {
  createDemoData,
  OWNER_ID,
  ISSUE_ID,
  PROJECT_ID,
} from '../src/lib/demo/data.mjs'
import {
  createDemoFetch,
  createDemoSession,
  DEMO_URL,
  DEMO_KEY,
  DEMO_STORAGE_KEY,
} from '../src/lib/demo/transport.mjs'

function client(fixtures) {
  const values = new Map([
    [DEMO_STORAGE_KEY, JSON.stringify(createDemoSession())],
  ])
  return createClient(DEMO_URL, DEMO_KEY, {
    global: { fetch: createDemoFetch(fixtures) },
    auth: {
      storageKey: DEMO_STORAGE_KEY,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
    },
  })
}

test('New read-only pages link contacts, sprint issues and team skills', () => {
  const rows = createDemoData()
  for (const client of rows.project_client) {
    const contacts = rows.project_client_contact.filter((contact) => contact.client_id === client.id)
    assert.equal(contacts.length,2)
    assert.equal(contacts.filter((contact) => contact.is_primary).length,1)
  }
  for (const issue of rows.work_issue) {
    if (issue.sprint_id) assert.equal(rows.work_sprint.find((sprint) => sprint.id === issue.sprint_id)?.project_id,issue.project_id)
    if (issue.parent_id) assert.equal(rows.work_issue.find((parent) => parent.id === issue.parent_id)?.project_id,issue.project_id)
  }
  assert.equal(rows.hr_team_skill_matrix.length,rows.hr_employee.filter((employee) => employee.status === 'active').length)
})

test('Directories filter before pagination, including matches after the first 100 records', async()=>{
 const rows=createDemoData()
 rows.admin_role_directory=Array.from({length:125},(_,index)=>({...rows.admin_role_directory[0],id:String(index),full_name:index===124?'Target last':'Employee',role:'developer'}))
 const supabase=client(rows)
 const paged=await supabase.from('admin_role_directory').select('*',{count:'exact'}).eq('role','developer').order('id').range(100,149)
 assert.equal(paged.error,null);assert.equal(paged.count,125);assert.equal(paged.data.length,25)
 const filtered=await supabase.from('admin_role_directory').select('*',{count:'exact'}).ilike('full_name','%Target%').range(0,49)
 assert.equal(filtered.count,1);assert.equal(filtered.data[0].id,'124')
 const member=await supabase.from('admin_membership_directory').select('*').eq('project_id',PROJECT_ID).eq('effective_status','active')
 assert.equal(member.data.length,3);assert(member.data.every(row=>row.full_name&&row.project_name))
})

test('Weekly totals use all logs and adjustment proposals remain read-only in demo',async()=>{
 const rows=createDemoData();const supabase=client(rows)
 const weekly=await supabase.from('work_weekly_hours').select('*')
 assert.equal(weekly.error,null)
 assert.equal(weekly.data.reduce((sum,row)=>sum+row.hours,0),rows.work_worklog.reduce((sum,row)=>sum+row.hours,0))
 const adjustments=await supabase.from('work_timesheet_adjustment').select('*')
 const proposed=adjustments.data[0]
 assert.equal(proposed.work_timesheet.status,'locked');assert.equal(proposed.work_timesheet_adjustment_line.length,1)
 for(const rpc of ['propose_timesheet_adjustment','resolve_timesheet_adjustment']) {
   const result=await supabase.rpc(rpc,{})
   assert.equal(result.error.code,'DEMO_READ_ONLY')
 }
})

test('Demo supports dashboard reporting reads while still rejecting report writes', async () => {
  const supabase = client()
  const rows = createDemoData()
  const sheet = rows.work_timesheet.find((sheet) => sheet.status === 'pm_approved')
  const result = await supabase.rpc('get_dashboard_utilization',{
    p_start_date: sheet.period_start,p_end_date: sheet.period_end,p_project_id: sheet.project_id,p_offset: 0,p_limit: 50,
  })
  assert.equal(result.error,null)
  assert.equal(result.data.find((row) => row.employee_id === sheet.employee_id).approved_hours,sheet.total_hours)
  const invalid = await supabase.rpc('get_dashboard_utilization',{ p_start_date: '2026-02-30',p_end_date: '2026-03-01' })
  assert.equal(invalid.error.code,'INVALID_REPORT_RANGE')
  const denied = await supabase.rpc('set_issue_parent',{ p_issue_id: ISSUE_ID,p_parent_id: null,p_expected_version: 1 })
  assert.equal(denied.error.code,'DEMO_READ_ONLY')
})

test('Fixtures link employee, member, issue and worklog detail pages', () => {
  const rows = createDemoData()
  assert.equal(rows.hr_employee.length, 12)
  assert.equal(rows.project_project.length, 5)
  assert.equal(rows.work_issue.length, 18)
  const projects = new Set(rows.project_project.map((row) => row.id))
  const profiles = new Set(rows.core_user_profile.map((row) => row.id))
  const issues = new Map(rows.work_issue.map((row) => [row.id, row]))
  for (const employee of rows.hr_employee) {
    assert(profiles.has(employee.user_id))
    assert(employee.full_name && employee.job_title)
  }
  for (const member of rows.project_membership)
    assert(projects.has(member.project_id) && profiles.has(member.user_id))
  for (const issue of rows.work_issue)
    assert(projects.has(issue.project_id) && profiles.has(issue.assignee_id))
  for (const log of rows.work_worklog)
    assert.equal(issues.get(log.issue_id)?.project_id, log.project_id)
  assert.deepEqual(
    new Set(rows.hr_employee.map((row) => row.status)),
    new Set(['active', 'onboarding', 'offboarding', 'terminated']),
  )
})

test('Dashboard totals agree with timesheets and issue lists', () => {
  const rows = createDemoData()
  for (const employee of rows.dashboard_team_utilization) {
    const hours = rows.work_timesheet
      .filter(
        (sheet) =>
          sheet.employee_id === employee.employee_id &&
          ['pm_approved', 'locked'].includes(sheet.status),
      )
      .reduce((sum, sheet) => sum + sheet.total_hours, 0)
    assert.equal(employee.approved_hours, hours)
  }
  for (const health of rows.dashboard_project_health) {
    const issues = rows.work_issue.filter(
      (issue) => issue.project_id === health.project_id,
    )
    assert.equal(
      health.issues_overdue,
      issues.filter((issue) => issue.is_overdue).length,
    )
    assert.equal(
      health.issues_done + health.issues_open + health.issues_backlog,
      issues.filter((issue) => issue.status !== 'cancelled').length,
    )
  }
})

test('The real Supabase SDK can read the local preview session, claims and roles', async () => {
  const supabase = client()
  const user = await supabase.auth.getUser()
  const claims = await supabase.auth.getClaims()
  const roles = await supabase.rpc('get_my_roles')
  assert.equal(user.error, null)
  assert.equal(user.data.user.id, OWNER_ID)
  assert.equal(claims.data.claims.sub, OWNER_ID)
  assert.deepEqual(roles.data, [{ role: 'company_owner' }])
})

test('Counts, date filters, search, pagination and nested relations work through the SDK', async () => {
  const supabase = client()
  const count = await supabase
    .from('hr_employee')
    .select('id', { head: true, count: 'exact' })
    .eq('status', 'active')
  assert.equal(count.count, 9)
  const page = await supabase
    .from('hr_employee')
    .select('*', { count: 'exact' })
    .order('employee_code')
    .range(2, 4)
  assert.equal(page.data.length, 3)
  assert.equal(page.count, 12)
  const search = await supabase
    .from('hr_employee')
    .select('*')
    .or('full_name.ilike.%Lan%,employee_code.ilike.%Lan%')
  assert.equal(search.data[0].full_name, 'Lan Phạm')
  assert.equal(search.data.length, 1)
  const issue = await supabase
    .from('work_issue')
    .select('*, project_project:project_id(name)')
    .eq('id', ISSUE_ID)
    .maybeSingle()
  assert.equal(issue.data.project_project.name, 'Cổng thanh toán Vina')
  const members = await supabase
    .from('project_membership')
    .select('*')
    .eq('user_id', OWNER_ID)
    .is('end_date', null)
  assert.equal(members.data.length, 4)
  const logs = await supabase
    .from('work_worklog')
    .select('*')
    .gte('logged_date', '2000-01-01')
    .lte('logged_date', '2999-01-01')
    .eq('project_id', PROJECT_ID)
  assert.equal(logs.data.length, 18)
  assert.equal(logs.data.filter((log) => log.status === 'draft').length,8)
  assert.equal(logs.data.filter((log) => log.status === 'approved').length,10)
})

test('Missing detail records return null for maybeSingle and an error for single', async () => {
  const supabase = client()
  const missing = await supabase
    .from('hr_employee')
    .select('*')
    .eq('id', 'missing')
    .maybeSingle()
  assert.equal(missing.data, null)
  assert.equal(missing.error, null)
  const required = await supabase
    .from('hr_employee')
    .select('*')
    .eq('id', 'missing')
    .single()
  assert.equal(required.error.code, 'PGRST116')
})

test('Writes, business RPCs and uploads are rejected without changing fixtures', async () => {
  const supabase = client()
  const before = await supabase.from('hr_employee').select('*')
  const insert = await supabase
    .from('hr_employee')
    .insert({ full_name: 'Should not save' })
  const update = await supabase
    .from('hr_employee')
    .update({ full_name: 'Should not change' })
    .eq('user_id', OWNER_ID)
  const rpc = await supabase.rpc('assign_role', {
    p_user_id: OWNER_ID,
    p_role: 'developer',
  })
  const upload = await supabase.storage
    .from('issue-attachments')
    .upload('test.txt', new Blob(['test']))
  assert.equal(insert.error.code, 'DEMO_READ_ONLY')
  assert.equal(update.error.code, 'DEMO_READ_ONLY')
  assert.equal(rpc.error.code, 'DEMO_READ_ONLY')
  assert.equal(upload.error.status, 403)
  assert.deepEqual(
    (await supabase.from('hr_employee').select('*')).data,
    before.data,
  )
})

test('Transport rejects other hosts and unauthenticated reads', async () => {
  const fetch = createDemoFetch()
  assert.equal(
    (await fetch('https://example.supabase.co/rest/v1/hr_employee')).status,
    403,
  )
  assert.equal((await fetch(`${DEMO_URL}/rest/v1/hr_employee`)).status, 401)
})
