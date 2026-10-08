'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { APP_ROLE_LABELS, type AppRole } from '@/lib/types'
import { HexagonAvatar } from '@/components/HezbLogo'
import { Dialog } from '@/components/Dialog'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
} from '@/components/ui'
import { formatDate, formatDateTime } from '@/lib/presentation'

interface Assignment {
  id: string
  user_id: string
  role: AppRole
  granted_at: string
  expires_at: string | null
  core_user_profile?: { full_name: string | null } | null
}
interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  table_name: string
  occurred_at: string
  after_masked: { role?: string; user_id?: string; code?: string; label?: string; permission?: string; capability?: string } | null
}
interface RolePermission {
  role: AppRole
  permission: string
  enabled: boolean
}
interface PermissionDefinition {
  code: string
  label: string
  description: string | null
  capability: AppRole
  is_system: boolean
}
interface Props {
  isCompanyOwner: boolean
  initialData: Assignment[]
  userList: { id: string; full_name: string | null }[]
  auditLogs: AuditLog[]
  permissions: RolePermission[]
  permissionDefinitions: PermissionDefinition[]
}

const CAPABILITY_HELP: Record<AppRole, string> = {
  company_owner: 'Quản trị toàn hệ thống; luôn được bảo vệ.',
  hr_admin: 'Nhân sự, nghỉ phép, cân đối năng lực và duyệt timesheet bước Leader.',
  finance_admin: 'Dữ liệu tài chính; chỉ người có role Finance Admin mới có quyền này.',
  director: 'Duyệt proposal/milestone và xem tổng quan tài chính theo chính sách.',
  project_manager: 'Quản lý proposal, dự án, membership và phân bổ nhân sự.',
  team_leader: 'Quyền điều phối nhóm và duyệt timesheet bước Leader.',
  developer: 'Thực hiện issue, comment và worklog trong dự án được gán.',
  qa_reviewer: 'Duyệt luồng QA trong dự án được gán.',
  auditor: 'Đọc audit và dữ liệu tài chính ở chế độ chỉ xem.',
}

export function RoleManagementClient({
  isCompanyOwner,
  initialData,
  userList,
  auditLogs,
  permissions,
  permissionDefinitions,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [creating, setCreating] = useState(false)
  const [creatingPermission, setCreatingPermission] = useState(false)
  const [revoking, setRevoking] = useState<Assignment | null>(null)
  const [busy, setBusy] = useState(false)
  const [savingPermission, setSavingPermission] = useState('')
  const filtered = initialData
  const names = new Map(userList.map((user) => [user.id, user.full_name]))
  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('assign_role', {
        p_target_user_id: data.get('user_id'),
        p_role: data.get('role'),
        p_expires_at: data.get('expires_at') || null,
      })
      if (error) {
        toast.error(
          'Không thể gán vai trò. Vui lòng kiểm tra quyền và thử lại.',
        )
        return
      }
      toast.success('Đã gán vai trò. Quyền mới có hiệu lực ngay.')
      setCreating(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function revoke() {
    if (!revoking) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('revoke_role', {
        p_target_user_id: revoking.user_id,
        p_role: revoking.role,
      })
      if (error) {
        toast.error('Không thể thu hồi vai trò. Vui lòng thử lại.')
        return
      }
      toast.success('Đã thu hồi vai trò')
      setRevoking(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function configurePermission(role: AppRole, permission: string, enabled: boolean) {
    const key = `${role}:${permission}`
    setSavingPermission(key)
    try {
      const { error } = await supabase.rpc('configure_role_permission', {
        p_role: role,
        p_permission: permission,
        p_enabled: enabled,
      })
      if (error) {
        toast.error(error.message.includes('PROTECTED_PERMISSION') ? 'Quyền Owner và Finance được bảo vệ.' : 'Không thể cập nhật ma trận quyền.')
        return
      }
      toast.success('Đã cập nhật capability. Quyền có hiệu lực ngay ở database.')
      router.refresh()
    } finally {
      setSavingPermission('')
    }
  }
  async function createPermission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('create_permission_code', {
        p_code: data.get('code'),
        p_label: data.get('label'),
        p_description: data.get('description'),
        p_capability: data.get('capability'),
      })
      if (error) {
        toast.error(error.message.includes('PERMISSION_CODE_EXISTS') ? 'Mã quyền này đã tồn tại.' : 'Không thể tạo mã quyền. Kiểm tra mã và capability được chọn.')
        return
      }
      toast.success('Đã tạo mã quyền. Hãy bật mã này cho role trong ma trận.')
      setCreatingPermission(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      {!isCompanyOwner && (
        <div className="notice">
          Bạn có thể xem các vai trò được cấp. Chỉ Company Owner có quyền thay
          đổi phân quyền.
        </div>
      )}
      <div className="toolbar toolbar-between">

        {isCompanyOwner && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus size={15} />
            Gán vai trò
          </Button>
        )}
      </div>
      <Card
        title="Vai trò hệ thống"
        action={<span className="muted">{filtered.length} bản ghi</span>}
      >
        {!filtered.length ? (
          <EmptyState title="Không tìm thấy phân quyền phù hợp" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>Vai trò</th>
                  <th>Ngày cấp</th>
                  <th>Hết hạn</th>
                  {isCompanyOwner && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="who">
                        <HexagonAvatar name={a.core_user_profile?.full_name} />
                        <div>
                          <p className="font-medium">
                            {a.core_user_profile?.full_name || 'Thành viên'}
                          </p>
                          <small>{a.user_id.slice(0, 8)}…</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge
                        tone={
                          a.role === 'company_owner' || a.role === 'director'
                            ? 'pr'
                            : 'neutral'
                        }
                      >
                        {APP_ROLE_LABELS[a.role]}
                      </Badge>
                    </td>
                    <td className="num muted">{formatDate(a.granted_at)}</td>
                    <td className="num">
                      {a.expires_at ? formatDate(a.expires_at) : 'Vô thời hạn'}
                    </td>
                    {isCompanyOwner && (
                      <td>
                        {a.role !== 'company_owner' && (
                          <Button
                            variant="danger"
                            size="sm"
                            aria-label={`Thu hồi ${APP_ROLE_LABELS[a.role]} của ${a.core_user_profile?.full_name || 'thành viên'}`}
                            onClick={() => setRevoking(a)}
                          >
                            <Trash2 size={14} />
                            Thu hồi
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {isCompanyOwner && (
        <Card title="Capability theo vai trò" action={<Button size="sm" variant="ghost" onClick={() => setCreatingPermission(true)}>Tạo mã quyền</Button>}>
          <p className="card-body muted">Chọn capability cho từng role. Có thể tạo mã tùy chỉnh gắn với một capability hiện có; quyền Owner và Finance luôn được bảo vệ. Thay đổi có audit và hiệu lực ngay tại database.</p>
          <div className="table-scroll"><table>
            <thead><tr><th>Role được gán</th>{permissionDefinitions.filter((permission) => permission.capability !== 'company_owner').map((permission) => <th key={permission.code} className="text-center" title={permission.description || permission.code}>{permission.label}{!permission.is_system && <small className="block muted">{permission.code}</small>}</th>)}</tr></thead>
            <tbody>{Object.keys(APP_ROLE_LABELS).map((roleKey) => {
              const role = roleKey as AppRole
              return <tr key={role}>
                <th><b>{APP_ROLE_LABELS[role]}</b><small className="block muted font-normal">{CAPABILITY_HELP[role]}</small></th>
                {permissionDefinitions.filter((permission) => permission.capability !== 'company_owner').map((permission) => {
                  const enabled = permissions.some((item) => item.role === role && item.permission === permission.code && item.enabled)
                  const protectedCell = role === 'company_owner' || permission.capability === 'finance_admin'
                  const saving = savingPermission === `${role}:${permission.code}`
                  return <td key={permission.code} className="text-center">
                    {protectedCell ? <span className="muted" aria-label="Quyền được bảo vệ">{role === 'company_owner' ? 'Toàn quyền' : role === 'finance_admin' && permission.capability === 'finance_admin' ? 'Mặc định' : '—'}</span> : (
                      <input type="checkbox" aria-label={`${APP_ROLE_LABELS[role]} nhận quyền ${permission.label}`} checked={enabled} disabled={!!savingPermission || saving} onChange={(event) => void configurePermission(role, permission.code, event.target.checked)} />
                    )}
                  </td>
                })}
              </tr>
            })}</tbody>
          </table></div>
        </Card>
      )}
      {isCompanyOwner && (
        <Card title="Lịch sử phân quyền gần đây">
          {!auditLogs.length ? (
            <EmptyState title="Chưa có thay đổi phân quyền" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người thực hiện</th>
                        <th>Thao tác</th>
                    <th>Thành viên</th>
                    <th>Vai trò</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="num muted whitespace-nowrap">
                        {formatDateTime(log.occurred_at)}
                      </td>
                      <td>
                        {names.get(log.actor_id || '') ||
                          log.actor_id?.slice(0, 8) ||
                          'Hệ thống'}
                      </td>
                      <td>
                        {log.table_name === 'core_role_permission'
                          ? 'Cập nhật capability'
                          : log.table_name === 'core_permission_catalog'
                            ? 'Tạo mã quyền'
                            : log.action.includes('revoke')
                          ? 'Thu hồi vai trò'
                          : log.action.includes('assign') ||
                              log.action === 'INSERT'
                            ? 'Gán vai trò'
                            : 'Cập nhật vai trò'}
                      </td>
                      <td>
                        {names.get(log.after_masked?.user_id || '') || log.after_masked?.label || log.after_masked?.code || '—'}
                      </td>
                      <td>
                        {APP_ROLE_LABELS[log.after_masked?.role as AppRole] || log.after_masked?.permission || log.after_masked?.capability || '—'}
                      </td>
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
          title="Gán vai trò hệ thống"
          onClose={() => setCreating(false)}
          busy={busy}
        >
          <form onSubmit={assign}>
            <Field label="Thành viên">
              <select name="user_id" required autoFocus>
                <option value="">Chọn thành viên</option>
                {userList.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || 'Thành viên'} · {user.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vai trò">
              <select name="role" defaultValue="developer">
                {Object.entries(APP_ROLE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày hết hạn (tùy chọn)">
              <input name="expires_at" type="date" />
            </Field>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Gán vai trò'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {creatingPermission && (
        <Dialog title="Tạo mã capability" onClose={() => setCreatingPermission(false)} busy={busy}>
          <form onSubmit={createPermission}>
            <Field label="Mã quyền (chữ thường, số, gạch dưới)">
              <input name="code" required minLength={2} maxLength={48} pattern="[a-z][a-z0-9_]{1,47}" placeholder="issue_triage" autoFocus />
            </Field>
            <Field label="Tên hiển thị"><input name="label" required minLength={2} maxLength={80} /></Field>
            <Field label="Capability được cấp">
              <select name="capability" required defaultValue="developer">
                {Object.entries(APP_ROLE_LABELS).filter(([role]) => role !== 'company_owner' && role !== 'finance_admin').map(([role,label]) => <option key={role} value={role}>{label}</option>)}
              </select>
            </Field>
            <Field label="Mô tả"><textarea name="description" maxLength={500} /></Field>
            <p className="card-body muted">Mã tùy chỉnh là tên riêng cho một capability hiện có. Việc tạo mã không cấp quyền cho đến khi bật trong ma trận role.</p>
            <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => setCreatingPermission(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo mã quyền'}</Button></div>
          </form>
        </Dialog>
      )}
      {revoking && (
        <Dialog
          title="Thu hồi vai trò"
          onClose={() => setRevoking(null)}
          busy={busy}
        >
          <div className="dialog-content">
            <p>
              Thu hồi vai trò <b>{APP_ROLE_LABELS[revoking.role]}</b> của{' '}
              <b>{revoking.core_user_profile?.full_name || 'thành viên'}</b>?
            </p>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRevoking(null)}
              >
                Hủy
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void revoke()}
              >
                {busy ? 'Đang thu hồi…' : 'Thu hồi'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
