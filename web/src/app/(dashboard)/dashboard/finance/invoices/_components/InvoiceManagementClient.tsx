'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Dialog } from '@/components/Dialog'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import { formatDate, formatDateTime, formatMoney, localDate } from '@/lib/presentation'
import type { AppRole } from '@/lib/types'

interface Invoice {
  id: string
  invoice_number: string
  project_id: string
  client_id: string
  status: string
  amount: number
  tax_amount: number
  total_amount: number
  currency: string
  due_date: string | null
  issued_by: string
  issued_at: string
  source_snapshot: unknown
  notes: string | null
  project_project?: { name: string; code: string | null } | null
  project_client?: { name: string } | null
}
interface Line {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  source_type: string | null
  source_id: string | null
}
interface Payment {
  id: string
  invoice_id: string
  amount: number
  currency: string
  payment_date: string
  external_ref: string | null
  fee: number
  status: string
}
interface Milestone {
  id: string
  name: string
  budget_amount: number | null
  currency: string
}

export function InvoiceManagementClient({
  userId,
  roles,
  invoices,
  projects,
  lines,
  payments,
}: {
  userId: string
  roles: AppRole[]
  invoices: Invoice[]
  projects: { id: string; name: string; budget_currency: string }[]
  lines: Line[]
  payments: Payment[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedId, setSelectedId] = useState(invoices[0]?.id || '')
  const [issuing, setIssuing] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const canIssue = roles.some((role) => ['company_owner','finance_admin'].includes(role))
  const selected = invoices.find((invoice) => invoice.id === selectedId) || null
  const selectedPayments = selected ? payments.filter((payment) => payment.invoice_id === selected.id) : []
  const paid = selectedPayments.filter((payment) => payment.status === 'confirmed').reduce((sum, payment) => sum + Number(payment.amount), 0)

  async function loadMilestones(nextProject: string) {
    setProjectId(nextProject)
    setMilestones([])
    if (!nextProject) return
    const { data, error } = await supabase.from('project_milestone').select('id,name,budget_amount,currency').eq('project_id',nextProject).eq('status','accepted').order('due_date').limit(100)
    if (error) toast.error('Không thể tải milestone đã nghiệm thu.')
    else setMilestones(data ?? [])
  }

  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const start = String(data.get('period_start') || '')
      const end = String(data.get('period_end') || '')
      const { data: invoiceId, error } = await supabase.rpc('issue_invoice', {
        p_project_id: String(data.get('project_id') || ''),
        p_milestone_ids: data.getAll('milestone_ids').filter(Boolean).map(String),
        p_period_start: start || null,
        p_period_end: end || null,
        p_tax_rate: Number(data.get('tax_rate') || 0) / 100,
        p_due_date: String(data.get('due_date') || '') || null,
        p_notes: String(data.get('notes') || '').trim() || null,
      })
      if (error) {
        toast.error(error.message.includes('ZERO_AMOUNT') ? 'Không có milestone hoặc worklog hợp lệ để xuất hóa đơn.' : 'Không thể phát hành hóa đơn. Kiểm tra quyền, kỳ worklog và nguồn dữ liệu.')
        return
      }
      toast.success('Đã phát hành hóa đơn')
      setIssuing(false)
      setSelectedId(invoiceId)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('record_payment', {
        p_invoice_id: selected.id,
        p_amount: Number(data.get('amount')),
        p_payment_date: String(data.get('payment_date') || ''),
        p_external_ref: String(data.get('external_ref') || '').trim() || null,
        p_fee: Number(data.get('fee') || 0),
        p_notes: String(data.get('notes') || '').trim() || null,
      })
      if (error) {
        toast.error(error.message.includes('DUPLICATE_PAYMENT') ? 'Mã giao dịch đã được ghi nhận.' : error.message.includes('OVERPAYMENT') ? 'Số tiền vượt phần còn phải thu.' : 'Không thể ghi nhận thanh toán.')
        return
      }
      toast.success('Đã ghi nhận thanh toán chờ đối soát')
      form.reset()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function reconcile() {
    if (!selected) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('reconcile_invoice', { p_invoice_id: selected.id })
      if (error) {
        toast.error(error.message.includes('SOD_VIOLATION') ? 'Người phát hành không được tự đối soát.' : 'Không thể đối soát hóa đơn.')
        return
      }
      toast.success('Đã xác nhận các khoản thanh toán')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card title="Danh sách hóa đơn" action={canIssue ? <Button size="sm" onClick={() => setIssuing(true)}><Plus size={14} /> Phát hành hóa đơn</Button> : null}>
        {!invoices.length ? <EmptyState title="Chưa có hóa đơn" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>Số hóa đơn</th><th>Dự án / khách hàng</th><th>Phát hành</th><th>Đến hạn</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead>
            <tbody>{invoices.map((invoice) => {
              const overdue = invoice.due_date && invoice.due_date < localDate(new Date()) && !['paid','voided'].includes(invoice.status)
              return <tr key={invoice.id} className="cursor-pointer" onClick={() => setSelectedId(invoice.id)}>
                <td><b>{invoice.invoice_number}</b><small className="block muted">{formatDateTime(invoice.issued_at)}</small></td>
                <td>{invoice.project_project?.name || 'Dự án'}<small className="block muted">{invoice.project_client?.name || 'Khách hàng'}</small></td>
                <td>{formatDate(invoice.issued_at)}</td><td>{formatDate(invoice.due_date)}</td>
                <td className="num font-semibold">{formatMoney(invoice.total_amount,invoice.currency)}</td>
                <td><Badge tone={overdue ? 'er' : invoice.status==='paid' ? 'ok' : invoice.status==='partially_paid' ? 'wn' : 'neutral'}>{overdue ? 'Quá hạn' : invoice.status}</Badge></td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </Card>
      {selected && (
        <Card title={`Chi tiết ${selected.invoice_number}`} action={<Badge>{selected.status}</Badge>}>
          <div className="card-body stack">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><small className="muted">Khách hàng</small><p>{selected.project_client?.name}</p></div>
              <div><small className="muted">Giá trị trước thuế</small><p className="num">{formatMoney(selected.amount,selected.currency)}</p></div>
              <div><small className="muted">Thuế</small><p className="num">{formatMoney(selected.tax_amount,selected.currency)}</p></div>
              <div><small className="muted">Đã đối soát</small><p className="num">{formatMoney(paid,selected.currency)} / {formatMoney(selected.total_amount,selected.currency)}</p></div>
            </div>
            <h3 className="font-semibold">Chi tiết dòng hóa đơn</h3>
            {!lines.some((line) => line.invoice_id===selected.id) ? <p className="muted">Không có dòng chi tiết.</p> : <div className="table-scroll"><table><thead><tr><th>Mô tả</th><th>Nguồn</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{lines.filter((line) => line.invoice_id===selected.id).map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.source_type || '—'}</td><td className="num">{formatMoney(line.unit_price,selected.currency)}</td><td className="num">{formatMoney(line.line_total,selected.currency)}</td></tr>)}</tbody></table></div>}
            <details><summary>Nguồn dữ liệu đã chụp</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(selected.source_snapshot,null,2)}</pre></details>
            <h3 className="font-semibold">Thanh toán</h3>
            {!selectedPayments.length ? <p className="muted">Chưa có giao dịch.</p> : <div className="table-scroll"><table><thead><tr><th>Ngày</th><th>Mã giao dịch</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{selectedPayments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.payment_date)}</td><td>{payment.external_ref || '—'}</td><td className="num">{formatMoney(payment.amount,payment.currency)}</td><td>{payment.status==='confirmed' ? 'Đã đối soát' : payment.status}</td></tr>)}</tbody></table></div>}
            {canIssue && !['paid','voided'].includes(selected.status) && <form onSubmit={recordPayment} className="card stack">
              <div className="form-grid">
                <Field label="Số tiền"><input name="amount" type="number" min="0.01" step="0.01" required /></Field>
                <Field label="Ngày nhận"><input name="payment_date" type="date" defaultValue={localDate(new Date())} required /></Field>
                <Field label="Mã giao dịch"><input name="external_ref" maxLength={120} /></Field>
                <Field label="Phí"><input name="fee" type="number" min="0" step="0.01" defaultValue="0" /></Field>
              </div>
              <Field label="Ghi chú"><input name="notes" /></Field>
              <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Ghi nhận chờ đối soát'}</Button></div>
            </form>}
            {canIssue && !['paid','voided'].includes(selected.status) && selected.issued_by!==userId && selectedPayments.some((payment) => payment.status==='pending') && <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => void reconcile()}>{busy ? 'Đang đối soát…' : 'Đối soát thanh toán'}</Button></div>}
          </div>
        </Card>
      )}
      {issuing && (
        <Dialog title="Phát hành hóa đơn" onClose={() => setIssuing(false)} busy={busy}>
          <form onSubmit={issue}>
            <Field label="Dự án"><select name="project_id" value={projectId} onChange={(event) => void loadMilestones(event.target.value)} required><option value="">Chọn dự án</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
            <Field label="Milestone đã nghiệm thu (có thể chọn nhiều)"><select name="milestone_ids" multiple size={Math.min(5,Math.max(2,milestones.length))} disabled={!projectId}>{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name} · {formatMoney(milestone.budget_amount,milestone.currency)}</option>)}</select></Field>
            <p className="muted">Hoặc nhập kỳ worklog đã duyệt:</p>
            <div className="form-grid"><Field label="Từ ngày"><input name="period_start" type="date" /></Field><Field label="Đến ngày"><input name="period_end" type="date" /></Field></div>
            <div className="form-grid"><Field label="Thuế (%)"><input name="tax_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></Field><Field label="Ngày đến hạn"><input name="due_date" type="date" /></Field></div>
            <Field label="Ghi chú"><textarea name="notes" /></Field>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setIssuing(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang phát hành…' : 'Phát hành'}</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
