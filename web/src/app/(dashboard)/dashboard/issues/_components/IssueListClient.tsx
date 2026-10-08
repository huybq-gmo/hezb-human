'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { IssueParentPicker } from '@/components/IssueParentPicker'
import { Kanban, List, Plus, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { useIssueActions } from '@/components/useIssueActions'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SearchField,
} from '@/components/ui'
import {
  formatDate,
  issueCode,
  PRIORITIES,
  ISSUE_TYPES,
  STATUS_LABELS,
} from '@/lib/presentation'
import { cn } from '@/lib/utils'

export interface Issue {
  id: string
  project_id: string
  type: string
  title: string
  status: string
  priority: string
  story_points: number | null
  due_date: string | null
  is_overdue: boolean | null
  sla_status: string | null
  project_project?: { name: string; code: string | null } | null
}
interface Project {
  id: string
  name: string
  code: string | null
}
const COLUMNS = ['todo', 'in_progress', 'in_review', 'done']

export function IssueListClient({
  issues,
  projects,
  initialProject = '',
  initialSprint = '',
  initialSearch = '',
  initialOverdue = false,
  sprints,
}: {
  issues: Issue[]
  projects: Project[]
  initialProject?: string
  initialSprint?: string
  initialSearch?: string
  initialOverdue?: boolean
  sprints: { id: string; project_id: string; name: string; status: string }[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()
  const user = useWorkspace()
  const { busyId, transition, nextStatuses } = useIssueActions()
  const [project, setProject] = useState(initialProject)
  const [search, setSearch] = useState(initialSearch)
  const overdue = initialOverdue
  const [newProject, setNewProject] = useState(initialProject)
  const [view, setView] = useState('kanban')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const canCreate =
    user.hasRole('company_owner', 'project_manager') ||
    user.memberships.some((m) => !project || m.project_id === project)
  const filtered = issues.filter(
    (issue) =>
      (!project || issue.project_id === project) &&
      (!overdue || issue.is_overdue),
  )
  const columns = [
    ...COLUMNS,
    ...['backlog', 'blocked', 'cancelled'].filter((status) =>
      filtered.some((issue) => issue.status === status),
    ),
  ]
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    const { error } = await supabase.from('work_issue').insert({
      project_id: data.get('project_id'),
      title: String(data.get('title')).trim(),
      type: data.get('type'),
      priority: data.get('priority'),
      description: data.get('description') || null,
      due_date: data.get('due_date') || null,
      status: 'backlog',
      reporter_id: user.id,
      created_by: user.id,
      parent_id: String(data.get('parent_id') || '') || null,
    })
    setSaving(false)
    if (error) {
      toast.error('Không thể tạo ticket. Kiểm tra quyền truy cập dự án.')
      return
    }
    toast.success('Đã tạo ticket trong backlog')
    setCreating(false)
    router.refresh()
  }
  const actions = (issue: Issue) => (
    <div className="toolbar">
      {nextStatuses(issue).map((target) => (
        <Button
          key={target}
          variant="ghost"
          size="sm"
          disabled={busyId !== null}
          onClick={() => void transition(issue, target)}
        >
          <ArrowRight size={12} />
          {STATUS_LABELS[target]}
        </Button>
      ))}
    </div>
  )
  function navigate(updates: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value); else next.delete(key)
    }
    next.delete('page')
    router.push(`/dashboard/issues?${next}`)
  }
  return (
    <div className="stack">
      <div className="toolbar toolbar-between">
        <div className="toolbar">
          <select
            aria-label="Lọc dự án"
            value={project}
            onChange={(e) => { setProject(e.target.value); navigate({ project: e.target.value, sprint: '' }) }}
          >
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className={cn('f', overdue && 'on')}
            aria-pressed={overdue}
            onClick={() => navigate({ overdue: overdue ? '' : '1' })}
          >
            Quá hạn
          </button>
          <select aria-label="Lọc Sprint" value={initialSprint} onChange={(event) => navigate({ sprint: event.target.value })}>
            <option value="">Tất cả Sprint</option><option value="backlog">Backlog / chưa gán</option>
            {sprints.filter((sprint) => !project || sprint.project_id === project).map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
          </select>
          <form className="toolbar" onSubmit={(event) => { event.preventDefault(); navigate({ q: search }) }}><SearchField
            placeholder="Tìm ticket…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          /><Button type="submit" size="sm" variant="ghost">Tìm</Button></form>
        </div>
        <div className="toolbar">
          <button
            className={cn(
              'ib',
              view === 'kanban' && 'text-[var(--pri)] bg-[var(--pri-s)]',
            )}
            aria-label="Xem Kanban"
            aria-pressed={view === 'kanban'}
            onClick={() => setView('kanban')}
          >
            <Kanban size={17} />
          </button>
          <button
            className={cn(
              'ib',
              view === 'list' && 'text-[var(--pri)] bg-[var(--pri-s)]',
            )}
            aria-label="Xem danh sách"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <List size={17} />
          </button>
          {canCreate && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={15} />
              Tạo ticket
            </Button>
          )}
        </div>
      </div>
      <p className="muted">
        {filtered.length} ticket · Kéo ticket sang cột khác hoặc dùng nút chuyển
        trạng thái.
      </p>
      {view === 'kanban' ? (
        <div className="kanban">
          {columns.map((status) => {
            const columnIssues = filtered.filter(
              (issue) => issue.status === status,
            )
            return (
              <section
                key={status}
                className={cn(
                  'kanban-column',
                  dragOver === status && 'drag-over',
                )}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOver(status)
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOver(null)
                  const issue = issues.find(
                    (issue) =>
                      issue.id === event.dataTransfer.getData('text/plain'),
                  )
                  if (issue && issue.status !== status)
                    void transition(issue, status)
                }}
              >
                <h2>
                  {STATUS_LABELS[status]}
                  <span>{columnIssues.length}</span>
                </h2>
                {columnIssues.map((issue) => (
                  <article
                    key={issue.id}
                    className="issue-card"
                    draggable={nextStatuses(issue).length > 0 && !busyId}
                    onDragStart={(event) =>
                      event.dataTransfer.setData('text/plain', issue.id)
                    }
                  >
                    <div className="issue-meta">
                      <span className="issue-kind num">
                        <i className={issue.type} />
                        {issueCode(issue)}
                      </span>
                      <Badge
                        tone={
                          issue.priority === 'critical' ||
                          issue.priority === 'high'
                            ? 'er'
                            : 'neutral'
                        }
                      >
                        {PRIORITIES[issue.priority] || issue.priority}
                      </Badge>
                    </div>
                    <Link href={`/dashboard/issues/${issue.id}`}>
                      {issue.title}
                    </Link>
                    {issue.is_overdue ? (
                      <StatusBadge status="overdue" />
                    ) : (
                      issue.sla_status === 'at_risk' && (
                        <StatusBadge status="at_risk" />
                      )
                    )}
                    <div className="issue-meta">
                      <span>{issue.project_project?.name}</span>
                      <span className="num">
                        {issue.story_points != null
                          ? `${issue.story_points} pt`
                          : formatDate(issue.due_date)}
                      </span>
                    </div>
                    {actions(issue)}
                  </article>
                ))}
                {!columnIssues.length && (
                  <p className="muted text-center py-8">Chưa có ticket</p>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <Card>
          {!filtered.length ? (
            <EmptyState title="Không có ticket phù hợp" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Công việc</th>
                    <th>Dự án</th>
                    <th>Trạng thái</th>
                    <th>Ưu tiên</th>
                    <th>Hạn</th>
                    <th>Chuyển tiếp</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <small className="muted num">{issueCode(issue)}</small>
                        <Link
                          className="block font-medium hover:text-[var(--pri)]"
                          href={`/dashboard/issues/${issue.id}`}
                        >
                          {issue.title}
                        </Link>
                      </td>
                      <td>{issue.project_project?.name || '—'}</td>
                      <td>
                        <StatusBadge status={issue.status} />
                      </td>
                      <td>
                        <Badge
                          tone={
                            ['high', 'critical'].includes(issue.priority)
                              ? 'er'
                              : 'neutral'
                          }
                        >
                          {PRIORITIES[issue.priority]}
                        </Badge>
                      </td>
                      <td className="num whitespace-nowrap">
                        {formatDate(issue.due_date)}
                        {issue.is_overdue && (
                          <div className="mt-1">
                            <StatusBadge status="overdue" />
                          </div>
                        )}
                      </td>
                      <td>{actions(issue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {creating && (
        <Dialog
          title="Tạo ticket"
          onClose={() => setCreating(false)}
          busy={saving}
        >
          <form onSubmit={create}>
            <Field label="Dự án">
              <select name="project_id" required value={newProject} onChange={(event) => setNewProject(event.target.value)}>
                <option value="">Chọn dự án</option>
                {projects
                  .filter(
                    (p) =>
                      user.hasRole('company_owner', 'project_manager') ||
                      user.memberships.some((m) => m.project_id === p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <IssueParentPicker key={newProject} projectId={newProject} />
            <Field label="Tiêu đề">
              <input
                name="title"
                required
                maxLength={250}
                autoFocus
                placeholder="Ticket này cần làm gì?"
              />
            </Field>
            <div className="form-grid">
              <Field label="Loại">
                <select name="type">
                  {Object.entries(ISSUE_TYPES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ưu tiên">
                <select name="priority" defaultValue="medium">
                  {Object.entries(PRIORITIES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Hạn hoàn thành">
              <input name="due_date" type="date" />
            </Field>
            <Field label="Mô tả">
              <textarea name="description" />
            </Field>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Đang tạo…' : 'Tạo ticket'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
