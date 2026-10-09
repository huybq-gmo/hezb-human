'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Pencil, Plus, Trash2, UserRoundPlus } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { HexagonAvatar } from '@/components/HezbLogo'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge, Button, Card, EmptyState, Field } from '@/components/ui'
import {
  EMPLOYEE_TYPES,
  formatDate,
  formatMoney,
  STATUS_LABELS,
} from '@/lib/presentation'
import { cn } from '@/lib/utils'

interface Employee {
  id: string
  employee_code?: string
  full_name: string
  email: string | null
  type: string
  status: string
  job_title?: string | null
  user_id: string | null
  hire_date: string | null
  created_at: string
}
interface Contract {
  id: string
  contract_type: string
  start_date: string
  end_date: string | null
  notes: string | null
}
interface Rate {
  id: string
  rate_type: string
  amount: number
  currency: string
  effective_from: string
  effective_to: string | null
}
interface Balance {
  id: string
  leave_type_id: string
  total_days: number
  used_days: number
  year: number
  hr_leave_type?: { name: string } | null
}
interface LeaveType {
  id: string
  name: string
  default_days_per_year: number
}
interface Skill {
  id: string
  skill_name: string
  level: string | null
  certified_at: string | null
}
const TRANSITIONS: Record<string, string[]> = {
  onboarding: ['active'],
  active: ['offboarding'],
  offboarding: ['terminated'],
  terminated: [],
}
const CONTRACT_LABELS: Record<string, string> = {
  probation: 'Thử việc',
  fixed_term: 'Có thời hạn',
  indefinite: 'Không thời hạn',
  freelance: 'Freelance',
}
function todayInVietnam() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((values, part) => {
      if (part.type !== 'literal') values[part.type] = part.value
      return values
    }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function EmployeeDetailClient({
  employee,
  contracts,
  rates,
  leaveBalances,
  leaveTypes,
  skills,
}: {
  employee: Employee
  contracts: Contract[]
  rates: Rate[]
  leaveBalances: Balance[]
  leaveTypes: LeaveType[]
  skills: Skill[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const user = useWorkspace()
  const [tab, setTab] = useState('info')
  const [next, setNext] = useState<string | null>(null)
  const [accountDialog, setAccountDialog] = useState(false)
  const [accountAction, setAccountAction] = useState<'invite' | 'link-existing'>(
    'invite',
  )
  const [accountEmail, setAccountEmail] = useState(employee.email || '')
  const [accountError, setAccountError] = useState('')
  const [contractDialog, setContractDialog] = useState(false)
  const [skillDialog, setSkillDialog] = useState(false)
  const [rateDialog, setRateDialog] = useState(false)
  const [skillToDelete, setSkillToDelete] = useState<Skill | null>(null)
  const [balanceDraft, setBalanceDraft] = useState<{
    id?: string
    leave_type_id: string
    year: number
    total_days: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = user.hasRole('company_owner', 'hr_admin')
  const canRates = user.hasRole('company_owner', 'hr_admin', 'finance_admin')
  const canReadContracts = user.hasRole(
    'company_owner',
    'hr_admin',
    'finance_admin',
  )
  const canReadLeaveBalances = canManage || employee.user_id === user.id
  const tabs = [
    ['info', 'Thông tin chung'],
    ...(canReadContracts ? [['contracts', `Hợp đồng (${contracts.length})`]] : []),
    ['skills', `Kỹ năng (${skills.length})`],
    ...(canRates ? [['rates', `Đơn giá (${rates.length})`]] : []),
    ...(canReadLeaveBalances ? [['leave', 'Nghỉ phép']] : []),
  ]
  async function saveContract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const startDate = String(data.get('start_date') || '')
    const endDate = String(data.get('end_date') || '') || null
    if (endDate && endDate < startDate) {
      toast.error('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('hr_contract').insert({
        employee_id: employee.id,
        contract_type: String(data.get('contract_type') || ''),
        start_date: startDate,
        end_date: endDate,
        notes: String(data.get('notes') || '').trim() || null,
        created_by: user.id,
      })
      if (error) {
        toast.error('Không thể thêm hợp đồng. Kiểm tra quyền và dữ liệu.')
        return
      }
      toast.success('Đã thêm hợp đồng vào lịch sử')
      setContractDialog(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function saveSkill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const skillName = String(data.get('skill_name') || '').trim()
    if (
      skills.some(
        (skill) =>
          skill.skill_name.trim().toLocaleLowerCase('vi') ===
          skillName.toLocaleLowerCase('vi'),
      )
    ) {
      toast.error('Kỹ năng này đã có trong hồ sơ nhân sự.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('hr_skill').insert({
        employee_id: employee.id,
        skill_name: skillName,
        level: String(data.get('level') || '') || null,
        certified_at: String(data.get('certified_at') || '') || null,
        created_by: user.id,
      })
      if (error) {
        toast.error('Không thể thêm kỹ năng. Kiểm tra quyền và dữ liệu.')
        return
      }
      toast.success('Đã thêm kỹ năng')
      setSkillDialog(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function deleteSkill() {
    if (!skillToDelete) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from('hr_skill')
        .delete()
        .eq('id', skillToDelete.id)
        .eq('employee_id', employee.id)
      if (error) {
        toast.error('Không thể xóa kỹ năng. Kiểm tra quyền truy cập.')
        return
      }
      toast.success('Đã xóa kỹ năng')
      setSkillToDelete(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function saveRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const currency = String(data.get('currency') || '').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
      toast.error('Mã tiền tệ cần gồm đúng 3 chữ cái, ví dụ VND.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('save_employee_rate', {
        p_employee_id: employee.id,
        p_rate_type: String(data.get('rate_type') || ''),
        p_amount: Number(data.get('amount')),
        p_currency: currency,
        p_effective_from: String(data.get('effective_from') || ''),
        p_effective_to: String(data.get('effective_to') || '') || null,
      })
      if (error) {
        let message = 'Không thể thêm đơn giá. Kiểm tra quyền và khoảng hiệu lực.'
        if (error.message.includes('RATE_END_BEFORE_PREVIOUS')) {
          message =
            'Khoảng hiệu lực mới phải nối tiếp hết kỳ đơn giá cũ. Nếu kỳ cũ không có ngày kết thúc, hãy để trống ngày kết thúc mới.'
        } else if (error.message.includes('RATE_RANGE_CONFLICT')) {
          message =
            'Khoảng hiệu lực bị trùng với đơn giá đã lên lịch. Hãy kiểm tra lại ngày.'
        } else if (error.code === '23P01') {
          message =
            'Khoảng hiệu lực vừa được cập nhật và đang bị trùng. Hãy tải lại hồ sơ rồi thử lại.'
        } else if (error.message.includes('FORBIDDEN')) {
          message = 'Bạn không có quyền cập nhật đơn giá.'
        }
        toast.error(message)
        return
      }
      toast.success('Đã thêm đơn giá có hiệu lực')
      setRateDialog(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function submitAccountLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setAccountError('')
    try {
      const response = await fetch('/api/admin/employee-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: accountAction,
          employeeId: employee.id,
          email: accountEmail,
        }),
      })
      const result = (await response.json()) as {
        message?: string
        error?: string
      }
      if (!response.ok) {
        setAccountError(result.error || 'Không thể liên kết tài khoản.')
        return
      }
      toast.success(result.message || 'Đã liên kết tài khoản với nhân sự.')
      setAccountDialog(false)
      router.refresh()
    } catch {
      setAccountError('Không thể kết nối máy chủ. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }
  async function transition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const reason = String(
      new FormData(event.currentTarget).get('reason') || '',
    ).trim()
    try {
      let { error } = await supabase.rpc('transition_employee_status', {
        p_employee_id: employee.id,
        p_target_status: next,
        p_reason: reason || null,
      })
      if (error?.code === 'PGRST202') {
        const result = await supabase.rpc('transition_employee_status', {
          p_employee_id: employee.id,
          p_new_status: next,
          p_reason: reason || null,
        })
        error = result.error
      }
      if (error) {
        toast.error(
          'Không thể chuyển trạng thái. Kiểm tra quyền hoặc tải lại hồ sơ.',
        )
        return
      }
      toast.success('Đã cập nhật trạng thái nhân sự')
      setNext(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  async function saveBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!balanceDraft) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const { error } = await supabase.rpc('adjust_leave_balance', {
        p_employee_id: employee.id,
        p_leave_type_id: String(data.get('leave_type_id') || ''),
        p_year: Number(data.get('year')),
        p_total_days: Number(data.get('total_days')),
      })
      if (error) {
        toast.error(
          error.message.includes('BALANCE_BELOW_USED')
            ? 'Hạn mức mới không thể thấp hơn số ngày đã sử dụng.'
            : 'Không thể cập nhật hạn mức nghỉ phép.',
        )
        return
      }
      toast.success('Đã cập nhật hạn mức nghỉ phép')
      setBalanceDraft(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <Link className="text-link" href="/dashboard/hr/employees">
        ← Danh sách nhân sự
      </Link>
      <Card>
        <div className="card-body flex flex-wrap items-center justify-between gap-5">
          <div className="who">
            <HexagonAvatar
              name={employee.full_name}
              className="w-14 h-16 text-lg"
            />
            <div>
              <div className="toolbar profile-heading">
                <h2 className="detail-title">
                  {employee.full_name || 'Chưa đặt tên'}
                </h2>
                <StatusBadge status={employee.status} />
              </div>
              <p className="muted mt-1">
                {employee.employee_code || '—'} ·{' '}
                {EMPLOYEE_TYPES[employee.type] || employee.type}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="toolbar">
              {(TRANSITIONS[employee.status] || []).map((status) => (
                <Button
                  key={status}
                  variant="ghost"
                  size="sm"
                  onClick={() => setNext(status)}
                >
                  <ArrowRight size={14} />
                  {STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </Card>
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={cn(tab === id && 'on')}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'info' && (
        <div className="two-columns">
          <Card title="Thông tin cơ bản">
            <dl className="card-body key-values">
              <dt>Họ và tên</dt>
              <dd>{employee.full_name}</dd>
              <dt>Mã nhân sự</dt>
              <dd>{employee.employee_code || '—'}</dd>
              <dt>Chức danh</dt>
              <dd>{employee.job_title || '—'}</dd>
              <dt>Loại nhân sự</dt>
              <dd>{EMPLOYEE_TYPES[employee.type]}</dd>
              <dt>Ngày vào làm</dt>
              <dd>{formatDate(employee.hire_date)}</dd>
            </dl>
          </Card>
          <Card
            title="Tài khoản liên kết"
            action={
              canManage && !employee.user_id ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setAccountAction('invite')
                    setAccountEmail(employee.email || '')
                    setAccountError('')
                    setAccountDialog(true)
                  }}
                >
                  <UserRoundPlus size={15} /> Mời / liên kết
                </Button>
              ) : null
            }
          >
            <dl className="card-body key-values">
              <dt>Email</dt>
              <dd>{employee.email || 'Chưa có email'}</dd>
              <dt>Tài khoản</dt>
              <dd>
                {employee.user_id ? (
                  <div className="stack">
                    <Badge tone="ok">Đã liên kết</Badge>
                    <span className="text-xs break-all muted">
                      {employee.user_id}
                    </span>
                  </div>
                ) : (
                  <Badge tone="wn">Chưa liên kết</Badge>
                )}
              </dd>
              <dt>Ngày tạo hồ sơ</dt>
              <dd>{formatDate(employee.created_at)}</dd>
            </dl>
          </Card>
        </div>
      )}
      {tab === 'contracts' && canReadContracts && (
        <Card
          title="Lịch sử hợp đồng"
          action={
            canManage ? (
              <Button size="sm" onClick={() => setContractDialog(true)}>
                <Plus size={15} /> Thêm hợp đồng
              </Button>
            ) : null
          }
        >
          {!contracts.length ? (
            <EmptyState title="Chưa có hợp đồng được lưu trữ" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Loại hợp đồng</th>
                    <th>Từ ngày</th>
                    <th>Đến ngày</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td className="font-medium">
                        {CONTRACT_LABELS[contract.contract_type] ||
                          contract.contract_type}
                      </td>
                      <td className="num">{formatDate(contract.start_date)}</td>
                      <td className="num">
                        {contract.end_date
                          ? formatDate(contract.end_date)
                          : 'Không thời hạn'}
                      </td>
                      <td className="muted">{contract.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {tab === 'skills' && (
        <Card
          title="Kỹ năng chuyên môn"
          action={
            canManage ? (
              <Button size="sm" onClick={() => setSkillDialog(true)}>
                <Plus size={15} /> Thêm kỹ năng
              </Button>
            ) : null
          }
        >
          {!skills.length ? (
            <EmptyState title="Chưa cập nhật kỹ năng" />
          ) : (
            <div className="card-body flex flex-wrap gap-3">
              {skills.map((skill) => (
                <div className="toolbar" key={skill.id}>
                  <Badge tone="pr">{skill.skill_name}</Badge>
                  <span className="muted">
                    {(
                      {
                        beginner: 'Cơ bản',
                        intermediate: 'Thành thạo',
                        expert: 'Chuyên gia',
                      } as Record<string, string>
                    )[skill.level || ''] || skill.level}
                  </span>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Xóa kỹ năng ${skill.skill_name}`}
                      onClick={() => setSkillToDelete(skill)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {tab === 'rates' && canRates && (
        <Card
          title="Lịch sử đơn giá"
          action={
            canManage ? (
              <Button size="sm" onClick={() => setRateDialog(true)}>
                <Plus size={15} /> Thêm đơn giá
              </Button>
            ) : null
          }
        >
          {!rates.length ? (
            <EmptyState title="Chưa có đơn giá" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Loại đơn giá</th>
                    <th>Mức đơn giá</th>
                    <th>Hiệu lực từ</th>
                    <th>Đến ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((rate) => (
                    <tr key={rate.id}>
                      <td>
                        {(
                          {
                            hourly: 'Theo giờ',
                            daily: 'Theo ngày',
                            monthly: 'Theo tháng',
                          } as Record<string, string>
                        )[rate.rate_type] || rate.rate_type}
                      </td>
                      <td className="num font-semibold">
                        {formatMoney(rate.amount, rate.currency)}
                      </td>
                      <td>{formatDate(rate.effective_from)}</td>
                      <td>
                        {rate.effective_to
                          ? formatDate(rate.effective_to)
                          : 'Hiện hành'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {tab === 'leave' && canReadLeaveBalances && (
        <div className="stack">
          {canManage && (
            <div className="toolbar toolbar-end">
              <Button
                size="sm"
                disabled={!leaveTypes.length}
                onClick={() =>
                  setBalanceDraft({
                    leave_type_id: leaveTypes[0]?.id || '',
                    year: new Date().getFullYear(),
                    total_days: leaveTypes[0]?.default_days_per_year || 0,
                  })
                }
              >
                <Plus size={15} /> Cấp hạn mức
              </Button>
            </div>
          )}
          {!leaveBalances.length ? (
            <Card>
              <EmptyState title="Chưa có hạn mức nghỉ phép năm nay" />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {leaveBalances.map((balance) => (
                <Card
                  key={balance.id}
                  title={balance.hr_leave_type?.name || 'Nghỉ phép'}
                  action={
                    <div className="toolbar">
                      <Badge>{balance.year}</Badge>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Chỉnh hạn mức ${balance.hr_leave_type?.name || 'nghỉ phép'}`}
                          onClick={() =>
                            setBalanceDraft({
                              id: balance.id,
                              leave_type_id: balance.leave_type_id,
                              year: balance.year,
                              total_days: Number(balance.total_days),
                            })
                          }
                        >
                          <Pencil size={14} />
                        </Button>
                      )}
                    </div>
                  }
                >
                <div className="card-body grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Tổng ngày', balance.total_days],
                    ['Đã dùng', balance.used_days],
                    [
                      'Còn lại',
                      Number(balance.total_days) - Number(balance.used_days),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="muted">{label}</p>
                      <b className="num text-xl">{value}</b>
                    </div>
                  ))}
                </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      {contractDialog && (
        <Dialog
          title="Thêm hợp đồng"
          onClose={() => setContractDialog(false)}
          busy={busy}
        >
          <form onSubmit={saveContract}>
            <p className="muted mb-4">
              Hợp đồng được lưu vào lịch sử. Không thể sửa hoặc xóa sau khi tạo.
            </p>
            <Field label="Loại hợp đồng">
              <select name="contract_type" required defaultValue="probation">
                <option value="probation">Thử việc</option>
                <option value="fixed_term">Có thời hạn</option>
                <option value="indefinite">Không thời hạn</option>
                <option value="freelance">Freelance</option>
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Ngày bắt đầu">
                <input name="start_date" type="date" required />
              </Field>
              <Field label="Ngày kết thúc">
                <input name="end_date" type="date" />
              </Field>
            </div>
            <Field label="Ghi chú">
              <textarea name="notes" maxLength={2000} />
            </Field>
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setContractDialog(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Thêm hợp đồng'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {skillDialog && (
        <Dialog
          title="Thêm kỹ năng"
          onClose={() => setSkillDialog(false)}
          busy={busy}
        >
          <form onSubmit={saveSkill}>
            <Field label="Tên kỹ năng">
              <input
                name="skill_name"
                required
                minLength={2}
                maxLength={100}
                autoFocus
                placeholder="Ví dụ: TypeScript"
              />
            </Field>
            <div className="form-grid">
              <Field label="Mức độ">
                <select name="level" defaultValue="">
                  <option value="">Chưa đánh giá</option>
                  <option value="beginner">Cơ bản</option>
                  <option value="intermediate">Thành thạo</option>
                  <option value="expert">Chuyên gia</option>
                </select>
              </Field>
              <Field label="Ngày chứng nhận (nếu có)">
                <input name="certified_at" type="date" />
              </Field>
            </div>
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setSkillDialog(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Thêm kỹ năng'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {skillToDelete && (
        <Dialog
          title="Xóa kỹ năng"
          onClose={() => setSkillToDelete(null)}
          busy={busy}
        >
          <p className="mb-5">
            Xóa kỹ năng <b>{skillToDelete.skill_name}</b> khỏi hồ sơ của{' '}
            {employee.full_name}?
          </p>
          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setSkillToDelete(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void deleteSkill()}
            >
              {busy ? 'Đang xóa…' : 'Xóa kỹ năng'}
            </Button>
          </div>
        </Dialog>
      )}
      {rateDialog && (
        <Dialog
          title="Thêm đơn giá"
          onClose={() => setRateDialog(false)}
          busy={busy}
        >
          <form onSubmit={saveRate}>
            <p className="muted mb-4">
              Đơn giá cũ được giữ trong lịch sử. Nếu kỳ cũ đang còn hiệu lực,
              hệ thống tự kết thúc kỳ đó vào ngày trước ngày bắt đầu mới.
            </p>
            <Field label="Loại đơn giá">
              <select name="rate_type" required defaultValue="monthly">
                <option value="hourly">Theo giờ</option>
                <option value="daily">Theo ngày</option>
                <option value="monthly">Theo tháng</option>
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Mức đơn giá">
                <input
                  name="amount"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  required
                />
              </Field>
              <Field label="Tiền tệ">
                <input
                  name="currency"
                  required
                  minLength={3}
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  defaultValue="VND"
                />
              </Field>
              <Field label="Hiệu lực từ">
                <input
                  name="effective_from"
                  type="date"
                  required
                  defaultValue={todayInVietnam()}
                />
              </Field>
              <Field label="Hiệu lực đến (tùy chọn)">
                <input name="effective_to" type="date" />
              </Field>
            </div>
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setRateDialog(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Thêm đơn giá'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {balanceDraft && (
        <Dialog
          title="Hạn mức nghỉ phép"
          onClose={() => setBalanceDraft(null)}
          busy={busy}
        >
          <form onSubmit={saveBalance}>
            <Field label="Loại nghỉ phép">
              {balanceDraft.id && (
                <>
                  <input
                    type="hidden"
                    name="leave_type_id"
                    value={balanceDraft.leave_type_id}
                  />
                  <input
                    type="hidden"
                    name="year"
                    value={balanceDraft.year}
                  />
                </>
              )}
              <select
                name={balanceDraft.id ? undefined : 'leave_type_id'}
                value={balanceDraft.leave_type_id}
                onChange={(event) =>
                  setBalanceDraft({
                    ...balanceDraft,
                    leave_type_id: event.target.value,
                  })
                }
                disabled={!!balanceDraft.id}
                required
              >
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Năm">
                <input
                  name={balanceDraft.id ? undefined : 'year'}
                  type="number"
                  min="2000"
                  max="2200"
                  value={balanceDraft.year}
                  disabled={!!balanceDraft.id}
                  onChange={(event) =>
                    setBalanceDraft({
                      ...balanceDraft,
                      year: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
              <Field label="Tổng ngày được nghỉ">
                <input
                  name="total_days"
                  type="number"
                  min="0"
                  step="0.5"
                  value={balanceDraft.total_days}
                  onChange={(event) =>
                    setBalanceDraft({
                      ...balanceDraft,
                      total_days: Number(event.target.value),
                    })
                  }
                  required
                />
              </Field>
            </div>
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setBalanceDraft(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang lưu…' : 'Lưu hạn mức'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {accountDialog && (
        <Dialog
          title="Mời hoặc liên kết tài khoản"
          onClose={() => setAccountDialog(false)}
          busy={busy}
        >
          <form onSubmit={submitAccountLink}>
            <p className="muted mb-4">
              Tài khoản sẽ được liên kết với hồ sơ của {employee.full_name}.
            </p>
            <Field label="Cách xử lý tài khoản">
              <select
                value={accountAction}
                onChange={(event) =>
                  setAccountAction(
                    event.target.value as 'invite' | 'link-existing',
                  )
                }
              >
                <option value="invite">Mời tài khoản mới</option>
                <option value="link-existing">
                  Liên kết tài khoản đã có
                </option>
              </select>
            </Field>
            <Field label="Email tài khoản">
              <input
                type="email"
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                autoFocus={!employee.email}
                required
              />
            </Field>
            <p className="muted mb-4">
              {accountAction === 'invite'
                ? 'Supabase gửi email để người nhận xác nhận và tự đặt mật khẩu. Email này sẽ được lưu vào hồ sơ; Owner cần cấp vai trò tại trang Phân quyền.'
                : 'Email phải trùng với email tài khoản Supabase Auth và sẽ được lưu vào hồ sơ nhân sự.'}
            </p>
            {accountError && (
              <p className="field-error" role="alert">
                {accountError}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setAccountDialog(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? 'Đang xử lý…'
                  : accountAction === 'invite'
                    ? 'Gửi lời mời'
                    : 'Liên kết tài khoản'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {next && (
        <Dialog
          title={`Chuyển sang ${STATUS_LABELS[next]}`}
          onClose={() => setNext(null)}
          busy={busy}
        >
          <form onSubmit={transition}>
            <p>
              Chuyển trạng thái hồ sơ của <b>{employee.full_name}</b> từ{' '}
              {STATUS_LABELS[employee.status]} sang {STATUS_LABELS[next]}.
            </p>
            <Field label="Lý do (tùy chọn)">
              <textarea
                name="reason"
                autoFocus
                placeholder="Ví dụ: Hoàn tất thử việc"
              />
            </Field>
            <div className="form-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setNext(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Đang cập nhật…' : 'Xác nhận'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
