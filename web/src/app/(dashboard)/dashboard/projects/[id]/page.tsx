import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { HexagonAvatar } from '@/components/HezbLogo'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, EmptyState, MetricStrip, QueryNotice } from '@/components/ui'
import {
  effectiveMembershipStatus,
  formatDate,
  formatCompactMoney,
  PROJECT_ROLES,
} from '@/lib/presentation'
import { getWorkspaceUser } from '@/lib/workspace'
import { ProjectAllocationClient } from './_components/ProjectAllocationClient'
import { ProjectSprintClient } from './_components/ProjectSprintClient'
import { ProjectMilestoneClient } from './_components/ProjectMilestoneClient'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: project, error } = await supabase
    .from('project_project')
    .select('*, project_client:client_id(name)')
    .eq('id', id)
    .maybeSingle()
  if (!project && !error) notFound()
  if (!project)
    return (
      <div className="page">
        <Topbar title="Chi tiết dự án" />
        <main id="main-content" className="page-content">
          <QueryNotice failed />
          <Link href="/dashboard/projects" className="text-link">
            ← Danh sách dự án
          </Link>
        </main>
      </div>
    )
  const [members, milestones, logs, profiles, allocations, employees, sprints, issues, financeCost, user] = await Promise.all([
    supabase
      .from('project_membership')
      .select('*')
      .eq('project_id', id)
      .order('start_date')
      .limit(100),
    supabase
      .from('project_milestone')
      .select('*')
      .eq('project_id', id)
      .order('due_date', { ascending: true })
      .limit(100),
    supabase
      .from('work_worklog')
      .select(
        '*, hr_employee:employee_id(full_name), work_issue:issue_id(title)',
      )
      .eq('project_id', id)
      .order('logged_date', { ascending: false })
      .limit(20),
    supabase.from('core_user_profile').select('id, full_name').limit(100),
    supabase.from('project_allocation').select('*, hr_employee:employee_id(full_name, user_id)').eq('project_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('hr_employee').select('id, full_name').eq('status', 'active').order('full_name').limit(100),
    supabase.from('work_sprint').select('*').eq('project_id', id).order('start_date').limit(100),
    supabase.from('work_issue').select('id, title, status, sprint_id').eq('project_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('finance_project_cost_summary').select('*').eq('project_id', id).maybeSingle(),
    getWorkspaceUser(),
  ])
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
  )
  const client = Array.isArray(project.project_client)
    ? project.project_client[0]
    : project.project_client
  const nextMilestone = milestones.data?.find((m) => m.status !== 'accepted')
  const canSeeBudget =
    user?.roles.some((role) =>
      [
        'company_owner',
        'director',
        'finance_admin',
        'project_manager',
      ].includes(role),
    ) ||
    user?.memberships.some(
      (m) => m.project_id === id && m.project_role === 'pm',
    )
  return (
    <div className="page">
      <Topbar
        title={project.name}
        subtitle={`${client?.name || 'Dự án'} · ${project.code || ''}`}
      />
      <main id="main-content" className="page-content">
        <div className="toolbar toolbar-between">
          <div className="toolbar">
            <Link href="/dashboard/projects" className="text-link">
              ← Dự án
            </Link>
            <StatusBadge status={project.status} />
            <span className="muted">
              {formatDate(project.start_date)} → {formatDate(project.end_date)}
            </span>
          </div>
          <Link
            className="btn sm ghost"
            href={`/dashboard/issues?project=${id}`}
          >
            Mở board
          </Link>
        </div>
        <QueryNotice
          failed={[members, milestones, logs, profiles, allocations, employees, sprints, issues, financeCost].some(
            (result) => !!result.error,
          )}
        />
        <MetricStrip
          items={[
            {
              label: 'Ngân sách dự án',
              value: canSeeBudget
                ? formatCompactMoney(
                    project.budget_amount,
                    project.budget_currency || project.currency,
                  )
                : '—',
              detail: canSeeBudget
                ? 'Theo đề xuất đã duyệt'
                : 'Chỉ người có quyền xem',
            },
            {
              label: 'Thành viên',
              value:
                members.data?.filter(
                  (m) => effectiveMembershipStatus(m) === 'active',
                ).length ?? '—',
              detail: 'Thành viên đang hoạt động',
            },
            {
              label: 'Milestone',
              value: milestones.data?.length ?? '—',
              detail: `${milestones.data?.filter((m) => m.status === 'accepted').length ?? 0} đã nghiệm thu`,
            },
            {
              label: 'Milestone kế',
              value: formatDate(nextMilestone?.due_date),
              detail: nextMilestone?.name || 'Chưa có milestone',
            },
          ]}
        />
        {project.description && (
          <Card title="Thông tin dự án">
            <p className="card-body whitespace-pre-wrap">
              {project.description}
            </p>
          </Card>
        )}
        <ProjectMilestoneClient projectId={id} milestones={milestones.data ?? []} />
        {financeCost.data && (
          <Card title="Ngân sách và chi phí thực tế">
            <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-5">
              <div><p className="muted">Ngân sách</p><b className="num text-xl">{formatCompactMoney(financeCost.data.budget_amount, financeCost.data.budget_currency)}</b></div>
              <div><p className="muted">Chi phí đã duyệt</p><b className="num text-xl">{formatCompactMoney(financeCost.data.actual_cost, financeCost.data.actual_currency)}</b></div>
              <div><p className="muted">Ngân sách đã dùng</p><b className="num text-xl">{financeCost.data.budget_utilization_pct == null ? '—' : `${financeCost.data.budget_utilization_pct}%`}</b>{Number(financeCost.data.budget_utilization_pct) > 90 && <small className="block text-[var(--er)]">Đã sử dụng trên 90% ngân sách</small>}</div>
              {Number(financeCost.data.unpriced_hours) > 0 && <p className="muted md:col-span-3">{financeCost.data.unpriced_hours} giờ chưa có đơn giá snapshot tương ứng, chưa được tính vào chi phí.</p>}
            </div>
          </Card>
        )}
        <ProjectAllocationClient
          projectId={id}
          allocations={(allocations.data ?? []).map((allocation) => ({
            ...allocation,
            hr_employee: Array.isArray(allocation.hr_employee)
              ? allocation.hr_employee[0]
              : allocation.hr_employee,
          }))}
          employees={employees.data ?? []}
        />
        <ProjectSprintClient
          projectId={id}
          sprints={sprints.data ?? []}
          issues={issues.data ?? []}
        />
        <Card
          title="Thành viên dự án"
          action={
            <Link
              href={`/dashboard/admin/memberships?project=${id}`}
              className="text-link"
            >
              Xem thành viên →
            </Link>
          }
        >
          {!members.data?.length ? (
            <EmptyState title="Chưa có thành viên dự án" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thành viên</th>
                    <th>Vai trò</th>
                    <th>Hiệu lực</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {members.data.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="who">
                          <HexagonAvatar name={names.get(m.user_id)} />
                          <div>
                            {names.get(m.user_id) || 'Thành viên'}
                            <small>{m.user_id.slice(0, 8)}</small>
                          </div>
                        </div>
                      </td>
                      <td>{PROJECT_ROLES[m.project_role] || m.project_role}</td>
                      <td className="num muted">
                        {formatDate(m.start_date)} →{' '}
                        {m.end_date ? formatDate(m.end_date) : 'Vô thời hạn'}
                      </td>
                      <td>
                        <StatusBadge status={effectiveMembershipStatus(m)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card
          title="Log work gần đây"
          action={
            <Link
              href={`/dashboard/worklogs?project=${id}`}
              className="text-link"
            >
              Xem timesheet →
            </Link>
          }
        >
          {!logs.data?.length ? (
            <EmptyState title="Chưa có giờ làm được ghi nhận" />
          ) : (
            <div className="card-body stack">
              {logs.data.map((log) => {
                const employee = Array.isArray(log.hr_employee)
                  ? log.hr_employee[0]
                  : log.hr_employee
                const issue = Array.isArray(log.work_issue)
                  ? log.work_issue[0]
                  : log.work_issue
                return (
                  <div key={log.id} className="who">
                    <HexagonAvatar name={employee?.full_name} />
                    <div>
                      <p>
                        <b>{employee?.full_name || 'Nhân sự'}</b> ·{' '}
                        <Link
                          href={`/dashboard/issues/${log.issue_id}`}
                          className="text-link"
                        >
                          {issue?.title || 'Ticket'}
                        </Link>{' '}
                        · <b className="num">{log.hours}h</b>
                      </p>
                      <small>
                        {log.description || '—'} · {formatDate(log.logged_date)}
                      </small>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}
