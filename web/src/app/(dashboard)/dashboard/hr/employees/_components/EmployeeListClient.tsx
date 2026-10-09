'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, LockKeyhole, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { HexagonAvatar } from '@/components/HezbLogo'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, Card, EmptyState, Field, SearchField } from '@/components/ui'
import { EMPLOYEE_TYPES } from '@/lib/presentation'
import { cn } from '@/lib/utils'

interface Employee {
  id: string
  employee_code?: string | null
  full_name: string | null
  type: string
  status: string
  job_title?: string | null
}
export function EmployeeListClient({
  initialData,
  total,
  page,
}: {
  initialData: Employee[]
  total: number
  page: number
}) {
  const router = useRouter()
  const user = useWorkspace()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canManage = user.hasRole('company_owner', 'hr_admin')
  const query = search.trim().toLocaleLowerCase('vi')
  const filtered = initialData.filter(
    (e) =>
      (!status || e.status === status) &&
      (!type || e.type === type) &&
      [e.full_name, e.employee_code, e.job_title].some((value) =>
        value?.toLocaleLowerCase('vi').includes(query),
      ),
  )
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    const { error } = await supabase.from('hr_employee').insert({
      full_name: String(data.get('full_name')).trim(),
      employee_code: String(data.get('employee_code')).trim(),
      email: String(data.get('email') || '').trim().toLowerCase() || null,
      type: data.get('type'),
      hire_date: data.get('hire_date') || null,
      status: 'onboarding',
      created_by: user.id,
    })
    setBusy(false)
    if (error) {
      setError('Không thể tạo hồ sơ. Kiểm tra mã nhân sự và quyền truy cập.')
      return
    }
    toast.success('Đã tạo hồ sơ nhân sự')
    setCreating(false)
    router.refresh()
  }
  return (
    <div className="stack">
      <div className="toolbar toolbar-between">
        <div className="filters">
          {['', 'active', 'onboarding', 'offboarding', 'terminated'].map(
            (value) => (
              <button
                key={value}
                className={cn('f', status === value && 'on')}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {
                  (
                    {
                      '': `Tất cả ${total}`,
                      active: 'Active',
                      onboarding: 'Onboarding',
                      offboarding: 'Offboarding',
                      terminated: 'Đã nghỉ',
                    } as Record<string, string>
                  )[value]
                }
              </button>
            ),
          )}
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={15} />
            Thêm nhân sự
          </Button>
        )}
      </div>
      <div className="toolbar">
        <SearchField
          placeholder="Tìm tên, mã nhân sự…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={type}
          aria-label="Lọc loại nhân sự"
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Tất cả loại nhân sự</option>
          {Object.entries(EMPLOYEE_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Card>
        {!filtered.length ? (
          <EmptyState
            title="Không tìm thấy nhân sự"
            description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm trên trang này."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Mã</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Đơn giá</th>
                  <th>
                    <span className="sr-only">Chi tiết</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <Link
                        href={`/dashboard/hr/employees/${employee.id}`}
                        className="who hover:text-[var(--pri)]"
                      >
                        <HexagonAvatar name={employee.full_name} />
                        <div>
                          <p className="primary">
                            {employee.full_name || 'Chưa đặt tên'}
                          </p>
                          <small>
                            {employee.job_title || 'Xem hồ sơ nhân sự'}
                          </small>
                        </div>
                      </Link>
                    </td>
                    <td className="num muted">
                      {employee.employee_code || '—'}
                    </td>
                    <td>{EMPLOYEE_TYPES[employee.type] || employee.type}</td>
                    <td>
                      <StatusBadge status={employee.status} />
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/hr/employees/${employee.id}`}
                        className="muted inline-flex items-center gap-1"
                      >
                        <LockKeyhole size={13} />
                        {user.hasRole(
                          'company_owner',
                          'hr_admin',
                          'finance_admin',
                        )
                          ? 'Xem trong hồ sơ'
                          : 'Chỉ HR/Finance'}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/hr/employees/${employee.id}`}
                        className="ib"
                        aria-label={`Xem hồ sơ ${employee.full_name}`}
                      >
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {total
              ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} / ${total}`
              : '0 nhân sự'}
              {(search || status || type) &&
              ` · ${filtered.length} kết quả trên trang`}
          </span>
          <div className="toolbar">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => router.push(`?page=${page - 1}`)}
            >
              Trước
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page * 50 >= total}
              onClick={() => router.push(`?page=${page + 1}`)}
            >
              Sau
            </Button>
          </div>
        </div>
      </Card>
      {creating && (
        <Dialog
          title="Thêm nhân sự"
          onClose={() => setCreating(false)}
          busy={busy}
        >
          <form onSubmit={create}>
            <Field label="Họ và tên">
              <input name="full_name" required maxLength={120} autoFocus />
            </Field>
            <div className="form-grid">
              <Field label="Mã nhân sự">
                <input
                  name="employee_code"
                  required
                  maxLength={30}
                  placeholder="HZ-0048"
                />
              </Field>
              <Field label="Loại nhân sự">
                <select name="type">
                  {Object.entries(EMPLOYEE_TYPES)
                    .filter(([value]) => value !== 'intern')
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Ngày vào làm">
                <input name="hire_date" type="date" />
              </Field>
              <Field label="Email công ty (không bắt buộc)">
                <input name="email" type="email" maxLength={254} />
              </Field>
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Tạo hồ sơ'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
