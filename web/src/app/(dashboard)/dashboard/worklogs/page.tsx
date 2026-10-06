import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { localDate } from '@/lib/presentation'
import { WorklogTimesheetClient } from './_components/WorklogTimesheetClient'

export default async function WorklogsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const today = localDate()
  const candidate =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week)
      ? new Date(`${week}T12:00:00Z`)
      : new Date(`${today}T12:00:00Z`)
  const date = Number.isNaN(candidate.getTime())
    ? new Date(`${today}T12:00:00Z`)
    : candidate
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  const weekStart = date.toISOString().slice(0, 10)
  date.setUTCDate(date.getUTCDate() + 6)
  const weekEnd = date.toISOString().slice(0, 10)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const employee = await supabase
    .from('hr_employee')
    .select('id, full_name')
    .eq('user_id', user!.id)
    .maybeSingle()
  const [worklogs, timesheets, projects, issues] = await Promise.all([
    employee.data
      ? supabase
          .from('work_worklog')
          .select(
            '*, work_issue:issue_id(title), project_project:project_id(name)',
          )
          .eq('employee_id', employee.data.id)
          .gte('logged_date', weekStart)
          .lte('logged_date', weekEnd)
          .order('logged_date', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('work_timesheet')
      .select(
        '*, hr_employee:employee_id(full_name), project_project:project_id(name)',
      )
      .order('period_start', { ascending: false })
      .limit(100),
    supabase
      .from('project_project')
      .select('id, name')
      .eq('status', 'active')
      .limit(100),
    supabase
      .from('work_issue')
      .select('id, project_id, title')
      .not('status', 'in', '(cancelled)')
      .limit(100),
  ])
  const attendance = employee.data
    ? await supabase
        .from('work_attendance')
        .select('id, work_date, check_in_at, check_out_at')
        .eq('employee_id', employee.data.id)
        .eq('work_date', today)
        .maybeSingle()
    : { data: null, error: null }
  const formattedWorklogs = (worklogs.data ?? []).map((w) => ({
    ...w,
    work_issue: Array.isArray(w.work_issue) ? w.work_issue[0] : w.work_issue,
    project_project: Array.isArray(w.project_project)
      ? w.project_project[0]
      : w.project_project,
  }))
  const formattedTimesheets = (timesheets.data ?? []).map((t) => ({
    ...t,
    hr_employee: Array.isArray(t.hr_employee)
      ? t.hr_employee[0]
      : t.hr_employee,
    project_project: Array.isArray(t.project_project)
      ? t.project_project[0]
      : t.project_project,
  }))
  return (
    <div className="page">
      <Topbar
        title="Timesheet"
        subtitle="Ghi nhận giờ làm và theo dõi quy trình duyệt"
      />
      <main id="main-content" className="page-content">
        <QueryNotice
          failed={[employee, worklogs, timesheets, projects, issues, attendance].some(
            (result) => !!result.error,
          )}
        />
        <WorklogTimesheetClient
          currentUserId={user!.id}
          currentEmployee={employee.data}
          worklogs={formattedWorklogs}
          timesheets={formattedTimesheets}
          projects={projects.data ?? []}
          issues={issues.data ?? []}
          attendance={attendance.data}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
      </main>
    </div>
  )
}
