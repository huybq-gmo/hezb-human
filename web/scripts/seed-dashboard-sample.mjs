import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createDashboardSampleData } from './fixtures/dashboard-sample-data.mjs'
import { getDatabaseEnv } from './supabase-db-config.mjs'

const appRequire = createRequire(import.meta.url)
const nextRequire = createRequire(appRequire.resolve('next/package.json'))
nextRequire('@next/env').loadEnvConfig(new URL('../', import.meta.url).pathname, true)

const apply = process.argv.includes('--apply')
const env = getDatabaseEnv(process.env)

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { errorOutput += chunk })
    child.on('error', () => reject(new Error('Không chạy được psql.')))
    child.on('close', (code) => {
      if (code === 0) return resolve(output.trim())
      const reason = /password authentication failed/i.test(errorOutput)
        ? 'mật khẩu database không hợp lệ'
        : /Network is unreachable|could not translate host|timeout expired|Connection refused/i.test(errorOutput)
          ? 'không kết nối được database'
          : 'SQL thất bại; transaction đã rollback'
      const dbError = errorOutput.split('\n').find((line) => /^\s*ERROR:/.test(line))?.trim()
      reject(new Error(`psql: ${reason}.${dbError ? ` ${dbError}` : ''}`))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(sql)
  })
}

function sqlValue(value) {
  if (value == null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Dữ liệu mẫu có số không hợp lệ.')
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function insertRows(table, columns, rows) {
  if (!rows.length) return ''
  return `insert into public.${table} (${columns.join(', ')}) values\n${rows
    .map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(', ')})`)
    .join(',\n')};\n`
}

const data = createDashboardSampleData()
const sampleEmployeeIds = data.hr_employee.map((employee) => employee.id)
const businessRows = await psql(`
select jsonb_build_object(
  'owner_count', (select count(*) from public.core_role_assignment
    where role='company_owner' and revoked_at is null and (expires_at is null or expires_at>now())),
  'owner_id', (select user_id::text from public.core_role_assignment
    where role='company_owner' and revoked_at is null and (expires_at is null or expires_at>now())
    order by granted_at, user_id limit 1),
  'employees', (select count(*) from public.hr_employee),
  'clients', (select count(*) from public.project_client),
  'projects', (select count(*) from public.project_project),
  'issues', (select count(*) from public.work_issue),
  'worklogs', (select count(*) from public.work_worklog),
  'timesheets', (select count(*) from public.work_timesheet),
  'allocations', (select count(*) from public.project_allocation)
)::text;
`)
const state = JSON.parse(businessRows)
if (Number(state.owner_count) !== 1 || !state.owner_id)
  throw new Error('Cần đúng một company_owner đang hoạt động để nạp dữ liệu mẫu.')
if (['employees', 'clients', 'projects', 'issues', 'worklogs', 'timesheets', 'allocations']
  .some((key) => Number(state[key]) !== 0))
  throw new Error(`Database không còn trống; seed dừng để không trộn dữ liệu. Số đếm: ${JSON.stringify(state)}.`)

const now = new Date().toISOString()
const ownerId = state.owner_id
const clients = data.project_client.map((row) => ({
  ...row,
  name: `Mẫu · ${row.name}`,
  code: `DEMO-${row.code}`,
  notes: 'Dữ liệu mẫu để xem dashboard.',
  created_by: ownerId,
  updated_by: ownerId,
  version: row.version ?? 1,
}))
const employees = data.hr_employee.map((row) => ({
  ...row,
  user_id: null,
  employee_code: `DEMO-${row.employee_code}`,
  full_name: `Mẫu · ${row.full_name}`,
  created_by: ownerId,
  updated_by: ownerId,
  version: row.version ?? 1,
}))
const projects = data.project_project.map((row) => ({
  ...row,
  name: `Mẫu · ${row.name}`,
  code: `DEMO-${row.code}`,
  description: `Dữ liệu mẫu: ${row.description}`,
  created_by: ownerId,
  updated_by: ownerId,
  version: row.version ?? 1,
}))
const milestones = data.project_milestone.map((row) => ({
  ...row,
  name: `Mẫu · ${row.name}`,
  description: 'Milestone mẫu để xem dashboard.',
  currency: row.currency || 'VND',
  created_by: ownerId,
  accepted_at: row.status === 'accepted' ? now : null,
  accepted_by: row.status === 'accepted' ? ownerId : null,
  version: row.version ?? 1,
}))
const issues = data.work_issue.map((row) => ({
  ...row,
  title: `Mẫu · ${row.title}`,
  parent_id: null,
  sprint_id: null,
  assignee_id: null,
  reporter_id: ownerId,
  created_by: ownerId,
  updated_by: ownerId,
}))
const worklogs = data.work_worklog.map((row) => ({
  ...row,
  description: `Dữ liệu mẫu: ${row.description}`,
  created_by: ownerId,
}))
const timesheets = data.work_timesheet.map((row) => ({
  ...row,
  created_by: ownerId,
  submitted_at: row.status === 'draft' ? null : now,
  locked_at: row.status === 'locked' ? now : null,
  locked_by: row.status === 'locked' ? ownerId : null,
}))
const timesheetLines = data.work_timesheet_line
const approvals = data.work_timesheet.flatMap((row) => {
  const decisions = row.status === 'leader_approved'
    ? ['leader']
    : ['pm_approved', 'locked'].includes(row.status)
      ? ['leader', 'pm']
      : []
  return decisions.map((step) => ({
    timesheet_id: row.id,
    step,
    decision: 'approved',
    decided_by: ownerId,
    decided_at: now,
  }))
})
const projectId = data.project_project[0].id
const allocationEmployeeIds = new Set(sampleEmployeeIds.slice(0, 2))
const allocations = data.project_allocation
  .filter((row) => row.project_id === projectId && allocationEmployeeIds.has(row.employee_id))
  .map((row) => ({
    ...row,
    requested_by: ownerId,
    decided_by: ownerId,
    decided_at: now,
    decision_reason: null,
    updated_by: ownerId,
    version: row.version ?? 1,
  }))
const lockedSheet = data.work_timesheet.find((row) => row.status === 'locked')

const sql = `begin;
do $$ begin
  if not exists (select 1 from public.core_role_assignment
    where user_id='${ownerId}'::uuid and role='company_owner' and revoked_at is null
      and (expires_at is null or expires_at>now())) then
    raise exception 'SEED_OWNER_CHANGED';
  end if;
  if exists (select 1 from public.hr_employee) or exists (select 1 from public.project_client)
    or exists (select 1 from public.project_project) or exists (select 1 from public.work_issue)
    or exists (select 1 from public.work_worklog) or exists (select 1 from public.work_timesheet)
    or exists (select 1 from public.project_allocation) then
    raise exception 'SEED_DATABASE_NOT_EMPTY';
  end if;
end $$;
${insertRows('project_client', ['id', 'name', 'code', 'address', 'website', 'notes', 'is_active', 'created_by', 'updated_by', 'version'], clients)}
${insertRows('hr_employee', ['id', 'user_id', 'employee_code', 'full_name', 'email', 'phone', 'type', 'status', 'hire_date', 'terminate_date', 'created_by', 'updated_by', 'version'], employees)}
${insertRows('project_project', ['id', 'client_id', 'name', 'code', 'description', 'status', 'billing_type', 'budget_amount', 'budget_currency', 'start_date', 'end_date', 'created_by', 'updated_by', 'version'], projects)}
${insertRows('project_milestone', ['id', 'project_id', 'name', 'description', 'due_date', 'budget_amount', 'currency', 'status', 'submitted_at', 'accepted_at', 'accepted_by', 'reject_reason', 'created_by', 'version'], milestones)}
${insertRows('work_issue', ['id', 'project_id', 'type', 'title', 'description', 'status', 'priority', 'story_points', 'due_date', 'board_order', 'parent_id', 'sprint_id', 'assignee_id', 'reporter_id', 'created_by', 'updated_by', 'version'], issues)}
${insertRows('work_worklog', ['id', 'issue_id', 'project_id', 'employee_id', 'logged_date', 'hours', 'description', 'work_type', 'is_billable', 'status', 'created_by', 'version'], worklogs)}
${insertRows('work_timesheet', ['id', 'employee_id', 'project_id', 'period_start', 'period_end', 'total_hours', 'status', 'submitted_at', 'locked_at', 'locked_by', 'created_by', 'version'], timesheets)}
${insertRows('work_timesheet_line', ['id', 'timesheet_id', 'worklog_id', 'hours', 'is_billable', 'logged_date'], timesheetLines)}
${insertRows('work_approval_step', ['timesheet_id', 'step', 'decision', 'decided_by', 'decided_at'], approvals)}
${insertRows('project_allocation', ['id', 'project_id', 'employee_id', 'project_role', 'allocation_percent', 'start_date', 'end_date', 'status', 'requested_by', 'decided_by', 'decided_at', 'decision_reason', 'updated_by', 'version'], allocations)}
insert into public.work_timesheet_period_lock(project_id, period_start, period_end, locked_by)
values (${sqlValue(lockedSheet.project_id)}, ${sqlValue(lockedSheet.period_start)}, ${sqlValue(lockedSheet.period_end)}, '${ownerId}'::uuid);
commit;
select jsonb_build_object(
  'sample_employees', (select count(*) from public.hr_employee where employee_code like 'DEMO-%'),
  'sample_clients', (select count(*) from public.project_client where code like 'DEMO-%'),
  'sample_projects', (select count(*) from public.project_project where code like 'DEMO-%'),
  'sample_issues', (select count(*) from public.work_issue where title like 'Mẫu · %'),
  'sample_approved_worklogs', (select count(*) from public.work_worklog where status='approved' and description like 'Dữ liệu mẫu:%'),
  'sample_timesheets', (select count(*) from public.work_timesheet where employee_id in (${sampleEmployeeIds.map((id) => `'${id}'::uuid`).join(', ')}))
)::text;
`

if (!apply) {
  console.log('Database trống, có một company_owner đang hoạt động.')
  console.log(`Sẵn sàng nạp: ${employees.length} nhân sự, ${clients.length} khách hàng, ${projects.length} dự án, ${issues.length} ticket, ${worklogs.length} worklog.`)
  console.log('Chưa ghi database. Thêm --apply để nạp dữ liệu mẫu đã gắn nhãn Mẫu/DEMO.')
} else {
  const result = await psql(sql)
  console.log(`Đã nạp dữ liệu mẫu: ${result}`)
}
