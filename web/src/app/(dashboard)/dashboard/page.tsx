import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import {
  Card,
  EmptyState,
  MetricStrip,
  Progress,
  QueryNotice,
} from '@/components/ui'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, localDate } from '@/lib/presentation'
import { reportPeriod } from '@/lib/report-period.mjs'
import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, uuidParam, textParam, type SearchValues } from '@/lib/list-query'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const params = await searchParams
  const projectId = uuidParam(params.project)
  const period = reportPeriod(textParam(params.start), textParam(params.end), localDate())
  const utilizationPage = pageNumber(params.utilPage)
  const healthPage = pageNumber(params.healthPage)
  const supabase = await createClient()
  function timesheetCount(status: string[]) {
    let query = supabase.from('work_timesheet').select('id', { count: 'exact', head: true })
      .in('status', status).lte('period_start', period.end).gte('period_end', period.start)
    if (projectId) query = query.eq('project_id', projectId)
    return query
  }
  let projectQuery = supabase.from('project_project').select('id', { count: 'exact', head: true }).eq('status', 'active')
  let issueQuery = supabase.from('work_issue').select('id', { count: 'exact', head: true }).not('status', 'in', '(done,cancelled)')
  let healthQuery = supabase.from('dashboard_project_health').select('*', { count: 'exact' }).order('project_id')
  if (projectId) {
    projectQuery = projectQuery.eq('id', projectId)
    issueQuery = issueQuery.eq('project_id', projectId)
    healthQuery = healthQuery.eq('project_id', projectId)
  }
  const [
    employees,
    projects,
    issues,
    pending,
    health,
    utilization,
    projectOptions,
    ...statuses
  ] = await Promise.all([
    supabase
      .from('hr_employee')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    projectQuery,
    issueQuery,
    timesheetCount(['submitted', 'leader_approved']),
    healthQuery.range((healthPage - 1) * PAGE_SIZE, healthPage * PAGE_SIZE - 1),
    supabase.rpc('get_dashboard_utilization', {
      p_start_date: period.start, p_end_date: period.end, p_project_id: projectId || null,
      p_offset: (utilizationPage - 1) * PAGE_SIZE, p_limit: PAGE_SIZE,
    }),
    supabase.from('project_project').select('id,name').order('name').limit(1000),
    ...['draft', 'submitted', 'leader_approved', 'pm_approved', 'locked'].map(
      (status) =>
        timesheetCount([status]),
    ),
  ])
  const utilizationRows = (utilization.data ?? []) as {
    employee_id: string; full_name: string; approved_hours: number; capacity_hours: number;
    utilization_pct: number | null; active_projects: number; total_count: number
  }[]
  const statusNames = [
    'draft',
    'submitted',
    'leader_approved',
    'pm_approved',
    'locked',
  ]
  return (
    <div className="page">
      <Topbar
        title="Dashboard"
        subtitle={`Tổng quan vận hành · ${formatDate(new Date().toISOString())}`}
      />
      <main id="main-content" className="page-content">
        <form method="get" className="toolbar">
          <label htmlFor="report-project">Dự án</label><select id="report-project" name="project" defaultValue={projectId}>
            <option value="">Tất cả dự án</option>{(projectOptions.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <label htmlFor="report-start">Từ ngày</label><input id="report-start" name="start" type="date" required defaultValue={period.start} />
          <label htmlFor="report-end">Đến ngày</label><input id="report-end" name="end" type="date" required defaultValue={period.end} />
          <button className="btn sm" type="submit">Áp dụng</button>
        </form>
        {period.invalid && <p className="notice error" role="alert">Khoảng ngày không hợp lệ hoặc dài quá 366 ngày. Đang hiển thị tháng hiện tại.</p>}
        <QueryNotice
          failed={[
            employees,
            projects,
            issues,
            pending,
            health,
            utilization,
            projectOptions,
            ...statuses,
          ].some((result) => !!result.error)}
        />
        <MetricStrip
          items={[
            {
              label: 'Nhân sự đang hoạt động',
              value: projectId ? (utilization.error ? '—' : (utilizationRows[0]?.total_count ?? 0)) : employees.error ? '—' : (employees.count ?? 0),
              detail: projectId ? 'Nhân sự trong dự án và kỳ đã chọn' : 'Hồ sơ nhân sự hiện tại',
            },
            {
              label: 'Issue đang mở',
              value: issues.error ? '—' : (issues.count ?? 0),
              detail: 'Trạng thái hiện tại, theo dự án',
            },
            {
              label: 'Timesheet chờ duyệt',
              value: pending.error ? '—' : (pending.count ?? 0),
              detail: 'Kỳ giao với khoảng ngày đã chọn',
            },
            {
              label: 'Dự án đang chạy',
              value: projects.error ? '—' : (projects.count ?? 0),
              detail: 'Dự án đang hoạt động',
            },
          ]}
        />
        <div className="two-columns">
          <Card
            title="Utilization theo nhân sự trong kỳ"
            action={
              <Link className="text-link" href="/dashboard/hr/employees">
                Xem nhân sự
              </Link>
            }
          >
            <div className="card-body">
              {!utilizationRows.length ? (
                <EmptyState
                  title={
                    utilization.error
                      ? 'Chưa tải được số liệu giờ làm'
                      : 'Chưa có giờ làm được duyệt'
                  }
                />
              ) : (
                utilizationRows.map((row) => (
                  <div key={row.employee_id} className="utilization-row">
                    <span className="truncate" title={row.full_name}>
                      {row.full_name || 'Nhân sự'}
                    </span>
                    <Progress
                      label={`Giờ được duyệt của ${row.full_name}`}
                      value={Number(row.utilization_pct) || 0}
                      max={100}
                    />
                    <b className="num text-right">
                      {row.utilization_pct == null ? '—' : `${Number(row.utilization_pct)}%`}
                      <small className="block muted">{Number(row.approved_hours)}h / {Number(row.capacity_hours)}h</small>
                      <small className="block muted">{Number(row.active_projects)} dự án có giờ đã duyệt</small>
                    </b>
                  </div>
                ))
              )}
              <p className="muted">
                Giờ đã duyệt / capacity trong kỳ. Capacity tính 8h mỗi ngày làm việc, trừ nghỉ phép đã duyệt; khi lọc dự án, dùng allocation đã duyệt. Không có capacity sẽ hiển thị “—”.
              </p>
              <Pagination page={utilizationPage} total={utilizationRows[0]?.total_count ?? 0} parameter="utilPage" />
            </div>
          </Card>
          <Card
            title="Trạng thái timesheet"
            action={
              <Link
                href="/dashboard/worklogs?tab=approval"
                className="text-link"
              >
                Xem tất cả
              </Link>
            }
          >
            <div className="card-body">
              {statuses.map((result, index) => (
                <div key={statusNames[index]} className="summary-row">
                  <StatusBadge status={statusNames[index]} />
                  <b className="num">
                    {result.error ? '—' : (result.count ?? 0)}
                  </b>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card
          title="Sức khỏe dự án hiện tại"
          action={
            <Link href="/dashboard/projects" className="text-link">
              Quản lý dự án →
            </Link>
          }
        >
          {!health.data?.length ? (
            <EmptyState
              title={
                health.error
                  ? 'Chưa tải được sức khỏe dự án'
                  : 'Chưa có dự án đang hoạt động'
              }
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Tình trạng</th>
                    <th>Tiến độ công việc</th>
                    <th>Issue quá hạn</th>
                    <th>Milestone quá hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {health.data.map((project) => {
                    const done = Number(project.issues_done) || 0
                    const total =
                      done +
                      (Number(project.issues_open) || 0) +
                      (Number(project.issues_backlog) || 0)
                    const percent = total ? Math.round((done / total) * 100) : 0
                    const overdue =
                      Number(project.issues_overdue) ||
                      Number(project.milestones_overdue) ||
                      0
                    return (
                      <tr key={project.project_id}>
                        <td>
                          <Link
                            className="primary hover:text-[var(--pri)]"
                            href={`/dashboard/projects/${project.project_id}`}
                          >
                            {project.project_name}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge
                            status={overdue ? 'overdue' : 'on_track'}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-32">
                              <Progress
                                value={percent}
                                label={`Tiến độ ${project.project_name}`}
                              />
                            </div>
                            <span className="num">{percent}%</span>
                          </div>
                        </td>
                        <td className="num">{project.issues_overdue ?? 0}</td>
                        <td className="num">
                          {project.milestones_overdue ?? 0}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Pagination page={healthPage} total={health.count ?? 0} parameter="healthPage" />
      </main>
    </div>
  )
}
