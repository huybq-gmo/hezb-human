'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { Dialog } from '@/components/Dialog'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import { formatDate } from '@/lib/presentation'

interface Sprint {
  id: string
  name: string
  start_date: string
  end_date: string
  status: string
}
interface Issue {
  id: string
  title: string
  status: string
  sprint_id: string | null
}

export function ProjectSprintClient({
  projectId,
  sprints,
  issues,
}: {
  projectId: string
  sprints: Sprint[]
  issues: Issue[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const [editing, setEditing] = useState<Sprint | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = user.hasRole('company_owner', 'director', 'project_manager') || user.hasProjectRole(projectId, 'pm')
  const canAssign = canManage || user.hasProjectRole(projectId, 'team_leader')

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('save_project_sprint', {
        p_sprint_id: editing === 'new' ? null : editing.id,
        p_project_id: projectId,
        p_name: String(data.get('name') || '').trim(),
        p_start_date: String(data.get('start_date') || ''),
        p_end_date: String(data.get('end_date') || ''),
        p_status: String(data.get('status') || 'planned'),
      })
      if (error) {
        toast.error(error.message.includes('INVALID_STATE') ? 'Trạng thái Sprint không hợp lệ.' : 'Không thể lưu Sprint.')
        return
      }
      toast.success(editing === 'new' ? 'Đã tạo Sprint' : 'Đã cập nhật Sprint')
      setEditing(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function assignIssue(issueId: string, sprintId: string) {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('assign_issue_to_sprint', {
        p_issue_id: issueId,
        p_sprint_id: sprintId || null,
      })
      if (error) {
        toast.error('Không thể đổi Sprint của ticket.')
        return
      }
      toast.success('Đã cập nhật Sprint cho ticket')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card title="Sprint" action={canManage ? <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Tạo Sprint</Button> : null}>
        {!sprints.length ? <EmptyState title="Chưa có Sprint trong dự án" /> : (
          <div className="card-body stack">
            {sprints.map((sprint) => (
              <section key={sprint.id} className="card">
                <div className="toolbar toolbar-between p-4">
                  <div>
                    <h3 className="font-semibold">{sprint.name}</h3>
                    <small className="muted">{formatDate(sprint.start_date)} → {formatDate(sprint.end_date)}</small>
                  </div>
                  <div className="toolbar">
                    <Badge tone={sprint.status === 'completed' ? 'ok' : sprint.status === 'active' ? 'pr' : 'neutral'}>{sprint.status === 'planned' ? 'Lên kế hoạch' : sprint.status === 'active' ? 'Đang chạy' : 'Hoàn tất'}</Badge>
                    <Link className="btn sm ghost" href={`/dashboard/issues?project=${projectId}&sprint=${sprint.id}`}>Mở board</Link>
                    {canManage && <Button size="sm" variant="ghost" aria-label={`Sửa Sprint ${sprint.name}`} onClick={() => setEditing(sprint)}><Pencil size={14} /></Button>}
                  </div>
                </div>
                {issues.some((issue) => issue.sprint_id === sprint.id) ? (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Ticket</th><th>Trạng thái</th><th>Thuộc Sprint</th></tr></thead>
                      <tbody>{issues.filter((issue) => issue.sprint_id === sprint.id).map((issue) => (
                        <tr key={issue.id}>
                          <td><Link className="text-link" href={`/dashboard/issues/${issue.id}`}>{issue.title}</Link></td><td>{issue.status}</td>
                          <td><select aria-label={`Sprint của ${issue.title}`} disabled={busy || !canAssign} value={issue.sprint_id || ''} onChange={(event) => void assignIssue(issue.id, event.target.value)}>
                            <option value="">Backlog / chưa gán</option>
                            {sprints.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                          </select></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="card-body muted">Chưa có ticket trong Sprint này.</p>}
              </section>
            ))}
          </div>
        )}
      </Card>
      <Card title="Backlog / chưa gán Sprint" action={<Link className="text-link" href={`/dashboard/issues?project=${projectId}&sprint=backlog`}>Mở backlog</Link>}>
        {!issues.some((issue) => !issue.sprint_id) ? <EmptyState title="Không có ticket chưa gán Sprint" /> : <div className="table-scroll"><table>
          <thead><tr><th>Ticket</th><th>Trạng thái</th><th>Gán Sprint</th></tr></thead>
          <tbody>{issues.filter((issue) => !issue.sprint_id).map((issue) => <tr key={issue.id}>
            <td><Link className="text-link" href={`/dashboard/issues/${issue.id}`}>{issue.title}</Link></td><td>{issue.status}</td>
            <td><select aria-label={`Sprint của ${issue.title}`} disabled={busy || !canAssign} value="" onChange={(event) => void assignIssue(issue.id, event.target.value)}>
              <option value="">Chưa gán</option>{sprints.filter((sprint) => sprint.status !== 'completed').map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
            </select></td>
          </tr>)}</tbody>
        </table></div>}
        <p className="card-body muted">Mở board để xem và tìm toàn bộ ticket của dự án.</p>
      </Card>
      {editing && (
        <Dialog title={editing === 'new' ? 'Tạo Sprint' : 'Cập nhật Sprint'} onClose={() => setEditing(null)} busy={busy}>
          <form onSubmit={save}>
            <Field label="Tên Sprint"><input name="name" required maxLength={120} defaultValue={editing === 'new' ? '' : editing.name} autoFocus /></Field>
            <div className="form-grid">
              <Field label="Từ ngày"><input name="start_date" type="date" required defaultValue={editing === 'new' ? '' : editing.start_date} /></Field>
              <Field label="Đến ngày"><input name="end_date" type="date" required defaultValue={editing === 'new' ? '' : editing.end_date} /></Field>
            </div>
            {editing !== 'new' && <Field label="Trạng thái"><select name="status" defaultValue={editing.status}><option value="planned">Lên kế hoạch</option><option value="active">Đang chạy</option><option value="completed">Hoàn tất</option></select></Field>}
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu Sprint'}</Button></div>
          </form>
        </Dialog>
      )}
    </>
  )
}
