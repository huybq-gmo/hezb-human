'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Check, ChevronRight, Pencil, Send, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { Button, Card, EmptyState, SearchField, Badge, Field } from '@/components/ui'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, formatMoney } from '@/lib/presentation'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  client_id: string
  name: string
  description: string | null
  code: string | null
  billing_type: string
  budget_amount: number | null
  currency: string
  status: string
  start_date: string | null
  end_date: string | null
  project_client?: { name: string; code?: string | null } | null
}
interface Proposal {
  id: string
  title: string
  billing_type: string
  budget_amount: number | null
  currency: string
  status: string
  description?: string | null
  expires_at?: string | null
  created_by?: string | null
  reject_reason?: string | null
  project_client?: { name: string } | null
}
interface Client {
  id: string
  name: string
  code: string | null
  address: string | null
  website: string | null
  notes: string | null
  is_active: boolean
}
const BILLING: Record<string, string> = {
  fixed_price: 'Trọn gói',
  hourly: 'Theo giờ',
  mixed: 'Kết hợp',
}

export function ProjectListClient({
  projects,
  proposals,
  clients,
}: {
  projects: Project[]
  proposals: Proposal[]
  clients: Client[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const [tab, setTab] = useState('projects')
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [editingClient, setEditingClient] = useState<Client | 'new' | 'manage' | null>(null)
  const [creatingProposal, setCreatingProposal] = useState(false)
  const [rejectingProposal, setRejectingProposal] = useState<Proposal | null>(null)
  const [saving, setSaving] = useState(false)
  const query = search.trim().toLocaleLowerCase('vi')
  const filteredProjects = projects.filter(
    (p) =>
      (!status || p.status === status) &&
      [p.name, p.code, p.project_client?.name].some((value) =>
        value?.toLocaleLowerCase('vi').includes(query),
      ),
  )
  const filteredProposals = proposals.filter((p) =>
    [p.title, p.project_client?.name].some((value) =>
      value?.toLocaleLowerCase('vi').includes(query),
    ),
  )
  const canEditProject = (projectId: string) =>
    user.hasRole('company_owner', 'director', 'project_manager') ||
    user.hasProjectRole(projectId, 'pm')
  const canManageClients = user.hasRole(
    'company_owner', 'director', 'project_manager', 'finance_admin',
  )
  async function approve(id: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('approve_proposal', {
      p_proposal_id: id,
    })
    setBusyId(null)
    if (error) {
      toast.error(
        error.message.includes('FORBIDDEN')
          ? 'Bạn không có quyền duyệt đề xuất này.'
          : 'Không thể duyệt đề xuất. Vui lòng thử lại.',
      )
      return
    }
    toast.success('Đã duyệt đề xuất và tạo dự án')
    router.refresh()
  }
  async function sendProposal(id: string) {
    setBusyId(id)
    const { error } = await supabase.rpc('send_proposal', { p_proposal_id: id })
    setBusyId(null)
    if (error) {
      toast.error('Không thể gửi đề xuất. Kiểm tra quyền hoặc tải lại dữ liệu.')
      return
    }
    toast.success('Đã chuyển đề xuất sang trạng thái chờ duyệt')
    router.refresh()
  }
  async function rejectProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rejectingProposal) return
    const reason = String(new FormData(event.currentTarget).get('reason') || '').trim()
    setBusyId(rejectingProposal.id)
    try {
      const { error } = await supabase.rpc('reject_proposal', {
        p_proposal_id: rejectingProposal.id,
        p_reason: reason,
      })
      if (error) {
        toast.error('Không thể từ chối đề xuất. Vui lòng kiểm tra quyền.')
        return
      }
      toast.success('Đã từ chối đề xuất')
      setRejectingProposal(null)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }
  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const client = editingClient && typeof editingClient !== 'string' ? editingClient : null
    setSaving(true)
    try {
      const { error } = await supabase.rpc('save_project_client', {
        p_client_id: client?.id || null,
        p_name: String(data.get('name') || '').trim(),
        p_code: String(data.get('code') || '').trim() || null,
        p_address: String(data.get('address') || '').trim() || null,
        p_website: String(data.get('website') || '').trim() || null,
        p_notes: String(data.get('notes') || '').trim() || null,
        p_is_active: client ? data.get('is_active') === 'on' : true,
      })
      if (error) {
        toast.error('Không thể lưu khách hàng. Mã khách hàng có thể đã được sử dụng.')
        return
      }
      toast.success(client ? 'Đã cập nhật khách hàng' : 'Đã tạo khách hàng')
      setEditingClient(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }
  async function createProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const { error } = await supabase.from('project_proposal').insert({
        client_id: String(data.get('client_id') || ''),
        title: String(data.get('title') || '').trim(),
        description: String(data.get('description') || '').trim() || null,
        estimated_budget: data.get('estimated_budget')
          ? Number(data.get('estimated_budget'))
          : null,
        currency: String(data.get('currency') || 'VND').toUpperCase(),
        billing_type: String(data.get('billing_type') || 'fixed_price'),
        expires_at: String(data.get('expires_at') || '') || null,
        created_by: user.id,
        status: 'draft',
      })
      if (error) {
        toast.error('Không thể tạo đề xuất. Kiểm tra quyền và thông tin khách hàng.')
        return
      }
      toast.success('Đã lưu đề xuất nháp')
      setCreatingProposal(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }
  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const project = isNew ? null : (editing as Project)
      const args = {
        ...(project ? { p_project_id: project.id } : {}),
        p_client_id: String(data.get('client_id') || ''),
        p_name: String(data.get('name') || '').trim(),
        p_code: String(data.get('code') || '').trim() || null,
        p_description: String(data.get('description') || '').trim() || null,
        p_billing_type: data.get('billing_type'),
        p_budget_amount: data.get('budget_amount') ? Number(data.get('budget_amount')) : null,
        p_budget_currency: data.get('budget_currency') || 'VND',
        p_start_date: data.get('start_date') || null,
        p_end_date: data.get('end_date') || null,
      }
      const result = isNew
        ? await supabase.rpc('create_project', args)
        : await supabase.rpc('update_project', { ...args, p_status: data.get('status') })
      if (result.error) {
        toast.error(result.error.message.includes('FORBIDDEN') ? 'Bạn không có quyền quản lý dự án.' : 'Không thể lưu dự án. Kiểm tra mã dự án và dữ liệu đã nhập.')
        return
      }
      toast.success(isNew ? 'Đã tạo dự án' : 'Đã cập nhật dự án')
      setEditing(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="stack">
      <div className="tabs" aria-label="Nội dung dự án">
        <button
          className={cn(tab === 'projects' && 'on')}
          aria-pressed={tab === 'projects'}
          onClick={() => setTab('projects')}
        >
          Dự án ({projects.length})
        </button>
        <button
          className={cn(tab === 'proposals' && 'on')}
          aria-pressed={tab === 'proposals'}
          onClick={() => setTab('proposals')}
        >
          Đề xuất ({proposals.length})
        </button>
      </div>
      <div className="toolbar toolbar-between">
        <div className="filters">
          {tab === 'projects' &&
            [
              ['active', 'Đang chạy'],
              ['completed', 'Hoàn thành'],
              ['on_hold', 'Tạm dừng'],
              ['', 'Tất cả'],
            ].map(([value, label]) => (
              <button
                className={cn('f', status === value && 'on')}
                aria-pressed={status === value}
                key={value}
                onClick={() => setStatus(value)}
              >
                {label}
                {value === 'active'
                  ? ` ${projects.filter((p) => p.status === 'active').length}`
                  : ''}
              </button>
            ))}
        </div>
        <div className="toolbar">
          <SearchField
            placeholder="Tìm dự án, khách hàng…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === 'projects' &&
            user.hasRole('company_owner', 'director', 'project_manager') && (
              <>
                <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus size={15} /> Tạo dự án
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setTab('proposals')}>
                  <Plus size={15} /> Từ đề xuất
                </Button>
              </>
            )}
          {tab === 'projects' && canManageClients && (
            <Button size="sm" variant="ghost" onClick={() => setEditingClient('manage')}>
              <Plus size={15} /> Khách hàng
            </Button>
          )}
          {tab === 'proposals' && user.hasRole('company_owner', 'project_manager') && (
            <Button size="sm" disabled={!clients.length} onClick={() => setCreatingProposal(true)}>
              <Plus size={15} /> Tạo đề xuất
            </Button>
          )}
        </div>
      </div>
      <Card>
        {tab === 'projects' ? (
          !filteredProjects.length ? (
            <EmptyState
              title="Không có dự án phù hợp"
              description="Thử thay đổi bộ lọc hoặc tìm kiếm."
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Khách hàng</th>
                    <th>Loại hợp đồng</th>
                    <th>Ngân sách</th>
                    <th>Thời gian</th>
                    <th>Tình trạng</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="primary hover:text-[var(--pri)]"
                        >
                          {project.name}
                        </Link>
                        <small className="block muted">
                          {project.code || '—'}
                        </small>
                      </td>
                      <td>{project.project_client?.name || '—'}</td>
                      <td>
                        {BILLING[project.billing_type] || project.billing_type}
                      </td>
                      <td className="num whitespace-nowrap">
                        {formatMoney(project.budget_amount, project.currency)}
                      </td>
                      <td className="num muted whitespace-nowrap">
                        {formatDate(project.start_date)}
                        {project.end_date
                          ? ` → ${formatDate(project.end_date)}`
                          : ''}
                      </td>
                      <td>
                        <StatusBadge status={project.status} />
                      </td>
                      <td>
                        <div className="toolbar">
                          {canEditProject(project.id) && (
                            <Button variant="ghost" size="sm" aria-label={`Sửa dự án ${project.name}`} onClick={() => setEditing(project)}>
                              <Pencil size={14} />
                            </Button>
                          )}
                          <Link className="ib" aria-label={`Xem dự án ${project.name}`} href={`/dashboard/projects/${project.id}`}>
                            <ChevronRight size={15} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !filteredProposals.length ? (
          <EmptyState title="Chưa có đề xuất phù hợp" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Đề xuất</th>
                  <th>Khách hàng</th>
                  <th>Loại hợp đồng</th>
                  <th>Ngân sách dự kiến</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td className="font-semibold">{proposal.title}</td>
                    <td>{proposal.project_client?.name || '—'}</td>
                    <td>
                      {BILLING[proposal.billing_type] || proposal.billing_type}
                    </td>
                    <td className="num">
                      {formatMoney(proposal.budget_amount, proposal.currency)}
                    </td>
                    <td>
                      <StatusBadge status={proposal.status} />
                    </td>
                    <td>
                      {proposal.status === 'sent' &&
                        user.hasRole('company_owner', 'director') && (
                          <div className="toolbar">
                            <Button size="sm" disabled={busyId !== null || proposal.created_by === user.id} title={proposal.created_by === user.id ? 'Người tạo không được tự duyệt' : undefined} onClick={() => void approve(proposal.id)}>
                              <Check size={14} />
                              {busyId === proposal.id ? 'Đang duyệt…' : 'Phê duyệt'}
                            </Button>
                            <Button size="sm" variant="danger" disabled={busyId !== null || proposal.created_by === user.id} onClick={() => setRejectingProposal(proposal)}>
                              <X size={14} /> Từ chối
                            </Button>
                          </div>
                        )}
                      {proposal.status === 'draft' &&
                        user.hasRole('company_owner', 'project_manager') &&
                        (proposal.created_by === user.id || user.hasRole('company_owner')) && (
                          <Button size="sm" disabled={busyId !== null} onClick={() => void sendProposal(proposal.id)}>
                            <Send size={14} /> Gửi duyệt
                          </Button>
                        )}
                      {proposal.status === 'approved' && (
                        <Badge tone="ok">Đã tạo dự án</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="muted">
        Dự án được tạo từ đề xuất đã duyệt. Hiển thị tối đa 100 bản ghi gần
        nhất.
      </p>
      {editing && (
        <Dialog title={editing === 'new' ? 'Tạo dự án' : 'Cập nhật dự án'} onClose={() => setEditing(null)} busy={saving}>
          <form onSubmit={saveProject}>
            <Field label="Tên dự án"><input name="name" required maxLength={160} defaultValue={editing === 'new' ? '' : editing.name} autoFocus /></Field>
            <div className="form-grid">
            <Field label="Khách hàng"><select name="client_id" required defaultValue={editing === 'new' ? '' : editing.client_id}><option value="">Chọn khách hàng</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
              <Field label="Mã dự án"><input name="code" maxLength={40} defaultValue={editing === 'new' ? '' : editing.code || ''} /></Field>
              <Field label="Loại hợp đồng"><select name="billing_type" defaultValue={editing === 'new' ? 'hourly' : editing.billing_type}><option value="fixed_price">Trọn gói</option><option value="hourly">Theo giờ</option><option value="mixed">Kết hợp</option></select></Field>
              <Field label="Trạng thái"><select name="status" defaultValue={editing === 'new' ? 'active' : editing.status}><option value="active">Đang chạy</option><option value="on_hold">Tạm dừng</option><option value="completed">Hoàn thành</option><option value="cancelled">Đã hủy</option></select></Field>
              <Field label="Ngân sách"><input name="budget_amount" type="number" min="0" step="0.01" defaultValue={editing === 'new' ? '' : editing.budget_amount ?? ''} /></Field>
              <Field label="Tiền tệ"><input name="budget_currency" maxLength={3} defaultValue={editing === 'new' ? 'VND' : editing.currency} /></Field>
              <Field label="Ngày bắt đầu"><input name="start_date" type="date" defaultValue={editing === 'new' ? '' : editing.start_date || ''} /></Field>
              <Field label="Ngày kết thúc"><input name="end_date" type="date" defaultValue={editing === 'new' ? '' : editing.end_date || ''} /></Field>
            </div>
            <Field label="Mô tả"><textarea name="description" defaultValue={editing === 'new' ? '' : editing.description || ''} /></Field>
            <div className="form-actions"><Button variant="ghost" type="button" disabled={saving} onClick={() => setEditing(null)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu dự án'}</Button></div>
          </form>
        </Dialog>
      )}
      {editingClient && (
        <Dialog title={editingClient === 'new' ? 'Thêm khách hàng' : editingClient === 'manage' ? 'Khách hàng' : 'Cập nhật khách hàng'} onClose={() => setEditingClient(null)} busy={saving}>
          {editingClient === 'manage' ? (
            <div className="card-body stack">
              {!clients.length && <p className="muted">Chưa có khách hàng.</p>}
              {clients.map((client) => (
                <div key={client.id} className="toolbar toolbar-between">
                  <span>{client.name}{client.code ? ` · ${client.code}` : ''}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingClient(client)}><Pencil size={14} /> Sửa</Button>
                </div>
              ))}
              <Button type="button" size="sm" onClick={() => setEditingClient('new')}><Plus size={14} /> Thêm khách hàng</Button>
            </div>
          ) : (
            <form onSubmit={saveClient}>
              <Field label="Tên khách hàng"><input name="name" required maxLength={160} defaultValue={editingClient === 'new' ? '' : editingClient.name} autoFocus /></Field>
              <div className="form-grid">
                <Field label="Mã khách hàng"><input name="code" maxLength={40} defaultValue={editingClient === 'new' ? '' : editingClient.code || ''} /></Field>
                <Field label="Website"><input name="website" type="url" defaultValue={editingClient === 'new' ? '' : editingClient.website || ''} /></Field>
              </div>
              <Field label="Địa chỉ"><input name="address" defaultValue={editingClient === 'new' ? '' : editingClient.address || ''} /></Field>
              <Field label="Ghi chú"><textarea name="notes" defaultValue={editingClient === 'new' ? '' : editingClient.notes || ''} /></Field>
              {editingClient !== 'new' && <Field label="Đang hoạt động"><input name="is_active" type="checkbox" defaultChecked={editingClient.is_active} /></Field>}
              <div className="form-actions"><Button type="button" variant="ghost" disabled={saving} onClick={() => setEditingClient('manage')}>Quay lại</Button><Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu khách hàng'}</Button></div>
            </form>
          )}
        </Dialog>
      )}
      {creatingProposal && (
        <Dialog title="Tạo đề xuất dự án" onClose={() => setCreatingProposal(false)} busy={saving}>
          <form onSubmit={createProposal}>
            <Field label="Khách hàng"><select name="client_id" required><option value="">Chọn khách hàng</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
            <Field label="Tên đề xuất"><input name="title" required maxLength={160} autoFocus /></Field>
            <Field label="Phạm vi / mô tả"><textarea name="description" /></Field>
            <div className="form-grid">
              <Field label="Loại hợp đồng"><select name="billing_type" defaultValue="fixed_price"><option value="fixed_price">Trọn gói</option><option value="hourly">Theo giờ</option><option value="mixed">Kết hợp</option></select></Field>
              <Field label="Ngân sách dự kiến"><input name="estimated_budget" type="number" min="0" step="0.01" /></Field>
              <Field label="Tiền tệ"><input name="currency" maxLength={3} defaultValue="VND" required /></Field>
              <Field label="Hết hạn"><input name="expires_at" type="date" /></Field>
            </div>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={saving} onClick={() => setCreatingProposal(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu bản nháp'}</Button></div>
          </form>
        </Dialog>
      )}
      {rejectingProposal && (
        <Dialog title="Từ chối đề xuất" onClose={() => setRejectingProposal(null)} busy={busyId !== null}>
          <form onSubmit={rejectProposal}>
            <p className="dialog-content">Từ chối đề xuất <b>{rejectingProposal.title}</b>. Hãy ghi rõ lý do.</p>
            <Field label="Lý do"><textarea name="reason" required minLength={3} autoFocus /></Field>
            <div className="form-actions"><Button type="button" variant="ghost" disabled={busyId !== null} onClick={() => setRejectingProposal(null)}>Hủy</Button><Button type="submit" variant="danger" disabled={busyId !== null}>{busyId ? 'Đang xử lý…' : 'Từ chối'}</Button></div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
