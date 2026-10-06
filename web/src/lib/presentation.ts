import type { Tone } from '@/components/ui'

export const STATUS_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  onboarding: 'Onboarding',
  offboarding: 'Offboarding',
  terminated: 'Đã nghỉ việc',
  on_leave: 'Đang nghỉ phép',
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  sent: 'Đã gửi',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
  completed: 'Hoàn thành',
  paused: 'Tạm dừng',
  on_hold: 'Tạm dừng',
  backlog: 'Backlog',
  todo: 'Cần làm',
  in_progress: 'Đang làm',
  in_review: 'Đang review',
  done: 'Hoàn thành',
  blocked: 'Bị chặn',
  submitted: 'Chờ Leader',
  leader_approved: 'Chờ PM',
  pm_approved: 'Đã duyệt',
  locked: 'Đã khóa',
  adjustment_pending: 'Chờ điều chỉnh',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
  open: 'Đang mở',
  accepted: 'Đã nghiệm thu',
  released: 'Đã kết thúc',
  on_track: 'Đúng tiến độ',
  at_risk: 'Có rủi ro',
  overdue: 'Quá hạn',
}

export const STATUS_TONES: Record<string, Tone> = {
  active: 'ok',
  onboarding: 'pr',
  offboarding: 'wn',
  on_leave: 'wn',
  pending: 'wn',
  sent: 'pr',
  approved: 'ok',
  rejected: 'er',
  submitted: 'pr',
  leader_approved: 'pr',
  pm_approved: 'ok',
  locked: 'ok',
  adjustment_pending: 'wn',
  paused: 'wn',
  on_hold: 'wn',
  completed: 'ok',
  in_progress: 'pr',
  in_review: 'wn',
  done: 'ok',
  blocked: 'er',
  expired: 'er',
  revoked: 'wn',
  accepted: 'ok',
  on_track: 'ok',
  at_risk: 'wn',
  overdue: 'er',
}

export const EMPLOYEE_TYPES: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  freelancer: 'Freelancer',
  contractor: 'Contractor',
  intern: 'Thực tập sinh',
}
export const PROJECT_ROLES: Record<string, string> = {
  pm: 'Project Manager',
  team_leader: 'Team Leader',
  developer: 'Developer',
  qa_reviewer: 'QA Reviewer',
}
export const PRIORITIES: Record<string, string> = {
  critical: 'Khẩn cấp',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
}
export const ISSUE_TYPES: Record<string, string> = {
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
  subtask: 'Subtask',
  bug: 'Bug',
}
export const NEXT_STATUSES: Record<string, string[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'cancelled'],
  in_progress: ['in_review', 'blocked'],
  in_review: ['done', 'in_progress'],
  done: ['backlog'],
  blocked: ['in_progress'],
  cancelled: [],
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}
export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}
export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
export function formatMoney(amount?: number | string | null, currency = 'VND') {
  return amount == null
    ? '—'
    : new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: currency.trim(),
        maximumFractionDigits: currency.trim() === 'VND' ? 0 : 2,
      }).format(Number(amount))
}
export function formatCompactMoney(
  amount?: number | string | null,
  currency = 'VND',
) {
  if (amount == null) return '—'
  const value = Number(amount)
  if (currency.trim() === 'VND' && Math.abs(value) >= 1_000_000) {
    const divisor = Math.abs(value) >= 1_000_000_000 ? 1_000_000_000 : 1_000_000
    const unit = divisor === 1_000_000_000 ? 'tỷ' : 'triệu'
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value / divisor)} ${unit} ₫`
  }
  return formatMoney(amount, currency)
}

export function effectiveMembershipStatus(member: {
  status: string
  start_date: string
  end_date: string | null
}) {
  const today = localDate()
  if (member.status !== 'active') return member.status
  if (member.end_date && member.end_date < today) return 'expired'
  if (member.start_date > today) return 'pending'
  return 'active'
}

export function issueCode(issue: {
  id: string
  project_project?: { code: string | null } | null
}) {
  return `${issue.project_project?.code || 'HZ'}-${issue.id.slice(0, 6).toUpperCase()}`
}
