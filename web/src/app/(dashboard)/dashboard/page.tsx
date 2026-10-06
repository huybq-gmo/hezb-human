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
import { formatDate } from '@/lib/presentation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const [
    employees,
    projects,
    issues,
    pending,
    health,
    utilization,
    ...statuses
  ] = await Promise.all([
    supabase
      .from('hr_employee')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('project_project')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase
      .from('work_issue')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(done,cancelled)'),
    supabase
      .from('work_timesheet')
      .select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'leader_approved']),
    supabase.from('dashboard_project_health').select('*').limit(50),
    supabase
      .from('dashboard_team_utilization')
      .select('*')
      .order('approved_hours', { ascending: false, nullsFirst: false })
      .limit(10),
    ...['draft', 'submitted', 'leader_approved', 'pm_approved', 'locked'].map(
      (status) =>
        supabase
          .from('work_timesheet')
          .select('id', { count: 'exact', head: true })
          .eq('status', status),
    ),
  ])
  const maxHours = Math.max(
    1,
    ...(utilization.data ?? []).map((row) => Number(row.approved_hours) || 0),
  )
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
        <QueryNotice
          failed={[
            employees,
            projects,
            issues,
            pending,
            health,
            utilization,
            ...statuses,
          ].some((result) => !!result.error)}
        />
        <MetricStrip
          items={[
            {
              label: 'Nhân sự đang hoạt động',
              value: employees.error ? '—' : (employees.count ?? 0),
              detail: 'Hồ sơ nhân sự hiện tại',
            },
            {
              label: 'Issue đang mở',
              value: issues.error ? '—' : (issues.count ?? 0),
              detail: 'Chưa hoàn thành hoặc hủy',
            },
            {
              label: 'Timesheet chờ duyệt',
              value: pending.error ? '—' : (pending.count ?? 0),
              detail: 'Chờ Leader hoặc PM',
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
            title="Giờ được duyệt theo nhân sự"
            action={
              <Link className="text-link" href="/dashboard/hr/employees">
                Xem nhân sự
              </Link>
            }
          >
            <div className="card-body">
              {!utilization.data?.length ? (
                <EmptyState
                  title={
                    utilization.error
                      ? 'Chưa tải được số liệu giờ làm'
                      : 'Chưa có giờ làm được duyệt'
                  }
                />
              ) : (
                utilization.data.map((row) => (
                  <div key={row.employee_id} className="utilization-row">
                    <span className="truncate" title={row.full_name}>
                      {row.full_name || 'Nhân sự'}
                    </span>
                    <Progress
                      label={`Giờ được duyệt của ${row.full_name}`}
                      value={Number(row.approved_hours) || 0}
                      max={maxHours}
                    />
                    <b className="num text-right">
                      {Number(row.approved_hours) || 0}h
                    </b>
                  </div>
                ))
              )}
              <p className="muted">
                Tổng giờ từ timesheet đã được PM duyệt hoặc đã khóa.
              </p>
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
          title="Sức khỏe dự án"
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
      </main>
    </div>
  )
}
