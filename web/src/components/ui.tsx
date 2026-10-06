import { cloneElement, isValidElement, type ReactElement } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'
import { Inbox, Search, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Button({
  variant = 'primary',
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm'
}) {
  return (
    <button
      type={type}
      className={cn('btn', variant !== 'primary' && variant, size, className)}
      {...props}
    />
  )
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('card', className)}>
      {title && (
        <div className="card-header">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export type Tone = 'neutral' | 'ok' | 'wn' | 'er' | 'pr'
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: Tone
}) {
  return (
    <span className={cn('chip', tone !== 'neutral' && tone)}>{children}</span>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon || <Inbox size={28} strokeWidth={1.5} />}
      <p>{title}</p>
      {description && <span>{description}</span>}
      {action}
    </div>
  )
}

export function QueryNotice({ failed }: { failed?: boolean }) {
  if (!failed) return null
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={17} />
      <span>
        Không thể tải đầy đủ dữ liệu. Vui lòng tải lại trang hoặc kiểm tra kết
        nối.
      </span>
    </div>
  )
}

export function SearchField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('search-field', className)}>
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        aria-label={props.placeholder || 'Tìm kiếm'}
        {...props}
      />
    </div>
  )
}

export function Field({
  label,
  error,
  children,
  className,
}: {
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('field', className)}>
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              'aria-label': string
              'aria-invalid'?: boolean
            }>,
            { 'aria-label': label, 'aria-invalid': !!error },
          )
        : children}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

export function Progress({
  value,
  max = 100,
  label,
  danger = false,
}: {
  value: number
  max?: number
  label: string
  danger?: boolean
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={cn('progress', danger && 'danger')}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, value)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}

export function MetricStrip({
  items,
}: {
  items: { label: string; value: ReactNode; detail?: ReactNode }[]
}) {
  return (
    <div className="card metric-strip">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <b className="num">{item.value}</b>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </div>
  )
}

export function ApprovalSteps({ status }: { status: string }) {
  const steps = ['Nháp', 'Leader duyệt', 'PM duyệt', 'Đã khóa']
  const current =
    (
      {
        draft: 0,
        submitted: 1,
        leader_approved: 2,
        pm_approved: 3,
        locked: 4,
      } as Record<string, number>
    )[status] ?? 0
  return (
    <ol className="approval-steps" aria-label="Tiến trình duyệt">
      {steps.map((step, index) => (
        <li
          key={step}
          className={
            index < current ? 'complete' : index === current ? 'current' : ''
          }
          aria-current={index === current ? 'step' : undefined}
        >
          <span />
          {step}
        </li>
      ))}
    </ol>
  )
}
