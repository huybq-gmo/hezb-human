'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Dialog } from '@/components/Dialog'
import { Badge, Button, Card, EmptyState, Field, SearchField } from '@/components/ui'
import { formatDate, localDate } from '@/lib/presentation'

interface Team {
  id: string
  name: string
  description: string | null
  is_active: boolean
}
interface TeamMembership {
  id: string
  team_id: string
  employee_id: string
  team_role: 'member' | 'leader'
  start_date: string
  end_date: string | null
  status: string
  hr_team?: { name: string } | null
  hr_employee?: { id: string; full_name: string; employee_code: string | null; status: string } | null
}
interface Employee {
  id: string
  full_name: string
  employee_code: string | null
  status: string
}

export function HrTeamsClient({ teams, memberships, employees }: {
  teams: Team[]
  memberships: TeamMembership[]
  employees: Employee[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [editingTeam, setEditingTeam] = useState<Team | null | false>(false)
  const [assigning, setAssigning] = useState(false)
  const [revoking, setRevoking] = useState<TeamMembership | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const activeTeams = teams.filter((team) => team.is_active)
  const filtered = memberships.filter((membership) =>
    (!status || membership.status === status) &&
    [membership.hr_employee?.full_name, membership.hr_employee?.employee_code, membership.hr_team?.name]
      .some((value) => value?.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))),
  )

  async function saveTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('save_hr_team', {
        p_team_id: editingTeam ? editingTeam.id : null,
        p_name: String(data.get('name') || '').trim(),
        p_description: String(data.get('description') || '').trim() || null,
        p_is_active: data.get('is_active') === 'on',
      })
      if (error) {
        toast.error(error.message.includes('duplicate key') ? 'Tên nhóm đã tồn tại.' : error.message.includes('TEAM_HAS_MEMBERS') ? 'Hãy thu hồi thành viên trước khi lưu trữ nhóm.' : 'Không thể lưu nhóm nhân sự.')
        return
      }
      toast.success('Đã lưu nhóm nhân sự')
      setEditingTeam(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function assignMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('assign_hr_team_member', {
        p_team_id: String(data.get('team_id') || ''),
        p_employee_id: String(data.get('employee_id') || ''),
        p_team_role: String(data.get('team_role') || 'member'),
        p_start_date: String(data.get('start_date') || ''),
        p_end_date: String(data.get('end_date') || '') || null,
      })
      if (error) {
        const message = error.message.includes('23505') ? 'Nhóm đã có trưởng nhóm hoặc nhân sự đã được gán từ ngày này.'
          : error.message.includes('EMPLOYEE_NOT_ACTIVE') ? 'Chỉ nhân sự đang hoạt động mới được gán vào nhóm.'
            : 'Không thể gán nhân sự vào nhóm.'
        toast.error(message)
        return
      }
      toast.success('Đã gán nhân sự vào nhóm')
      setAssigning(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revokeMember() {
    if (!revoking) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('revoke_hr_team_member', { p_membership_id: revoking.id })
      if (error) {
        toast.error('Không thể thu hồi thành viên nhóm.')
        return
      }
      toast.success('Đã thu hồi thành viên nhóm')
      setRevoking(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card title="Các nhóm" action={<Button size="sm" onClick={() => setEditingTeam(null)}><Plus size={14} /> Tạo nhóm</Button>}>
        {!teams.length ? <EmptyState title="Chưa có nhóm nhân sự" description="Tạo nhóm rồi phân công thành viên hoặc trưởng nhóm." /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>Tên nhóm</th><th>Mô tả</th><th>Thành viên hiện hoạt</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{teams.map((team) => {
              const count = memberships.filter((member) => member.team_id === team.id && member.status === 'active').length
              return <tr key={team.id}>
                <td className="font-semibold">{team.name}</td><td>{team.description || '—'}</td><td>{count}</td>
                <td><Badge tone={team.is_active ? 'ok' : 'neutral'}>{team.is_active ? 'Đang hoạt động' : 'Đã lưu trữ'}</Badge></td>
                <td><Button size="sm" variant="ghost" onClick={() => setEditingTeam(team)}><Pencil size={14} /> Sửa</Button></td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="Thành viên nhóm" action={activeTeams.length && employees.length ? <Button size="sm" onClick={() => setAssigning(true)}><Users size={14} /> Gán nhân sự</Button> : null}>
        <div className="toolbar"><SearchField placeholder="Tìm nhân sự hoặc nhóm…" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Lọc trạng thái thành viên" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả</option><option value="active">Đang gán</option><option value="revoked">Đã thu hồi</option></select></div>
        {!filtered.length ? <EmptyState title="Chưa có thành viên nhóm phù hợp" /> : (
          <div className="table-scroll"><table>
            <thead><tr><th>Nhân sự</th><th>Nhóm</th><th>Vai trò</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>{filtered.map((member) => <tr key={member.id}>
              <td><b>{member.hr_employee?.full_name || 'Nhân sự'}</b><small className="block muted">{member.hr_employee?.employee_code || member.employee_id.slice(0, 8)}</small></td>
              <td>{member.hr_team?.name || 'Nhóm'}</td><td><Badge tone={member.team_role === 'leader' ? 'pr' : 'neutral'}>{member.team_role === 'leader' ? 'Trưởng nhóm' : 'Thành viên'}</Badge></td>
              <td className="num muted">{formatDate(member.start_date)} → {member.end_date ? formatDate(member.end_date) : 'Không thời hạn'}</td>
              <td><Badge tone={member.status === 'active' ? 'ok' : 'neutral'}>{member.status === 'active' ? 'Đang gán' : 'Đã thu hồi'}</Badge></td>
              <td>{member.status === 'active' && <Button size="sm" variant="danger" onClick={() => setRevoking(member)}><Trash2 size={14} /> Thu hồi</Button>}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </Card>

      {editingTeam !== false && <Dialog title={editingTeam ? 'Sửa nhóm nhân sự' : 'Tạo nhóm nhân sự'} onClose={() => setEditingTeam(false)} busy={busy}>
        <form onSubmit={saveTeam}>
          <Field label="Tên nhóm"><input name="name" required minLength={2} maxLength={100} defaultValue={editingTeam ? editingTeam.name : ''} /></Field>
          <Field label="Mô tả"><textarea name="description" maxLength={500} defaultValue={editingTeam ? editingTeam.description || '' : ''} /></Field>
          <label className="checkbox-row"><input type="checkbox" name="is_active" defaultChecked={editingTeam ? editingTeam.is_active : true} /> Nhóm đang hoạt động</label>
          <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingTeam(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu nhóm'}</Button></div>
        </form>
      </Dialog>}

      {assigning && <Dialog title="Gán nhân sự vào nhóm" onClose={() => setAssigning(false)} busy={busy}>
        <form onSubmit={assignMember}>
          <Field label="Nhóm"><select name="team_id" required><option value="">Chọn nhóm</option>{activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field>
          <Field label="Nhân sự đang hoạt động"><select name="employee_id" required><option value="">Chọn nhân sự</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.employee_code ? ` · ${employee.employee_code}` : ''}</option>)}</select></Field>
          <div className="form-grid"><Field label="Vai trò trong nhóm"><select name="team_role"><option value="member">Thành viên</option><option value="leader">Trưởng nhóm</option></select></Field><Field label="Ngày bắt đầu"><input name="start_date" type="date" required defaultValue={localDate()} /></Field></div>
          <Field label="Ngày kết thúc (tùy chọn)"><input name="end_date" type="date" /></Field>
          <div className="form-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setAssigning(false)}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang gán…' : 'Gán nhân sự'}</Button></div>
        </form>
      </Dialog>}

      {revoking && <Dialog title="Thu hồi thành viên nhóm" onClose={() => setRevoking(null)} busy={busy}>
        <p className="dialog-content">Thu hồi {revoking.hr_employee?.full_name || 'nhân sự'} khỏi nhóm {revoking.hr_team?.name || 'đã chọn'}?</p>
        <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => setRevoking(null)}>Hủy</Button><Button variant="danger" disabled={busy} onClick={() => void revokeMember()}>{busy ? 'Đang thu hồi…' : 'Thu hồi'}</Button></div>
      </Dialog>}
    </div>
  )
}
