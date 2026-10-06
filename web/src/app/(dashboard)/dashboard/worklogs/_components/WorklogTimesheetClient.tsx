'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus,
  Send,
  LockKeyhole,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { HexagonAvatar } from '@/components/HezbLogo'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import {
  ApprovalSteps,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Progress,
} from '@/components/ui'
import { formatDate, localDate } from '@/lib/presentation'
import { cn } from '@/lib/utils'

interface Worklog {
  id: string
  issue_id: string
  project_id: string
  employee_id: string
  logged_date: string
  hours: number
  description: string | null
  is_billable: boolean
  work_type: string
  status: string
  created_by: string
  work_issue?: { title: string } | null
  project_project?: { name: string } | null
}
interface Timesheet {
  id: string
  employee_id: string
  project_id: string
  period_start: string
  period_end: string
  total_hours: number
  status: string
  created_by: string
  hr_employee?: { full_name: string | null } | null
  project_project?: { name: string } | null
}
interface Props {
  currentUserId: string
  currentEmployee: { id: string; full_name: string | null } | null
  worklogs: Worklog[]
  timesheets: Timesheet[]
  projects: { id: string; name: string }[]
  issues: { id: string; project_id: string; title: string }[]
  attendance: {
    id: string
    work_date: string
    check_in_at: string
    check_out_at: string | null
  } | null
  weekStart: string
  weekEnd: string
}
const logSchema = z.object({
  project_id: z.string().min(1, 'Chọn dự án'),
  issue_id: z.string().min(1, 'Chọn ticket'),
  logged_date: z.string().min(1, 'Chọn ngày'),
  hours: z.coerce
    .number()
    .min(0.25, 'Tối thiểu 0,25 giờ')
    .max(24, 'Tối đa 24 giờ'),
})
const WORK_TYPES: Record<string, string> = {
  coding: 'Lập trình',
  study: 'Nghiên cứu / học tập',
  test: 'Kiểm thử',
  meeting: 'Họp',
  review: 'Review',
  support: 'Hỗ trợ',
  other: 'Khác',
}

export function WorklogTimesheetClient({
  currentUserId,
  currentEmployee,
  worklogs,
  timesheets,
  projects,
  issues,
  attendance,
  weekStart,
  weekEnd,
}: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()
  const user = useWorkspace()
  const [showLog, setShowLog] = useState(false)
  const [showSubmit, setShowSubmit] = useState(false)
  const [selectedProject, setSelectedProject] = useState(
    params.get('project') || '',
  )
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [action, setAction] = useState<{
    type: 'reject' | 'adjust' | 'lock'
    ts: Timesheet
  } | null>(null)
  const tab = ['approval', 'timesheet'].includes(params.get('tab') || '')
    ? 'approval'
    : params.get('tab') === 'logs'
      ? 'logs'
      : 'week'
  const canReview =
    user.hasRole('company_owner', 'project_manager', 'team_leader') ||
    user.memberships.some((m) => ['pm', 'team_leader'].includes(m.project_role))
  const ownLogs = worklogs.filter(
    (log) =>
      log.employee_id === currentEmployee?.id &&
      (!params.get('project') || log.project_id === params.get('project')),
  )
  const ownSheets = timesheets.filter(
    (ts) => ts.employee_id === currentEmployee?.id,
  )
  const dates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(`${weekStart}T12:00:00Z`)
    day.setUTCDate(day.getUTCDate() + index)
    return day.toISOString().slice(0, 10)
  })
  const groups = new Map<
    string,
    {
      issueId: string
      title: string
      project: string
      days: number[]
      total: number
    }
  >()
  for (const log of ownLogs) {
    const key = `${log.project_id}:${log.issue_id}`
    const row = groups.get(key) || {
      issueId: log.issue_id,
      title: log.work_issue?.title || 'Ticket',
      project: log.project_project?.name || 'Dự án',
      days: Array(7).fill(0),
      total: 0,
    }
    const index = dates.indexOf(log.logged_date)
    if (index >= 0) {
      row.days[index] += Number(log.hours)
      row.total += Number(log.hours)
    }
    groups.set(key, row)
  }
  const rows = [...groups.values()]
  const dailyTotals = dates.map((_, index) =>
    rows.reduce((sum, row) => sum + row.days[index], 0),
  )
  const total = dailyTotals.reduce((sum, hours) => sum + hours, 0)
  function navigate(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    router.replace(`/dashboard/worklogs${next.size ? `?${next}` : ''}`, {
      scroll: false,
    })
  }
  function closeLog() {
    setShowLog(false)
    setErrors({})
    if (params.has('log')) navigate({ log: null })
  }
  function shiftWeek(offset: number) {
    const day = new Date(`${weekStart}T12:00:00Z`)
    day.setUTCDate(day.getUTCDate() + offset)
    navigate({ week: day.toISOString().slice(0, 10) })
  }
  async function saveLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentEmployee) return
    const data = new FormData(event.currentTarget)
    const parsed = logSchema.safeParse(Object.fromEntries(data))
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      )
      return
    }
    if (
      !issues.some(
        (issue) =>
          issue.id === parsed.data.issue_id &&
          issue.project_id === parsed.data.project_id,
      )
    ) {
      setErrors({ issue_id: 'Ticket không thuộc dự án đã chọn' })
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('work_worklog').insert({
        ...parsed.data,
        employee_id: currentEmployee.id,
        is_billable: data.get('is_billable') === 'on',
        work_type: String(data.get('work_type') || 'coding'),
        description: String(data.get('description') || '').trim() || null,
        created_by: currentUserId,
        status: 'draft',
      })
      if (error) {
        toast.error(
          'Không thể lưu giờ làm. Kiểm tra quyền hoặc kỳ timesheet đã khóa.',
        )
        return
      }
      toast.success('Đã ghi nhận giờ làm')
      closeLog()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function attendanceAction(action: 'check_in' | 'check_out') {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('set_work_attendance', {
        p_action: action,
      })
      if (error) {
        toast.error(
          error.message.includes('CHECK_IN_REQUIRED')
            ? 'Bạn cần check-in trước khi check-out.'
            : 'Không thể cập nhật chấm công. Vui lòng thử lại.',
        )
        return
      }
      toast.success(action === 'check_in' ? 'Đã check-in' : 'Đã check-out')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentEmployee) return
    const data = new FormData(event.currentTarget)
    const start = String(data.get('period_start')),
      end = String(data.get('period_end'))
    if (end < start) {
      setErrors({ period_end: 'Ngày kết thúc phải sau ngày bắt đầu' })
      return
    }
    await rpc(
      'submit_timesheet',
      {
        p_employee_id: currentEmployee.id,
        p_project_id: data.get('project_id'),
        p_period_start: start,
        p_period_end: end,
      },
      'Đã gửi timesheet cho Leader duyệt',
      () => {
        setShowSubmit(false)
        setErrors({})
      },
    )
  }
  async function rpc(
    name: string,
    args: Record<string, unknown>,
    message: string,
    done?: () => void,
  ) {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc(name, args)
      if (error) {
        const known: Record<string, string> = {
          SOD_VIOLATION: 'Bạn không thể tự duyệt timesheet của mình.',
          NO_WORKLOG: 'Không có giờ làm hợp lệ trong kỳ.',
          ALREADY_SUBMITTED: 'Timesheet kỳ này đã được gửi.',
          HAS_UNAPPROVED: 'Còn timesheet chưa được duyệt trong kỳ.',
          FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
          INVALID_STATE: 'Trạng thái đã thay đổi. Vui lòng tải lại.',
        }
        toast.error(
          Object.entries(known).find(([code]) =>
            error.message.includes(code),
          )?.[1] || 'Không thể thực hiện thao tác. Vui lòng thử lại.',
        )
        return
      }
      toast.success(message)
      done?.()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function confirmAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action) return
    const reason = String(
      new FormData(event.currentTarget).get('reason') || '',
    ).trim()
    if (action.type !== 'lock' && !reason) return
    const args =
      action.type === 'lock'
        ? {
            p_project_id: action.ts.project_id,
            p_period_start: action.ts.period_start,
            p_period_end: action.ts.period_end,
          }
        : { p_timesheet_id: action.ts.id, p_reason: reason }
    await rpc(
      action.type === 'lock'
        ? 'lock_timesheet_period'
        : action.type === 'adjust'
          ? 'request_timesheet_adjustment'
          : 'reject_timesheet',
      args,
      action.type === 'lock'
        ? 'Đã khóa kỳ timesheet'
        : action.type === 'adjust'
          ? 'Đã gửi yêu cầu điều chỉnh'
          : 'Đã trả timesheet về nháp',
      () => setAction(null),
    )
  }
  const canApprove = (ts: Timesheet, step: 'leader' | 'pm') =>
    ts.employee_id !== currentEmployee?.id &&
    ts.created_by !== currentUserId &&
    (user.hasRole('company_owner') ||
      user.hasProjectRole(
        ts.project_id,
        step === 'leader' ? 'team_leader' : 'pm',
      ))
  const sheets = tab === 'approval' ? timesheets : ownSheets
  return (
    <div className="stack">
      <div className="tabs">
        <button
          className={cn(tab === 'week' && 'on')}
          aria-pressed={tab === 'week'}
          onClick={() => navigate({ tab: null })}
        >
          Timesheet của tôi
        </button>
        <button
          className={cn(tab === 'logs' && 'on')}
          aria-pressed={tab === 'logs'}
          onClick={() => navigate({ tab: 'logs' })}
        >
          Nhật ký giờ làm
        </button>
        {canReview && (
          <button
            className={cn(tab === 'approval' && 'on')}
            aria-pressed={tab === 'approval'}
            onClick={() => navigate({ tab: 'approval' })}
          >
            Duyệt timesheet
          </button>
        )}
      </div>
      {!currentEmployee && (
        <div className="notice warning">
          Tài khoản chưa liên kết hồ sơ nhân sự để ghi nhận giờ làm.
        </div>
      )}
      {currentEmployee && (
        <Card title="Chấm công hôm nay">
          <div className="card-body toolbar toolbar-between">
            <div className="stack-sm">
              <span className="muted">{formatDate(attendance?.work_date || localDate())}</span>
              <span>
                Check-in: <b className="num">{attendance?.check_in_at ? new Date(attendance.check_in_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : 'Chưa ghi nhận'}</b>
                {' · '}Check-out: <b className="num">{attendance?.check_out_at ? new Date(attendance.check_out_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : 'Chưa ghi nhận'}</b>
              </span>
            </div>
            {!attendance ? (
              <Button size="sm" disabled={busy} onClick={() => void attendanceAction('check_in')}>Check-in</Button>
            ) : !attendance.check_out_at ? (
              <Button size="sm" disabled={busy} onClick={() => void attendanceAction('check_out')}>Check-out</Button>
            ) : (
              <Badge tone="ok">Đã chấm công đủ</Badge>
            )}
          </div>
        </Card>
      )}
      <div className="toolbar toolbar-between">
        <div className="toolbar">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Tuần trước"
            onClick={() => shiftWeek(-7)}
          >
            <ChevronLeft size={16} />
          </Button>
          <b className="num">
            {formatDate(weekStart)} – {formatDate(weekEnd)}
          </b>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Tuần sau"
            onClick={() => shiftWeek(7)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="toolbar">
          {currentEmployee && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setErrors({})
                  setShowSubmit(true)
                }}
              >
                <Send size={14} />
                Gửi duyệt
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setErrors({})
                  setShowLog(true)
                }}
              >
                <Plus size={15} />
                Log work
              </Button>
            </>
          )}
        </div>
      </div>
      {tab === 'week' && (
        <>
          <Card>
            <div className="table-scroll">
              <table className="week-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    {dates.map((date, index) => (
                      <th
                        key={date}
                        className={cn(
                          index > 4 && 'weekend',
                          date === localDate() && 'today',
                        )}
                      >
                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][index]}
                        <small className="block font-normal">
                          {formatDate(date).slice(0, 5)}
                        </small>
                      </th>
                    ))}
                    <th>Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.issueId}>
                      <td>
                        <Link
                          href={`/dashboard/issues/${row.issueId}`}
                          className="font-medium hover:text-[var(--pri)]"
                        >
                          {row.title}
                        </Link>
                        <small className="block muted">{row.project}</small>
                      </td>
                      {row.days.map((hours, index) => (
                        <td key={index} className={cn(index > 4 && 'weekend')}>
                          <span className="week-hours num">{hours || '–'}</span>
                        </td>
                      ))}
                      <td className="num font-semibold">{row.total}h</td>
                    </tr>
                  ))}
                  <tr className="daily-total">
                    <td>Tổng mỗi ngày</td>
                    {dailyTotals.map((hours, index) => (
                      <td key={index} className="num">
                        {hours || '–'}
                      </td>
                    ))}
                    <td className="num">{total}h</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <EmptyState
                title="Tuần này chưa có giờ làm"
                description="Dùng Log work để ghi nhận thời gian trên ticket."
              />
            )}
          </Card>
          <div className="toolbar">
            <span className="muted">Giờ đã ghi nhận trong tuần</span>
            <b className="num">{total}h</b>
            <div className="flex-1">
              <Progress
                value={total}
                max={Math.max(total, 40)}
                label="Giờ đã ghi nhận trong tuần"
              />
            </div>
          </div>
          <p className="muted">
            Mỗi ô tổng hợp giờ đã log trên ticket trong ngày. Dùng “Log work” để
            thêm giờ hoặc ghi mô tả.
          </p>
        </>
      )}
      {tab === 'logs' && (
        <Card>
          {!ownLogs.length ? (
            <EmptyState title="Chưa có log work trong tuần này" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Ticket</th>
                    <th>Dự án</th>
                    <th>Mô tả</th>
                    <th>Loại</th>
                    <th>Giờ</th>
                    <th>Tính phí</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {ownLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="num whitespace-nowrap">
                        {formatDate(log.logged_date)}
                      </td>
                      <td>
                        <Link
                          href={`/dashboard/issues/${log.issue_id}`}
                          className="text-link"
                        >
                          {log.work_issue?.title || 'Ticket'}
                        </Link>
                      </td>
                      <td>{log.project_project?.name || '—'}</td>
                      <td>{log.description || '—'}</td>
                      <td><Badge tone="neutral">{WORK_TYPES[log.work_type] || log.work_type}</Badge></td>
                      <td className="num font-semibold">{log.hours}h</td>
                      <td>
                        <Badge tone={log.is_billable ? 'ok' : 'neutral'}>
                          {log.is_billable ? 'Billable' : 'Non-billable'}
                        </Badge>
                      </td>
                      <td>
                        <StatusBadge status={log.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <Card
        title={tab === 'approval' ? 'Timesheet cần duyệt' : 'Timesheet đã gửi'}
      >
        {!sheets.length ? (
          <EmptyState title="Chưa có timesheet" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Dự án</th>
                  <th>Kỳ làm việc</th>
                  <th>Tổng giờ</th>
                  <th>Tiến trình</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((ts) => {
                  const step = ts.status === 'submitted' ? 'leader' : 'pm'
                  const reviewable =
                    ['submitted', 'leader_approved'].includes(ts.status) &&
                    canApprove(ts, step)
                  const canLock =
                    user.hasRole('company_owner') ||
                    user.hasProjectRole(ts.project_id, 'pm')
                  return (
                    <tr key={ts.id}>
                      <td>
                        <div className="who">
                          <HexagonAvatar name={ts.hr_employee?.full_name} />
                          <span>{ts.hr_employee?.full_name || 'Nhân sự'}</span>
                        </div>
                      </td>
                      <td>{ts.project_project?.name || '—'}</td>
                      <td className="num muted whitespace-nowrap">
                        {formatDate(ts.period_start)} →{' '}
                        {formatDate(ts.period_end)}
                      </td>
                      <td className="num font-semibold">{ts.total_hours}h</td>
                      <td>
                        <StatusBadge status={ts.status} />
                        <div className="mt-2">
                          <ApprovalSteps status={ts.status} />
                        </div>
                      </td>
                      <td>
                        <div className="toolbar">
                          {reviewable && (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  void rpc(
                                    'approve_timesheet_step',
                                    { p_timesheet_id: ts.id, p_step: step },
                                    'Đã duyệt timesheet',
                                  )
                                }
                              >
                                <Check size={13} />
                                Duyệt {step === 'leader' ? 'Leader' : 'PM'}
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() =>
                                  setAction({ type: 'reject', ts })
                                }
                              >
                                Trả về
                              </Button>
                            </>
                          )}
                          {ts.status === 'pm_approved' && canLock && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => setAction({ type: 'lock', ts })}
                            >
                              <LockKeyhole size={13} />
                              Khóa kỳ
                            </Button>
                          )}
                          {ts.status === 'locked' &&
                            ts.employee_id === currentEmployee?.id && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setAction({ type: 'adjust', ts })
                                }
                              >
                                Yêu cầu điều chỉnh
                              </Button>
                            )}
                          {!reviewable &&
                            !['locked', 'pm_approved'].includes(ts.status) && (
                              <span className="muted">
                                {ts.employee_id === currentEmployee?.id
                                  ? 'Chờ người duyệt'
                                  : '—'}
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {(showLog || params.get('log') === '1') && currentEmployee && (
        <Dialog title="Log work" onClose={closeLog} busy={busy}>
          <form onSubmit={saveLog}>
            <Field label="Dự án" error={errors.project_id}>
              <select
                name="project_id"
                required
                value={selectedProject}
                onChange={(event) => setSelectedProject(event.target.value)}
              >
                <option value="">Chọn dự án</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ticket" error={errors.issue_id}>
              <select
                key={selectedProject}
                name="issue_id"
                required
                defaultValue={params.get('issue') || ''}
              >
                <option value="">Chọn ticket</option>
                {issues
                  .filter((issue) => issue.project_id === selectedProject)
                  .map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.title}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Ngày" error={errors.logged_date}>
                <input
                  name="logged_date"
                  type="date"
                  defaultValue={localDate()}
                  required
                />
              </Field>
              <Field label="Thời gian (giờ)" error={errors.hours}>
                <input
                  name="hours"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  defaultValue="1"
                  required
                />
              </Field>
            </div>
            <Field label="Loại công việc">
              <select name="work_type" defaultValue="coding">
                {Object.entries(WORK_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Mô tả">
              <textarea name="description" placeholder="Bạn đã làm gì?" />
            </Field>
            <label className="checkbox-field">
              <input name="is_billable" type="checkbox" defaultChecked />
              Tính phí (billable)
            </label>
            <div className="form-actions">
              <Button variant="ghost" disabled={busy} onClick={closeLog}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu log'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {showSubmit && (
        <Dialog
          title="Gửi timesheet"
          onClose={() => setShowSubmit(false)}
          busy={busy}
        >
          <form onSubmit={submit}>
            <Field label="Dự án">
              <select
                name="project_id"
                required
                defaultValue={params.get('project') || ''}
              >
                <option value="">Chọn dự án</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Từ ngày">
                <input
                  name="period_start"
                  type="date"
                  defaultValue={weekStart}
                  required
                />
              </Field>
              <Field label="Đến ngày" error={errors.period_end}>
                <input
                  name="period_end"
                  type="date"
                  defaultValue={weekEnd}
                  required
                />
              </Field>
            </div>
            <p className="muted">
              Giờ làm trong kỳ sẽ được tổng hợp và gửi cho Leader duyệt.
            </p>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setShowSubmit(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Gửi duyệt'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {action && (
        <Dialog
          title={
            {
              lock: 'Khóa kỳ timesheet',
              reject: 'Trả timesheet về nháp',
              adjust: 'Yêu cầu điều chỉnh',
            }[action.type]
          }
          onClose={() => setAction(null)}
          busy={busy}
        >
          <form onSubmit={confirmAction}>
            <p className="muted">
              {formatDate(action.ts.period_start)} →{' '}
              {formatDate(action.ts.period_end)}
            </p>
            {action.type === 'lock' ? (
              <p>
                Kỳ được khóa sau khi tất cả timesheet đã được duyệt. Sau khi
                khóa, thay đổi cần yêu cầu điều chỉnh.
              </p>
            ) : (
              <Field label="Lý do">
                <textarea name="reason" required autoFocus />
              </Field>
            )}
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang xử lý…' : 'Xác nhận'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
