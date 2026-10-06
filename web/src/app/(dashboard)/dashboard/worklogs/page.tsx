import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, textParam, uuidParam, type SearchValues } from '@/lib/list-query'
import { TimesheetAdjustments, type Adjustment } from './_components/TimesheetAdjustments'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { localDate } from '@/lib/presentation'
import { WorklogTimesheetClient } from './_components/WorklogTimesheetClient'

export default async function WorklogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchValues>
}) {
  const params=await searchParams; const week=textParam(params.week)
  const logPage=pageNumber(params.log_page);const sheetPage=pageNumber(params.sheet_page)
  const adjustmentPage=pageNumber(params.adjustment_page);const project=uuidParam(params.project)
  const review=['approval','timesheet'].includes(textParam(params.tab))
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
  let logsQuery=supabase.from('work_worklog').select('*, work_issue:issue_id(title), project_project:project_id(name)',{count:'exact'})
    .eq('employee_id',employee.data?.id || '00000000-0000-0000-0000-000000000000').gte('logged_date',weekStart).lte('logged_date',weekEnd)
    .order('logged_date',{ascending:false}).order('id')
  let sheetsQuery=supabase.from('work_timesheet').select('*, hr_employee:employee_id(full_name), project_project:project_id(name)',{count:'exact'})
    .order('period_start',{ascending:false}).order('id')
  if(!review) sheetsQuery=sheetsQuery.eq('employee_id',employee.data?.id || '00000000-0000-0000-0000-000000000000')
  if(project){logsQuery=logsQuery.eq('project_id',project);sheetsQuery=sheetsQuery.eq('project_id',project)}
  const [worklogs, timesheets, projects, issues, adjustments] = await Promise.all([
    logsQuery.range((logPage-1)*PAGE_SIZE,logPage*PAGE_SIZE-1),
    sheetsQuery.range((sheetPage-1)*PAGE_SIZE,sheetPage*PAGE_SIZE-1),
    supabase
      .from('project_project')
      .select('id, name')
      .eq('status', 'active')
      .limit(1000),
    supabase
      .from('work_issue')
      .select('id, project_id, title')
      .not('status', 'in', '(cancelled)')
      .limit(1000),
    supabase.from('work_timesheet_adjustment')
      .select('*,work_timesheet:timesheet_id(*,hr_employee:employee_id(full_name),project_project:project_id(name)),work_timesheet_adjustment_line(worklog_id,previous_hours,proposed_hours)',{count:'exact'})
      .order('requested_at',{ascending:false}).order('id').range((adjustmentPage-1)*PAGE_SIZE,adjustmentPage*PAGE_SIZE-1),
  ])
  const weekly: {issue_id:string;project_id:string;logged_date:string;hours:number;issue_title:string;project_name:string}[]=[]
  let weeklyError=false
  if(employee.data && !['logs','approval','timesheet','adjustments'].includes(textParam(params.tab))) {
    for(let offset=0;;offset+=1000){
      let query=supabase.from('work_weekly_hours').select('*').eq('employee_id',employee.data.id)
        .gte('logged_date',weekStart).lte('logged_date',weekEnd).order('project_id').order('issue_id').order('logged_date')
      if(project) query=query.eq('project_id',project)
      const result=await query.range(offset,offset+999)
      if(result.error){weeklyError=true;break}
      weekly.push(...(result.data ?? []));if((result.data ?? []).length<1000) break
    }
  }
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
          failed={[employee, worklogs, timesheets, projects, issues, attendance, adjustments].some(
            (result) => !!result.error,
          ) || weeklyError}
        />
        <WorklogTimesheetClient
          currentUserId={user!.id}
          currentEmployee={employee.data}
          worklogs={formattedWorklogs}
          weeklyHours={weekly}
          logPage={logPage} logTotal={worklogs.count ?? 0}
          sheetPage={sheetPage} sheetTotal={timesheets.count ?? 0}
          timesheets={formattedTimesheets}
          projects={projects.data ?? []}
          issues={issues.data ?? []}
          attendance={attendance.data}
          weekStart={weekStart}
          weekEnd={weekEnd}
        />
        {params.tab==='adjustments' && <TimesheetAdjustments adjustments={(adjustments.data ?? []) as unknown as Adjustment[]}
          page={adjustmentPage} total={adjustments.count ?? 0} currentEmployeeId={employee.data?.id} currentUserId={user!.id} />}
      </main>
    </div>
  )
}
