'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, EmptyState, Field } from '@/components/ui'

interface Availability {
  employee_id: string
  full_name: string
  available_hours: number
  allocated_percent: number
}
function localDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
}

export function CapacityClient() {
  const today = localDate(new Date())
  const supabase = createClient()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState<Availability[]>([])
  const [busy, setBusy] = useState(false)

  async function load(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (to < from) {
      toast.error('Ngày kết thúc phải từ ngày bắt đầu trở đi.')
      return
    }
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('employee_availability', {
        p_start_date: from,
        p_end_date: to,
      })
      if (error) {
        toast.error('Không thể tải dữ liệu năng lực nhân sự.')
        return
      }
      setRows((data ?? []) as Availability[])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card title="Khoảng thời gian">
        <form onSubmit={load} className="card-body">
          <div className="form-grid">
            <Field label="Từ ngày"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required /></Field>
            <Field label="Đến ngày"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} required /></Field>
          </div>
          <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? 'Đang tính…' : 'Tính năng lực'}</Button></div>
        </form>
      </Card>
      <Card title="Năng lực theo nhân sự" action={<span className="muted">{rows.length} nhân sự</span>}>
        {!rows.length ? <EmptyState title="Chọn khoảng ngày để xem năng lực" /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Nhân sự</th><th>Giờ còn khả dụng</th><th>Đã phân bổ</th><th>Tình trạng</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.full_name}</td>
                  <td className="num">{Number(row.available_hours).toFixed(1)}h</td>
                  <td className="num">{Number(row.allocated_percent).toFixed(1)}%</td>
                  <td>{Number(row.allocated_percent) >= 100 ? <span className="chip er">Đã đủ tải</span> : Number(row.allocated_percent) >= 80 ? <span className="chip wn">Gần đủ tải</span> : <span className="chip ok">Còn năng lực</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
