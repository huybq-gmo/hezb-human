'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, Field } from '@/components/ui'
import { formatDateTime } from '@/lib/presentation'

interface AuditLog {
  id: string
  actor_id: string | null
  table_name: string
  record_id: string | null
  action: string
  before_masked: Record<string, unknown> | null
  after_masked: Record<string, unknown> | null
  occurred_at: string
}

const PAGE_SIZE = 50
const TABLES = [
  'core_role_assignment', 'core_role_permission', 'project_membership', 'hr_employee', 'hr_team', 'hr_team_membership', 'hr_leave_balance',
  'hr_leave_request', 'project_client', 'project_proposal', 'project_project',
  'project_milestone', 'work_issue', 'work_issue_comment', 'work_worklog',
  'work_timesheet', 'work_attendance',
]

export function AuditLogClient({
  initialLogs,
  total: initialTotal,
  profiles,
}: {
  initialLogs: AuditLog[]
  total: number
  profiles: { id: string; full_name: string | null }[]
}) {
  const supabase = createClient()
  const [logs, setLogs] = useState(initialLogs)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [filters, setFilters] = useState({ actor: '', table: '', action: '', from: '', to: '' })
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]))

  async function load(nextPage = 0) {
    setBusy(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('occurred_at', { ascending: false })
        .range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1)
      if (filters.actor) query = query.eq('actor_id', filters.actor)
      if (filters.table) query = query.eq('table_name', filters.table)
      if (filters.action.trim()) query = query.ilike('action', `%${filters.action.trim()}%`)
      if (filters.from) query = query.gte('occurred_at', `${filters.from}T00:00:00`)
      if (filters.to) query = query.lt('occurred_at', `${filters.to}T23:59:59.999`)
      const { data, error, count } = await query
      if (error) {
        toast.error('Không thể tải nhật ký. Hãy kiểm tra quyền truy cập.')
        return
      }
      setLogs(data ?? [])
      setTotal(count ?? 0)
      setPage(nextPage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card title="Bộ lọc">
        <div className="card-body grid grid-cols-1 md:grid-cols-5 gap-4">
          <Field label="Người thực hiện">
            <select value={filters.actor} onChange={(event) => setFilters({ ...filters, actor: event.target.value })}>
              <option value="">Tất cả</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.id.slice(0, 8)}</option>)}
            </select>
          </Field>
          <Field label="Bảng dữ liệu">
            <select value={filters.table} onChange={(event) => setFilters({ ...filters, table: event.target.value })}>
              <option value="">Tất cả</option>
              {TABLES.map((table) => <option key={table}>{table}</option>)}
            </select>
          </Field>
          <Field label="Hành động"><input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="INSERT, UPDATE…" /></Field>
          <Field label="Từ ngày"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Field>
          <Field label="Đến ngày"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Field>
        </div>
        <div className="form-actions"><Button disabled={busy} onClick={() => void load(0)}>{busy ? 'Đang tải…' : 'Lọc nhật ký'}</Button></div>
      </Card>
      <Card title="Nhật ký" action={<span className="muted">{total} bản ghi · 50 mỗi trang</span>}>
        {!logs.length ? <p className="card-body muted">Không có bản ghi phù hợp.</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Bảng</th><th>Hành động</th><th>Bản ghi</th><th>Chi tiết đã mask</th></tr></thead>
              <tbody>{logs.map((log) => (
                <tr key={log.id}>
                  <td className="num muted whitespace-nowrap">{formatDateTime(log.occurred_at)}</td>
                  <td>{names.get(log.actor_id || '') || log.actor_id?.slice(0, 8) || 'Hệ thống'}</td>
                  <td><code>{log.table_name}</code></td>
                  <td>{log.action}</td>
                  <td><code>{log.record_id?.slice(0, 8) || '—'}</code></td>
                  <td><details><summary>Xem</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ before: log.before_masked, after: log.after_masked }, null, 2)}</pre></details></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="form-actions">
          <Button variant="ghost" disabled={busy || page === 0} onClick={() => void load(page - 1)}>Trước</Button>
          <span className="muted">Trang {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          <Button variant="ghost" disabled={busy || (page + 1) * PAGE_SIZE >= total} onClick={() => void load(page + 1)}>Sau</Button>
        </div>
      </Card>
    </div>
  )
}
