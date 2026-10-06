'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Dialog } from '@/components/Dialog'
import { Button, Field } from '@/components/ui'
import Link from 'next/link'
import { HexagonAvatar } from '@/components/HezbLogo'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge, Card, EmptyState } from '@/components/ui'
import {
  formatDate,
  effectiveMembershipStatus,
  PROJECT_ROLES,
  localDate,
} from '@/lib/presentation'

interface Membership {
  id: string
  project_id: string
  user_id: string
  project_role: string
  start_date: string
  end_date: string | null
  status: string
  project_project?: { name: string; code: string | null } | null
  core_user_profile?: { full_name: string | null } | null
}
export function ProjectMembershipClient({
  memberships,
  projects,
  users,
  canManage,
  manageableProjectIds,
  initialProject = '',
}: {
  memberships: Membership[]
  projects: { id: string; name: string }[]
  users: { id: string; full_name: string | null }[]
  canManage: boolean
  manageableProjectIds: string[]
  initialProject?: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const [assigning, setAssigning] = useState(false)
  const [revoking, setRevoking] = useState<Membership | null>(null)
  const [busy, setBusy] = useState(false)
  const visibleProjects = canManage ? projects : projects.filter((item) => manageableProjectIds.includes(item.id))
  const canAssign = canManage || manageableProjectIds.length > 0
  const filtered = memberships
  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('assign_project_member', {
        p_project_id: data.get('project_id'),
        p_user_id: data.get('user_id'),
        p_project_role: data.get('project_role'),
        p_start_date: data.get('start_date'),
        p_end_date: data.get('end_date') || null,
      })
      if (error) {
        toast.error(error.message.includes('FORBIDDEN') ? 'Bạn không có quyền phân công trong dự án này.' : 'Không thể thêm thành viên. Vui lòng kiểm tra thông tin.')
        return
      }
      toast.success('Đã gán thành viên và vai trò dự án')
      setAssigning(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function revoke() {
    if (!revoking) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('revoke_project_member', { p_membership_id: revoking.id })
      if (error) {
        toast.error('Không thể thu hồi thành viên dự án.')
        return
      }
      toast.success('Đã thu hồi quyền tham gia dự án')
      setRevoking(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <div className="toolbar toolbar-between">
        <p className="muted">Quản lý thành viên, vai trò dự án và thời gian hiệu lực.</p>
        {canAssign && <Button size="sm" onClick={() => setAssigning(true)}><Plus size={15} />Thêm thành viên</Button>}
      </div>
      <Card>
        {!filtered.length ? (
          <EmptyState title="Không có thành viên phù hợp" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>Dự án</th>
                  <th>Vai trò</th>
                  <th>Thời gian hiệu lực</th>
                  <th>Trạng thái</th>
                  {(canManage || manageableProjectIds.length > 0) && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="who">
                        <HexagonAvatar
                          name={member.core_user_profile?.full_name}
                        />
                        <div>
                          <p className="font-medium">
                            {member.core_user_profile?.full_name ||
                              'Thành viên'}
                          </p>
                          <small>{member.user_id.slice(0, 8)}…</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/dashboard/projects/${member.project_id}`}
                      >
                        {member.project_project?.name || 'Dự án'}
                      </Link>
                      <small className="block muted">
                        {member.project_project?.code}
                      </small>
                    </td>
                    <td>
                      <Badge tone="pr">
                        {PROJECT_ROLES[member.project_role] ||
                          member.project_role}
                      </Badge>
                    </td>
                    <td className="num muted whitespace-nowrap">
                      {formatDate(member.start_date)} →{' '}
                      {member.end_date
                        ? formatDate(member.end_date)
                        : 'Vô thời hạn'}
                    </td>
                    <td>
                      <StatusBadge status={effectiveMembershipStatus(member)} />
                    </td>
                    {(canManage || manageableProjectIds.includes(member.project_id)) && (
                      <td>
                        {member.status !== 'revoked' && <Button size="sm" variant="danger" onClick={() => setRevoking(member)}><Trash2 size={14} />Thu hồi</Button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {assigning && (
        <Dialog title="Thêm thành viên dự án" onClose={() => setAssigning(false)} busy={busy}>
          <form onSubmit={assign}>
            <Field label="Dự án"><select name="project_id" defaultValue={initialProject} required><option value="">Chọn dự án</option>{visibleProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Thành viên"><select name="user_id" required><option value="">Chọn thành viên</option>{users.map((item) => <option key={item.id} value={item.id}>{item.full_name || 'Thành viên'} · {item.id.slice(0, 8)}</option>)}</select></Field>
            <div className="form-grid">
              <Field label="Vai trò"><select name="project_role" defaultValue="developer"><option value="pm">Project Manager</option><option value="team_leader">Team Leader</option><option value="developer">Developer</option><option value="qa_reviewer">QA Reviewer</option></select></Field>
              <Field label="Bắt đầu"><input name="start_date" type="date" required defaultValue={localDate()} /></Field>
              <Field label="Kết thúc (tùy chọn)"><input name="end_date" type="date" /></Field>
            </div>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setAssigning(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Gán thành viên'}</Button></div>
          </form>
        </Dialog>
      )}
      {revoking && (
        <Dialog title="Thu hồi thành viên" onClose={() => setRevoking(null)} busy={busy}>
          <p className="dialog-content">Thu hồi vai trò {PROJECT_ROLES[revoking.project_role] || revoking.project_role} của {revoking.core_user_profile?.full_name || 'thành viên'} trong {revoking.project_project?.name || 'dự án'}?</p>
          <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => setRevoking(null)}>Hủy</Button><Button variant="danger" disabled={busy} onClick={() => void revoke()}>{busy ? 'Đang thu hồi…' : 'Thu hồi'}</Button></div>
        </Dialog>
      )}
    </div>
  )
}
