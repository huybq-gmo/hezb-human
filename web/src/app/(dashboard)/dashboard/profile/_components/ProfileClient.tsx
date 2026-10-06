'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { HexagonAvatar } from '@/components/HezbLogo'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { APP_ROLE_LABELS, type AppRole, type UserProfile } from '@/lib/types'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import {
  formatDate,
  formatDateTime,
  effectiveMembershipStatus,
  PROJECT_ROLES,
} from '@/lib/presentation'

interface Role {
  id: string
  role: AppRole
  granted_at: string
  expires_at: string | null
}
interface Membership {
  id: string
  project_id: string
  project_role: string
  status: string
  start_date: string
  end_date: string | null
  project_project?: { name: string } | null
}
interface Log {
  id: string
  occurred_at: string
  action: string
  table_name: string
}
interface Props {
  user: { id: string; email: string }
  profile: UserProfile | null
  roles: Role[]
  memberships: Membership[]
  recentLogs: Log[]
  canAudit: boolean
}

export function ProfileClient({
  user,
  profile,
  roles,
  memberships,
  recentLogs,
  canAudit,
}: Props) {
  const router = useRouter()
  const workspace = useWorkspace()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(
      new FormData(event.currentTarget).get('name') || '',
    ).trim()
    if (!name) return
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('core_user_profile')
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('id')
        .maybeSingle()
      if (error || !data) {
        toast.error('Không thể cập nhật hồ sơ. Vui lòng thử lại.')
        return
      }
      toast.success('Đã cập nhật họ tên')
      setEditing(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <Card>
        <div className="card-body flex flex-wrap items-center justify-between gap-5">
          <div className="who">
            <HexagonAvatar
              name={profile?.full_name || user.email}
              className="w-14 h-16 text-base"
            />
            <div>
              <div className="toolbar profile-heading">
                <h2 className="detail-title">
                  {profile?.full_name || 'Chưa cập nhật họ tên'}
                </h2>
                <Badge tone={profile?.is_active === false ? 'er' : 'ok'}>
                  {profile?.is_active === false ? 'Tạm khóa' : 'Hoạt động'}
                </Badge>
              </div>
              <p className="muted mt-1 break-all">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            Sửa họ tên
          </Button>
        </div>
      </Card>
      <div className="two-columns">
        <Card title="Vai trò hệ thống">
          {!roles.length && !workspace.roles.length ? (
            <EmptyState title="Chưa có vai trò được cấp" />
          ) : (
            <div className="card-body stack">
              {roles.length
                ? roles.map((role) => (
                    <div key={role.id} className="summary-row">
                      <div>
                        <Badge tone="pr">{APP_ROLE_LABELS[role.role]}</Badge>
                        <small className="block muted mt-1">
                          Gán ngày {formatDate(role.granted_at)}
                        </small>
                      </div>
                      <span className="muted">
                        {role.expires_at
                          ? `Hết hạn ${formatDate(role.expires_at)}`
                          : 'Vô thời hạn'}
                      </span>
                    </div>
                  ))
                : workspace.roles.map((role) => (
                    <Badge key={role} tone="pr">
                      {APP_ROLE_LABELS[role]}
                    </Badge>
                  ))}
            </div>
          )}
        </Card>
        <Card title="Dự án tham gia">
          {!memberships.length ? (
            <EmptyState title="Bạn chưa tham gia dự án nào" />
          ) : (
            <div className="card-body">
              {memberships.map((member) => (
                <div key={member.id} className="summary-row">
                  <div>
                    <Link
                      href={`/dashboard/projects/${member.project_id}`}
                      className="font-medium hover:text-[var(--pri)]"
                    >
                      {member.project_project?.name || 'Dự án'}
                    </Link>
                    <small className="block muted">
                      {PROJECT_ROLES[member.project_role]}
                    </small>
                  </div>
                  <StatusBadge status={effectiveMembershipStatus(member)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      {canAudit && (
        <Card title="Hoạt động tài khoản gần đây">
          {!recentLogs.length ? (
            <EmptyState title="Chưa có hoạt động được ghi nhận" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Thao tác</th>
                    <th>Đối tượng</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="num muted">
                        {formatDateTime(log.occurred_at)}
                      </td>
                      <td>{log.action}</td>
                      <td>{log.table_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {editing && (
        <Dialog
          title="Cập nhật họ tên"
          onClose={() => setEditing(false)}
          busy={busy}
        >
          <form onSubmit={save}>
            <Field label="Họ và tên">
              <input
                name="name"
                defaultValue={profile?.full_name || ''}
                required
                maxLength={120}
                autoFocus
                autoComplete="name"
              />
            </Field>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
