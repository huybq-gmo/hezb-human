'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { Dialog } from '@/components/Dialog'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'

interface Client {
  id: string; name: string; code: string | null; address: string | null; website: string | null;
  notes: string | null; is_active: boolean
}
interface Contact {
  id: string; client_id: string; full_name: string; email: string | null; phone: string | null;
  title: string | null; is_primary: boolean; version: number
}

export function ClientManagementClient({ clients, selected, contacts }: {
  clients: Client[]; selected: Client | null; contacts: Contact[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()
  const user = useWorkspace()
  const canManage = user.hasRole('company_owner', 'director', 'project_manager', 'finance_admin')
  const [editingClient, setEditingClient] = useState<Client | 'new' | null>(null)
  const [editingContact, setEditingContact] = useState<Contact | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Contact | null>(null)
  const [busy, setBusy] = useState(false)
  function clientHref(id: string) {
    const next = new URLSearchParams(params.toString())
    next.set('client', id); next.delete('contactPage')
    return `/dashboard/clients?${next}`
  }
  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingClient || busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('save_project_client', {
        p_client_id: editingClient === 'new' ? null : editingClient.id,
        p_name: String(form.get('name') || '').trim(), p_code: String(form.get('code') || '').trim() || null,
        p_address: String(form.get('address') || '').trim() || null, p_website: String(form.get('website') || '').trim() || null,
        p_notes: String(form.get('notes') || '').trim() || null, p_is_active: form.get('is_active') === 'on',
      })
      if (error) { toast.error('Không thể lưu khách hàng. Kiểm tra quyền và mã khách hàng bị trùng.'); return }
      setEditingClient(null); toast.success('Đã lưu khách hàng')
      if (data && data !== selected?.id) router.push(clientHref(data))
      else router.refresh()
    } finally { setBusy(false) }
  }
  async function saveContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !editingContact || busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('save_project_client_contact', {
        p_contact_id: editingContact === 'new' ? null : editingContact.id, p_client_id: selected.id,
        p_full_name: String(form.get('full_name') || '').trim(), p_email: String(form.get('email') || '').trim() || null,
        p_phone: String(form.get('phone') || '').trim() || null, p_title: String(form.get('title') || '').trim() || null,
        p_is_primary: form.get('is_primary') === 'on', p_expected_version: editingContact === 'new' ? null : editingContact.version,
      })
      if (error) { toast.error(error.message.includes('STALE_VERSION') ? 'Liên hệ đã thay đổi. Hãy tải lại trang.' : 'Không thể lưu liên hệ. Kiểm tra quyền và thông tin đã nhập.'); return }
      setEditingContact(null); toast.success('Đã lưu liên hệ'); router.refresh()
    } finally { setBusy(false) }
  }
  async function deleteContact() {
    if (!deleting || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('delete_project_client_contact', { p_contact_id: deleting.id, p_expected_version: deleting.version })
      if (error) { toast.error('Không thể xóa liên hệ. Kiểm tra quyền hoặc tải lại dữ liệu.'); return }
      setDeleting(null); toast.success('Đã xóa liên hệ'); router.refresh()
    } finally { setBusy(false) }
  }
  return <div className="stack">
    <Card title="Khách hàng" action={canManage && <Button size="sm" onClick={() => setEditingClient('new')}><Plus size={14} /> Thêm khách hàng</Button>}>
      {!clients.length ? <EmptyState title="Không có khách hàng phù hợp" /> : <div className="table-scroll"><table>
        <thead><tr><th>Khách hàng</th><th>Mã</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>{clients.map((client) => <tr key={client.id}>
          <td><Link className="text-link" href={clientHref(client.id)} aria-current={selected?.id === client.id ? 'true' : undefined}>{client.name}</Link></td>
          <td>{client.code || '—'}</td><td><Badge tone={client.is_active ? 'ok' : 'neutral'}>{client.is_active ? 'Hoạt động' : 'Đã lưu trữ'}</Badge></td>
          <td>{canManage && <Button size="sm" variant="ghost" onClick={() => setEditingClient(client)}><Pencil size={14} /> Sửa</Button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>
    {selected && <Card title={`Liên hệ · ${selected.name}`} action={canManage && selected.is_active && <Button size="sm" onClick={() => setEditingContact('new')}><Plus size={14} /> Thêm liên hệ</Button>}>
      <div className="card-body"><p>{selected.address || 'Chưa có địa chỉ'}</p><p className="muted">{selected.website || ''}</p></div>
      {!contacts.length ? <EmptyState title="Chưa có người liên hệ" /> : <div className="table-scroll"><table>
        <thead><tr><th>Họ tên</th><th>Chức danh</th><th>Email</th><th>Điện thoại</th><th></th></tr></thead>
        <tbody>{contacts.map((contact) => <tr key={contact.id}>
          <td>{contact.full_name} {contact.is_primary && <Badge tone="pr">Liên hệ chính</Badge>}</td><td>{contact.title || '—'}</td>
          <td>{contact.email || '—'}</td><td>{contact.phone || '—'}</td><td>{canManage && <div className="toolbar">
            {selected.is_active && <Button size="sm" variant="ghost" onClick={() => setEditingContact(contact)}><Pencil size={14} /> Sửa</Button>}
            <Button size="sm" variant="danger" onClick={() => setDeleting(contact)}><Trash2 size={14} /> Xóa</Button>
          </div>}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>}
    {editingClient && <Dialog title={editingClient === 'new' ? 'Thêm khách hàng' : 'Sửa khách hàng'} onClose={() => setEditingClient(null)} busy={busy}>
      <form onSubmit={saveClient}>
        <Field label="Tên khách hàng"><input name="name" required maxLength={160} defaultValue={editingClient === 'new' ? '' : editingClient.name} /></Field>
        <Field label="Mã khách hàng"><input name="code" maxLength={40} defaultValue={editingClient === 'new' ? '' : editingClient.code || ''} /></Field>
        <Field label="Địa chỉ"><input name="address" defaultValue={editingClient === 'new' ? '' : editingClient.address || ''} /></Field>
        <Field label="Website"><input name="website" type="url" defaultValue={editingClient === 'new' ? '' : editingClient.website || ''} /></Field>
        <Field label="Ghi chú"><textarea name="notes" defaultValue={editingClient === 'new' ? '' : editingClient.notes || ''} /></Field>
        <label className="checkbox-field"><input name="is_active" type="checkbox" defaultChecked={editingClient === 'new' || editingClient.is_active} /> Đang hoạt động</label>
        <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => setEditingClient(null)}>Hủy</Button><Button type="submit" disabled={busy}>Lưu khách hàng</Button></div>
      </form>
    </Dialog>}
    {editingContact && selected && <Dialog title={editingContact === 'new' ? 'Thêm liên hệ' : 'Sửa liên hệ'} onClose={() => setEditingContact(null)} busy={busy}>
      <form onSubmit={saveContact}>
        <Field label="Họ tên"><input name="full_name" required maxLength={160} defaultValue={editingContact === 'new' ? '' : editingContact.full_name} /></Field>
        <Field label="Chức danh"><input name="title" maxLength={120} defaultValue={editingContact === 'new' ? '' : editingContact.title || ''} /></Field>
        <Field label="Email"><input name="email" type="email" maxLength={254} defaultValue={editingContact === 'new' ? '' : editingContact.email || ''} /></Field>
        <Field label="Điện thoại"><input name="phone" type="tel" maxLength={40} defaultValue={editingContact === 'new' ? '' : editingContact.phone || ''} /></Field>
        <label className="checkbox-field"><input name="is_primary" type="checkbox" defaultChecked={editingContact !== 'new' && editingContact.is_primary} /> Liên hệ chính</label>
        <p className="muted">Chọn liên hệ chính mới sẽ chuyển liên hệ chính cũ thành liên hệ thường.</p>
        <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => setEditingContact(null)}>Hủy</Button><Button type="submit" disabled={busy}>Lưu liên hệ</Button></div>
      </form>
    </Dialog>}
    {deleting && <Dialog title="Xóa người liên hệ" onClose={() => setDeleting(null)} busy={busy}>
      <p className="dialog-content">Xóa liên hệ {deleting.full_name}?</p>
      <div className="form-actions"><Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>Hủy</Button><Button variant="danger" disabled={busy} onClick={() => void deleteContact()}>Xóa liên hệ</Button></div>
    </Dialog>}
  </div>
}
