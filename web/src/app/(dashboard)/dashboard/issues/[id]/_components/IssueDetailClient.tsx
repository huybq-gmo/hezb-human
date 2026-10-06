'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Paperclip, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { useIssueActions } from '@/components/useIssueActions'
import { HexagonAvatar } from '@/components/HezbLogo'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import {
  formatDate,
  formatDateTime,
  issueCode,
  PRIORITIES,
  ISSUE_TYPES,
} from '@/lib/presentation'
import { cn } from '@/lib/utils'
import { IssueAttachments } from './IssueAttachments'

interface Issue {
  id: string
  project_id: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  due_date: string | null
  story_points: number | null
  is_overdue: boolean
  assignee_id: string | null
  reporter_id: string
  project_project?: { name: string; code: string | null } | null
}
interface Comment {
  id: string
  author: string
  created_at: string
  content: string
  attachments: { name: string; url: string }[]
}
interface Log {
  id: string
  author: string
  created_at: string
  hours: number
  is_billable: boolean
  description: string | null
  work_type: string
}

function CommentText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => (
        <Fragment key={index}>
          {part.startsWith('**') ? (
            <strong>{part.slice(2, -2)}</strong>
          ) : part.startsWith('`') ? (
            <code className="rounded border border-[var(--ln)] bg-[var(--bg)] px-1 text-xs">
              {part.slice(1, -1)}
            </code>
          ) : (
            part
          )}
        </Fragment>
      ))}
    </>
  )
}
const WORK_TYPE_LABELS: Record<string, string> = {
  coding: 'Lập trình',
  study: 'Nghiên cứu / học tập',
  test: 'Kiểm thử',
  meeting: 'Họp',
  review: 'Review',
  support: 'Hỗ trợ',
  other: 'Khác',
}

export function IssueDetailClient({
  issue,
  comments,
  logs,
  assignee,
  reporter,
  assignees,
}: {
  issue: Issue
  comments: Comment[]
  logs: Log[]
  assignee: string | null
  reporter: string | null
  assignees: { id: string; name: string }[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const { busyId, transition, nextStatuses } = useIssueActions()
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [editingIssue, setEditingIssue] = useState(false)
  const [savingIssue, setSavingIssue] = useState(false)
  const canWrite =
    user.hasRole('company_owner', 'project_manager') ||
    user.memberships.some((m) => m.project_id === issue.project_id)
  const canManageIssue =
    user.hasRole('company_owner') ||
    user.hasProjectRole(issue.project_id, 'pm', 'team_leader')
  const canEditIssue =
    !['done', 'cancelled'].includes(issue.status) &&
    (canManageIssue ||
      (issue.reporter_id === user.id && ['backlog', 'todo'].includes(issue.status)))
  const activity = [
    ...comments.map((comment) => ({ type: 'comment' as const, ...comment })),
    ...logs.map((log) => ({ type: 'log' as const, ...log })),
  ]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .filter((item) => filter === 'all' || item.type === filter)
  async function comment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    try {
      const paths: string[] = []
      for (const file of files) {
        const safeName = file.name.replace(/[^\p{L}\p{N}._-]/gu, '_')
        const path = `${issue.project_id}/${issue.id}/${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('issue-attachments')
          .upload(path, file)
        if (uploadError) {
          toast.error(`Không thể tải tệp “${file.name}” lên.`)
          return
        }
        paths.push(path)
      }
      const { error } = await supabase.from('work_issue_comment').insert({
        issue_id: issue.id,
        content: content.trim(),
        created_by: user.id,
        attachment_paths: paths,
      })
      if (error) {
        toast.error('Không thể lưu bình luận. Vui lòng thử lại.')
        return
      }
      setContent('')
      setFiles([])
      setPreview(false)
      toast.success('Đã thêm bình luận')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }
  async function updateIssue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const fields: Record<string, string | number | null> = {
      title: String(data.get('title') || '').trim(),
      description: String(data.get('description') || '').trim() || null,
    }
    if (canManageIssue) {
      fields.priority = String(data.get('priority'))
      fields.assignee_id = String(data.get('assignee_id') || '') || null
      fields.story_points = String(data.get('story_points') || '')
        ? Number(data.get('story_points'))
        : null
      fields.due_date = String(data.get('due_date') || '') || null
    }
    setSavingIssue(true)
    try {
      const { error } = await supabase.rpc('update_issue_fields', {
        p_issue_id: issue.id,
        p_fields: fields,
      })
      if (error) {
        toast.error(
          error.message.includes('ISSUE_CLOSED')
            ? 'Không thể sửa ticket đã đóng.'
            : 'Không thể cập nhật ticket. Hãy kiểm tra quyền và trạng thái.',
        )
        return
      }
      toast.success('Đã cập nhật ticket')
      setEditingIssue(false)
      router.refresh()
    } finally {
      setSavingIssue(false)
    }
  }
  const logLink = `/dashboard/worklogs?log=1&project=${issue.project_id}&issue=${issue.id}`
  return (
    <div className="stack">
      <div>
        <div className="toolbar mb-2">
          <Link
            className="text-link"
            href={`/dashboard/issues?project=${issue.project_id}`}
          >
            ← Board & ticket
          </Link>
          <span className="issue-kind num muted">
            <i className={issue.type} />
            {issueCode(issue)}
          </span>
          <Link
            className="text-link"
            href={`/dashboard/projects/${issue.project_id}`}
          >
            {issue.project_project?.name}
          </Link>
        </div>
        <div className="toolbar toolbar-between">
          <h2 className="detail-title">{issue.title}</h2>
          {canEditIssue && <Button size="sm" variant="ghost" onClick={() => setEditingIssue(true)}><Pencil size={14} /> Sửa ticket</Button>}
        </div>
      </div>
      <div className="detail-grid">
        <div className="stack">
          <Card title="Mô tả">
            <div className="card-body whitespace-pre-wrap">
              {issue.description ? (
                <CommentText text={issue.description} />
              ) : (
                <span className="muted">Chưa có mô tả.</span>
              )}
            </div>
          </Card>
          <div className="toolbar">
            <b className="font-semibold">Hoạt động</b>
            {[
              ['all', 'Tất cả'],
              ['comment', 'Bình luận'],
              ['log', 'Log work'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={cn('f', filter === value && 'on')}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="activity">
            {!activity.length ? (
              <Card>
                <EmptyState title="Chưa có hoạt động" />
              </Card>
            ) : (
              activity.map((item) => (
                <div key={`${item.type}-${item.id}`} className="activity-item">
                  <HexagonAvatar name={item.author} />
                  {item.type === 'comment' ? (
                    <Card
                      title={
                        <span>
                          <b>{item.author}</b>{' '}
                          <span className="muted">đã bình luận</span>
                        </span>
                      }
                      action={
                        <small className="muted">
                          {formatDateTime(item.created_at)}
                        </small>
                      }
                    >
                      <div className="card-body">
                        <CommentText text={item.content} />
                        {!!item.attachments.length && (
                          <ul className="mt-3 grid gap-2 border-t border-[var(--ln)] pt-3">
                            {item.attachments.map((file) => (
                              <li key={file.url}>
                                <a className="text-link" href={file.url} target="_blank" rel="noopener noreferrer"><Paperclip size={14} className="mr-1 inline" />{file.name}</a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </Card>
                  ) : (
                    <div className="card-body flex flex-wrap items-center gap-2">
                      <Clock size={15} className="text-[var(--cy)]" />
                      <span>
                        <b>{item.author}</b> đã log{' '}
                        <b className="num">{item.hours}h</b>
                        {item.description ? ` — ${item.description}` : ''}
                      </span>
                      <Badge tone="neutral">{WORK_TYPE_LABELS[item.work_type] || item.work_type}</Badge>
                      <Badge tone={item.is_billable ? 'ok' : 'neutral'}>
                        {item.is_billable ? 'Billable' : 'Non-billable'}
                      </Badge>
                      <small className="muted">
                        {formatDateTime(item.created_at)}
                      </small>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {canWrite && (
            <div className="activity-item">
              <HexagonAvatar name={user.name} />
              <Card>
                <form onSubmit={comment}>
                  <div className="tabs">
                    <button
                      type="button"
                      className={cn(!preview && 'on')}
                      aria-pressed={!preview}
                      onClick={() => setPreview(false)}
                    >
                      Viết
                    </button>
                    <button
                      type="button"
                      className={cn(preview && 'on')}
                      aria-pressed={preview}
                      onClick={() => setPreview(true)}
                    >
                      Xem trước
                    </button>
                  </div>
                  <div className="card-body grid gap-3">
                    {preview ? (
                      <div className="whitespace-pre-wrap min-h-24">
                        {content ? (
                          <CommentText text={content} />
                        ) : (
                          <span className="muted">
                            Chưa có nội dung để xem trước.
                          </span>
                        )}
                      </div>
                    ) : (
                      <textarea
                        aria-label="Nội dung bình luận"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Viết bình luận…"
                        maxLength={10000}
                      />
                    )}
                    <div className="toolbar toolbar-between">
                      <div className="toolbar">
                        <label className="btn sm ghost cursor-pointer">
                          <Paperclip size={14} />
                          Đính kèm tệp
                          <input
                            className="sr-only"
                            type="file"
                            multiple
                            onChange={(event) => {
                              const selected = Array.from(event.target.files || [])
                              const valid = selected.filter((file) => file.size <= 10 * 1024 * 1024)
                              if (valid.length !== selected.length) toast.error('Mỗi tệp tối đa 10 MB.')
                              setFiles((current) => {
                                const next = [...current, ...valid]
                                if (next.length > 5) toast.error('Mỗi bình luận đính kèm tối đa 5 tệp.')
                                return next.slice(0, 5)
                              })
                              event.target.value = ''
                            }}
                          />
                        </label>
                        <small className="muted">Tối đa 5 tệp, 10 MB mỗi tệp · **đậm** · `code`</small>
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saving || !content.trim()}
                      >
                        {saving ? 'Đang lưu…' : 'Gửi bình luận'}
                      </Button>
                    </div>
                    {!!files.length && (
                      <ul className="flex flex-wrap gap-2 text-sm">
                        {files.map((file, index) => (
                          <li key={`${file.name}-${index}`} className="badge">
                            {file.name}
                            <button type="button" aria-label={`Bỏ ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>×</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </form>
              </Card>
            </div>
          )}
          <IssueAttachments
            projectId={issue.project_id}
            issueId={issue.id}
            canUpload={canWrite}
            canManage={canManageIssue}
          />
        </div>
        <div className="stack">
          <Card title="Thông tin ticket">
            <dl className="card-body key-values">
              <dt>Trạng thái</dt>
              <dd>
                <StatusBadge status={issue.status} />
              </dd>
              <dt>Assignee</dt>
              <dd>
                {assignee ? (
                  <div className="who">
                    <HexagonAvatar
                      name={assignee}
                      className="w-6 h-7 text-[10px]"
                    />
                    <span>{assignee}</span>
                  </div>
                ) : (
                  'Chưa phân công'
                )}
              </dd>
              <dt>Reporter</dt>
              <dd>{reporter || '—'}</dd>
              <dt>Loại</dt>
              <dd>{ISSUE_TYPES[issue.type] || issue.type}</dd>
              <dt>Ưu tiên</dt>
              <dd>
                <Badge
                  tone={
                    ['critical', 'high'].includes(issue.priority)
                      ? 'er'
                      : 'neutral'
                  }
                >
                  {PRIORITIES[issue.priority]}
                </Badge>
              </dd>
              <dt>Story points</dt>
              <dd className="num">{issue.story_points ?? '—'}</dd>
              <dt>Thời hạn</dt>
              <dd className="num">
                {formatDate(issue.due_date)}
                {issue.is_overdue && (
                  <div className="mt-1">
                    <StatusBadge status="overdue" />
                  </div>
                )}
              </dd>
            </dl>
            {nextStatuses(issue).length > 0 && (
              <div className="card-body border-t border-[var(--ln)]">
                <p className="muted mb-3">Chuyển trạng thái</p>
                <div className="toolbar">
                  {nextStatuses(issue).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant="ghost"
                      disabled={!!busyId}
                      onClick={() => void transition(issue, status)}
                    >
                      {
                        (
                          {
                            todo: 'Cần làm',
                            in_progress: 'Đang làm',
                            in_review: 'Review',
                            done: 'Hoàn thành',
                            blocked: 'Chặn',
                            backlog: 'Backlog',
                            cancelled: 'Hủy',
                          } as Record<string, string>
                        )[status]
                      }
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card
            title="Thời gian"
            action={
              canWrite && (
                <Link href={logLink} className="btn sm">
                  <Plus size={13} />
                  Log work
                </Link>
              )
            }
          >
            <div className="card-body">
              <b className="num text-2xl font-semibold">
                {logs.reduce((sum, log) => sum + Number(log.hours), 0)}h
              </b>
              <p className="muted">
                Tổng giờ từ {logs.length} log gần nhất bạn được xem.
              </p>
            </div>
          </Card>
        </div>
      </div>
      {editingIssue && (
        <Dialog title="Sửa ticket" onClose={() => setEditingIssue(false)} busy={savingIssue}>
          <form onSubmit={updateIssue}>
            <Field label="Tiêu đề"><input name="title" required maxLength={250} defaultValue={issue.title} autoFocus /></Field>
            <Field label="Mô tả"><textarea name="description" maxLength={10000} defaultValue={issue.description || ''} /></Field>
            {canManageIssue && <>
              <div className="form-grid">
                <Field label="Ưu tiên"><select name="priority" defaultValue={issue.priority}>{Object.entries(PRIORITIES).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
                <Field label="Story points"><input name="story_points" type="number" min="0" max="100" step="1" defaultValue={issue.story_points ?? ''} /></Field>
              </div>
              <div className="form-grid">
                <Field label="Người phụ trách"><select name="assignee_id" defaultValue={issue.assignee_id || ''}><option value="">Chưa phân công</option>{assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field>
                <Field label="Hạn hoàn thành"><input name="due_date" type="date" defaultValue={issue.due_date || ''} /></Field>
              </div>
            </>}
            {!canManageIssue && <p className="card-body muted">Người tạo chỉ có thể sửa tiêu đề và mô tả khi ticket còn ở Backlog hoặc Cần làm.</p>}
            <div className="form-actions"><Button variant="ghost" disabled={savingIssue} onClick={() => setEditingIssue(false)}>Hủy</Button><Button type="submit" disabled={savingIssue}>{savingIssue ? 'Đang lưu…' : 'Lưu thay đổi'}</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
