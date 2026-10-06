'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { Dialog } from '@/components/Dialog'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import { formatDate, formatMoney } from '@/lib/presentation'

interface Milestone {
  id: string
  project_id: string
  name: string
  description: string | null
  due_date: string | null
  budget_amount: number | null
  currency: string
  status: string
  created_by: string | null
  submitted_by: string | null
  reject_reason: string | null
}

export function ProjectMilestoneClient({
  projectId,
  milestones,
}: {
  projectId: string
  milestones: Milestone[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = user.hasRole('company_owner', 'director', 'project_manager') || user.hasProjectRole(projectId, 'pm')
  const canSubmit = user.hasRole('company_owner', 'project_manager') || user.hasProjectRole(projectId, 'pm')
  const canDecide = user.hasRole('company_owner', 'director')

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('save_project_milestone', {
        p_milestone_id: editing === 'new' ? null : editing.id,
        p_project_id: projectId,
        p_name: String(data.get('name') || '').trim(),
        p_description: String(data.get('description') || '').trim() || null,
        p_due_date: String(data.get('due_date') || '') || null,
        p_budget_amount: data.get('budget_amount') ? Number(data.get('budget_amount')) : null,
        p_currency: String(data.get('currency') || 'VND').toUpperCase(),
      })
      if (error) {
        toast.error('Không thể lưu milestone. Kiểm tra quyền và dữ liệu.')
        return
      }
      toast.success('Đã lưu milestone')
      setEditing(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function submitAcceptance(milestoneId: string) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('submit_milestone_acceptance', { p_milestone_id: milestoneId })
      if (error) {
        toast.error('Không thể gửi milestone nghiệm thu.')
        return
      }
      toast.success('Đã gửi milestone chờ nghiệm thu')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function decide(milestone: Milestone, accept: boolean, reason?: string) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('decide_milestone', {
        p_milestone_id: milestone.id,
        p_accept: accept,
        p_reason: reason || null,
      })
      if (error) {
        toast.error(error.message.includes('SOD_VIOLATION') ? 'Người gửi không được tự nghiệm thu.' : 'Không thể cập nhật nghiệm thu.')
        return
      }
      toast.success(accept ? 'Đã nghiệm thu milestone' : 'Đã từ chối milestone')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card title="Milestone" action={canManage ? <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Thêm milestone</Button> : null}>
        {!milestones.length ? <EmptyState title="Chưa có milestone" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Milestone</th><th>Hạn</th><th>Ngân sách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>{milestones.map((milestone) => {
                const selfSubmitted = milestone.submitted_by === user.id || milestone.created_by === user.id
                return (
                  <tr key={milestone.id}>
                    <td><b>{milestone.name}</b>{milestone.description && <small className="block muted">{milestone.description}</small>}{milestone.reject_reason && <small className="block muted">Lý do từ chối: {milestone.reject_reason}</small>}</td>
                    <td className="num muted">{formatDate(milestone.due_date)}</td>
                    <td className="num">{formatMoney(milestone.budget_amount, milestone.currency)}</td>
                    <td><Badge tone={milestone.status === 'accepted' ? 'ok' : milestone.status === 'rejected' ? 'er' : milestone.status === 'submitted' ? 'wn' : 'neutral'}>{milestone.status === 'open' ? 'Mở' : milestone.status === 'submitted' ? 'Chờ nghiệm thu' : milestone.status === 'accepted' ? 'Đã nghiệm thu' : 'Từ chối'}</Badge></td>
                    <td><div className="toolbar">
                      {canManage && ['open', 'rejected'].includes(milestone.status) && <Button size="sm" variant="ghost" aria-label={`Sửa ${milestone.name}`} onClick={() => setEditing(milestone)}><Pencil size={13} /></Button>}
                      {canSubmit && ['open', 'rejected'].includes(milestone.status) && <Button size="sm" disabled={busy} onClick={() => void submitAcceptance(milestone.id)}>Gửi nghiệm thu</Button>}
                      {canDecide && milestone.status === 'submitted' && <>
                        <Button size="sm" disabled={busy || selfSubmitted} title={selfSubmitted ? 'Người gửi không được tự nghiệm thu' : undefined} onClick={() => void decide(milestone, true)}><Check size={13} /> Accept</Button>
                        <Button size="sm" variant="danger" disabled={busy || selfSubmitted} onClick={() => void decide(milestone, false, 'Không đạt tiêu chí nghiệm thu')}><X size={13} /> Reject</Button>
                      </>}
                    </div></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <Dialog title={editing === 'new' ? 'Thêm milestone' : 'Sửa milestone'} onClose={() => setEditing(null)} busy={busy}>
          <form onSubmit={save}>
            <Field label="Tên milestone"><input name="name" required maxLength={160} defaultValue={editing === 'new' ? '' : editing.name} autoFocus /></Field>
            <Field label="Mô tả"><textarea name="description" defaultValue={editing === 'new' ? '' : editing.description || ''} /></Field>
            <div className="form-grid">
              <Field label="Ngày đến hạn"><input name="due_date" type="date" defaultValue={editing === 'new' ? '' : editing.due_date || ''} /></Field>
              <Field label="Ngân sách"><input name="budget_amount" type="number" min="0" step="0.01" defaultValue={editing === 'new' ? '' : editing.budget_amount ?? ''} /></Field>
              <Field label="Tiền tệ"><input name="currency" maxLength={3} defaultValue={editing === 'new' ? 'VND' : editing.currency} required /></Field>
            </div>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu milestone'}</Button></div>
          </form>
        </Dialog>
      )}
    </>
  )
}
