'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { Dialog } from '@/components/Dialog'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import { formatDate } from '@/lib/presentation'

interface Allocation {
  id: string
  employee_id: string
  project_role: string
  allocation_percent: number
  start_date: string
  end_date: string
  status: string
  requested_by: string
  decision_reason: string | null
  hr_employee?: { full_name: string | null; user_id?: string | null } | null
}

export function ProjectAllocationClient({
  projectId,
  allocations,
  employees,
}: {
  projectId: string
  allocations: Allocation[]
  employees: { id: string; full_name: string }[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const [requesting, setRequesting] = useState(false)
  const [rejecting, setRejecting] = useState<Allocation | null>(null)
  const [busy, setBusy] = useState(false)
  const canRequest = user.hasRole('company_owner', 'hr_admin', 'director', 'project_manager') || user.hasProjectRole(projectId, 'pm')
  const canDecide = user.hasRole('company_owner', 'hr_admin', 'director')

  async function requestAllocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('request_project_allocation', {
        p_project_id: projectId,
        p_employee_id: String(data.get('employee_id') || ''),
        p_project_role: String(data.get('project_role') || 'developer'),
        p_allocation_percent: Number(data.get('allocation_percent')),
        p_start_date: String(data.get('start_date') || ''),
        p_end_date: String(data.get('end_date') || ''),
      })
      if (error) {
        toast.error(error.message.includes('INVALID_ALLOCATION') ? 'Kiểm tra tỷ lệ và thời gian phân công.' : 'Không thể tạo yêu cầu phân công.')
        return
      }
      toast.success('Đã gửi yêu cầu phân công')
      setRequesting(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function decide(allocation: Allocation, approve: boolean, reason?: string) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('decide_project_allocation', {
        p_allocation_id: allocation.id,
        p_approve: approve,
        p_reason: reason || null,
      })
      if (error) {
        const message = error.message.includes('CAPACITY_EXCEEDED')
          ? 'Tổng phân bổ trong thời gian này vượt 100%.'
          : error.message.includes('RATE_NOT_FOUND')
            ? 'Nhân sự chưa có đơn giá hiệu lực tại ngày bắt đầu.'
            : 'Không thể xử lý yêu cầu. Kiểm tra quyền và trạng thái.'
        toast.error(message)
        return
      }
      toast.success(approve ? 'Đã duyệt và gán thành viên vào dự án' : 'Đã từ chối yêu cầu')
      setRejecting(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card title="Phân bổ nhân sự" action={canRequest ? <Button size="sm" onClick={() => setRequesting(true)}><Plus size={14} /> Yêu cầu phân công</Button> : null}>
        {!allocations.length ? <EmptyState title="Chưa có yêu cầu phân bổ" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Nhân sự</th><th>Vai trò dự án</th><th>Tỷ lệ</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>{allocations.map((allocation) => (
                <tr key={allocation.id}>
                  <td>{allocation.hr_employee?.full_name || 'Nhân sự'}</td>
                  <td>{allocation.project_role}</td>
                  <td className="num">{allocation.allocation_percent}%</td>
                  <td className="num muted whitespace-nowrap">{formatDate(allocation.start_date)} → {formatDate(allocation.end_date)}</td>
                  <td><Badge tone={allocation.status === 'approved' ? 'ok' : allocation.status === 'rejected' ? 'er' : 'neutral'}>{allocation.status === 'approved' ? 'Đã duyệt' : allocation.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}</Badge>{allocation.decision_reason && <small className="block muted">{allocation.decision_reason}</small>}</td>
                  <td>{canDecide && allocation.status === 'requested' && (
                    <div className="toolbar">
                      <Button size="sm" disabled={busy || allocation.requested_by === user.id || allocation.hr_employee?.user_id === user.id} title={allocation.requested_by === user.id || allocation.hr_employee?.user_id === user.id ? 'Người tạo hoặc nhân sự không được tự duyệt' : undefined} onClick={() => void decide(allocation, true)}><Check size={13} /> Duyệt</Button>
                      <Button size="sm" variant="danger" disabled={busy || allocation.requested_by === user.id || allocation.hr_employee?.user_id === user.id} onClick={() => setRejecting(allocation)}><X size={13} /> Từ chối</Button>
                    </div>
                  )}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      {requesting && (
        <Dialog title="Yêu cầu phân công" onClose={() => setRequesting(false)} busy={busy}>
          <form onSubmit={requestAllocation}>
            <Field label="Nhân sự"><select name="employee_id" required><option value="">Chọn nhân sự</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></Field>
            <div className="form-grid">
              <Field label="Vai trò"><select name="project_role" defaultValue="developer"><option value="pm">Project Manager</option><option value="team_leader">Team Leader</option><option value="developer">Developer</option><option value="qa_reviewer">QA Reviewer</option></select></Field>
              <Field label="Phân bổ (%)"><input name="allocation_percent" type="number" min="1" max="100" step="0.5" defaultValue="100" required /></Field>
              <Field label="Từ ngày"><input name="start_date" type="date" required /></Field>
              <Field label="Đến ngày"><input name="end_date" type="date" required /></Field>
            </div>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setRequesting(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu'}</Button></div>
          </form>
        </Dialog>
      )}
      {rejecting && (
        <Dialog title="Từ chối phân công" onClose={() => setRejecting(null)} busy={busy}>
          <form onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason') || '').trim(); void decide(rejecting, false, reason) }}>
            <Field label="Lý do"><textarea name="reason" required minLength={3} autoFocus /></Field>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setRejecting(null)}>Hủy</Button><Button type="submit" variant="danger" disabled={busy}>Từ chối</Button></div>
          </form>
        </Dialog>
      )}
    </>
  )
}
