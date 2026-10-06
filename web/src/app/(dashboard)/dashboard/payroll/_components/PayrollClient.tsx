'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { formatDateTime } from '@/lib/presentation'

interface PayrollPeriod {
  id: string
  month: number
  year: number
  status: string
  opened_at: string
}

interface PayrollRow {
  employee_id: string
  employee_code: string | null
  full_name: string
  employee_type: string
  total_approved_hours: number
  rate_snapshot: { rate_type: string; amount: number; currency: string; effective_from: string; effective_to: string | null }[] | null
  period_start: string
  period_end: string
}

function csvCell(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function PayrollClient({ periods }: { periods: PayrollPeriod[] }) {
  const router = useRouter()
  const supabase = createClient()
  const now = new Date()
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [selectedId, setSelectedId] = useState(periods[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  async function openPeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const [year, month] = period.split('-').map(Number)
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('open_payroll_period', { p_month: month, p_year: year })
      if (error || !data) {
        toast.error('Không thể mở kỳ lương. Kiểm tra quyền và tháng đã chọn.')
        return
      }
      setSelectedId(data)
      toast.success('Đã mở kỳ lương')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function exportHours(id = selectedId) {
    if (!id) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('export_payroll_hours', { p_period_id: id })
      if (error) {
        toast.error('Không thể xuất giờ công. Kiểm tra quyền truy cập kỳ lương.')
        return
      }
      const rows = (data ?? []) as PayrollRow[]
      const columns: (keyof PayrollRow)[] = ['employee_code', 'full_name', 'employee_type', 'total_approved_hours', 'rate_snapshot', 'period_start', 'period_end']
      const content = [
        columns.map(csvCell).join(','),
        ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
      ].join('\r\n')
      const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `payroll-hours-${rows[0]?.period_start?.slice(0, 7) || 'period'}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(`Đã xuất ${rows.length} nhân sự`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card title="Kỳ lương" action={<form onSubmit={openPeriod} className="flex items-center gap-2"><input aria-label="Tháng lương" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required /><Button size="sm" type="submit" disabled={busy}><Plus size={14} /> Mở kỳ</Button></form>}>
        {!periods.length ? <EmptyState title="Chưa có kỳ lương" description="Chọn tháng để tạo kỳ và xuất giờ đã duyệt." /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>Kỳ</th><th>Mở lúc</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{periods.map((item) => <tr key={item.id} className={selectedId === item.id ? 'bg-slate-50' : undefined}>
              <td><button type="button" className="font-semibold" onClick={() => setSelectedId(item.id)}>{String(item.year)}-{String(item.month).padStart(2, '0')}</button></td>
              <td>{formatDateTime(item.opened_at)}</td>
              <td><Badge tone={item.status === 'locked' ? 'neutral' : 'ok'}>{item.status === 'locked' ? 'Đã khóa' : 'Đang mở'}</Badge></td>
              <td><Button size="sm" variant="ghost" disabled={busy || item.status === 'locked'} onClick={() => { setSelectedId(item.id); void exportHours(item.id) }}><Download size={14} /> Xuất CSV</Button></td>
            </tr>)}</tbody>
          </table></div>
        )}
        {selectedId && <div className="form-actions"><Button disabled={busy} onClick={() => void exportHours()}><Download size={14} /> Xuất kỳ đang chọn</Button></div>}
      </Card>
      <Card title="Phạm vi dữ liệu">
        <p className="muted">CSV gồm nhân sự đang làm việc, tổng giờ worklog đã được duyệt trong tháng và các mức rate có hiệu lực giao với kỳ. File này chưa tính gross/net, thuế hoặc khấu trừ.</p>
      </Card>
    </div>
  )

}
