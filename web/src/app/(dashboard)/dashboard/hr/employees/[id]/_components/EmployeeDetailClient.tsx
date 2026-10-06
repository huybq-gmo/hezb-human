'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Pencil, Plus } from 'lucide-react'
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
  const [balanceDraft, setBalanceDraft] = useState<{
    id?: string
    leave_type_id: string
    year: number
    total_days: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = user.hasRole('company_owner', 'hr_admin')
  const canRates = user.hasRole('company_owner', 'hr_admin', 'finance_admin')
  const tabs = [
    ['info', 'Thông tin chung'],
    ['contracts', `Hợp đồng (${contracts.length})`],
    ['skills', `Kỹ năng (${skills.length})`],
    ...(canRates ? [['rates', `Đơn giá (${rates.length})`]] : []),
    ['leave', 'Nghỉ phép'],
  ]
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
          <Card title="Tài khoản liên kết">
            <dl className="card-body key-values">
              <dt>Tài khoản</dt>
              <dd className="text-xs">{employee.user_id || 'Chưa liên kết'}</dd>
              <dt>Ngày tạo hồ sơ</dt>
              <dd>{formatDate(employee.created_at)}</dd>
            </dl>
          </Card>
        </div>
      )}
      {tab === 'contracts' && (
        <Card title="Lịch sử hợp đồng">
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
        <Card title="Kỹ năng chuyên môn">
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
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {tab === 'rates' && canRates && (
        <Card title="Lịch sử đơn giá">
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
      {tab === 'leave' && (
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
