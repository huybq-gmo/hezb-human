'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { HexagonAvatar } from '@/components/HezbLogo'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, Card, EmptyState, Field } from '@/components/ui'
import { formatDate } from '@/lib/presentation'
import { cn } from '@/lib/utils'

interface LeaveRequest {
  id: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_requested: number
  reason: string | null
  status: string
  created_by: string
  approved_at: string | null
  hr_employee?: { full_name: string | null } | null
  hr_leave_type?: { name: string; code: string } | null
}
interface Props {
  currentUserId: string
  currentEmployee: { id: string; full_name: string | null } | null
  leaveTypes: { id: string; name: string; code: string }[]
  initialRequests: LeaveRequest[]
}

export function LeaveManagementClient({
  currentUserId,
  currentEmployee,
  leaveTypes,
  initialRequests,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const [create, setCreate] = useState(false)
  const [reject, setReject] = useState<LeaveRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const canReview = user.hasRole('company_owner', 'hr_admin')
  const requests = initialRequests.filter(
    (request) => !status || request.status === status,
  )
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!currentEmployee) return
    const data = new FormData(event.currentTarget)
    if (String(data.get('end_date')) < String(data.get('start_date'))) {
      setError('Ngày kết thúc phải sau ngày bắt đầu.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.from('hr_leave_request').insert({
        employee_id: currentEmployee.id,
        leave_type_id: data.get('leave_type_id'),
        start_date: data.get('start_date'),
        end_date: data.get('end_date'),
        days_requested: Number(data.get('days_requested')),
        reason: String(data.get('reason') || '').trim() || null,
        created_by: currentUserId,
        status: 'pending',
      })
      if (error) {
        setError('Không thể gửi đơn nghỉ phép. Vui lòng kiểm tra và thử lại.')
        return
      }
      toast.success('Đã gửi đơn nghỉ phép')
      setCreate(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function review(request: LeaveRequest, reason?: string) {
    if (
      request.created_by === currentUserId ||
      request.employee_id === currentEmployee?.id
    )
      return
    setBusy(true)
    try {
      const { error } = await supabase.rpc(
        reason ? 'reject_leave' : 'approve_leave',
        { p_request_id: request.id, ...(reason ? { p_reason: reason } : {}) },
      )
      if (error) {
        toast.error(
          error.message.includes('INSUFFICIENT_BALANCE')
            ? 'Số dư ngày phép không đủ.'
            : 'Không thể duyệt đơn. Kiểm tra quyền hoặc tải lại dữ liệu.',
        )
        return
      }
      toast.success(
        reason ? 'Đã từ chối đơn nghỉ phép' : 'Đã duyệt đơn nghỉ phép',
      )
      setReject(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <div className="toolbar toolbar-between">
        <div className="filters">
          {[
            ['', 'Tất cả'],
            ['pending', 'Chờ duyệt'],
            ['approved', 'Đã duyệt'],
            ['rejected', 'Từ chối'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={cn('f', status === value && 'on')}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          disabled={!currentEmployee}
          onClick={() => {
            setError('')
            setCreate(true)
          }}
        >
          <Plus size={15} />
          Tạo đơn nghỉ phép
        </Button>
      </div>
      {!currentEmployee && (
        <div className="notice warning">
          Tài khoản chưa liên kết hồ sơ nhân sự để tạo đơn nghỉ phép.
        </div>
      )}
      <Card
        title="Đơn nghỉ phép"
        action={<span className="muted">{requests.length} đơn</span>}
      >
        {!requests.length ? (
          <EmptyState title="Chưa có đơn nghỉ phép phù hợp" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Loại nghỉ phép</th>
                  <th>Thời gian</th>
                  <th>Số ngày</th>
                  <th>Lý do</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const own =
                    request.created_by === currentUserId ||
                    request.employee_id === currentEmployee?.id
                  return (
                    <tr key={request.id}>
                      <td>
                        <div className="who">
                          <HexagonAvatar
                            name={request.hr_employee?.full_name}
                          />
                          <span>
                            {request.hr_employee?.full_name || 'Nhân sự'}
                          </span>
                        </div>
                      </td>
                      <td>{request.hr_leave_type?.name || 'Nghỉ phép'}</td>
                      <td className="num whitespace-nowrap muted">
                        {formatDate(request.start_date)} →{' '}
                        {formatDate(request.end_date)}
                      </td>
                      <td className="num font-semibold">
                        {request.days_requested}
                      </td>
                      <td>{request.reason || '—'}</td>
                      <td>
                        <StatusBadge status={request.status} />
                      </td>
                      <td>
                        {canReview && request.status === 'pending' ? (
                          <div className="toolbar">
                            <Button
                              size="sm"
                              disabled={busy || own}
                              title={
                                own
                                  ? 'Bạn không thể tự duyệt đơn của mình'
                                  : 'Duyệt đơn'
                              }
                              onClick={() => void review(request)}
                            >
                              <Check size={13} />
                              Duyệt
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busy || own}
                              onClick={() => setReject(request)}
                            >
                              Từ chối
                            </Button>
                          </div>
                        ) : (
                          <span className="muted">
                            {formatDate(request.approved_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {create && (
        <Dialog
          title="Tạo đơn nghỉ phép"
          onClose={() => setCreate(false)}
          busy={busy}
        >
          <form onSubmit={submit}>
            <Field label="Loại nghỉ phép">
              <select name="leave_type_id" required>
                <option value="">Chọn loại nghỉ phép</option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Từ ngày">
                <input name="start_date" type="date" required />
              </Field>
              <Field label="Đến ngày">
                <input name="end_date" type="date" required />
              </Field>
            </div>
            <Field label="Số ngày nghỉ">
              <input
                name="days_requested"
                type="number"
                min="0.5"
                step="0.5"
                required
                defaultValue="1"
              />
            </Field>
            <Field label="Lý do">
              <textarea name="reason" placeholder="Lý do xin nghỉ phép" />
            </Field>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setCreate(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Gửi đơn'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {reject && (
        <Dialog
          title="Từ chối đơn nghỉ phép"
          onClose={() => setReject(null)}
          busy={busy}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const reason = String(
                new FormData(event.currentTarget).get('reason') || '',
              ).trim()
              if (reason) void review(reject, reason)
            }}
          >
            <p>
              Đơn của <b>{reject.hr_employee?.full_name || 'nhân sự'}</b>
            </p>
            <Field label="Lý do từ chối">
              <textarea name="reason" required autoFocus />
            </Field>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setReject(null)}
              >
                Hủy
              </Button>
              <Button type="submit" variant="danger" disabled={busy}>
                {busy ? 'Đang xử lý…' : 'Từ chối đơn'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
