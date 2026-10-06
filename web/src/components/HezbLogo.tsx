import React from 'react'
import { cn } from '@/lib/utils'

export function HezbMark({ className = 'w-8 h-9' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-66 -76 132 152"
      fill="none"
      aria-hidden="true"
    >
      <polygon
        points="0,-72 62.4,-36 62.4,36 0,72 -62.4,36 -62.4,-36"
        fill="#4F46E5"
      />
      <rect x="-22" y="-30" width="12" height="60" rx="2" fill="#fff" />
      <rect x="10" y="-30" width="12" height="60" rx="2" fill="#fff" />
      <polygon points="-10,18 -10,6 10,-18 10,-6" fill="#22D3EE" />
    </svg>
  )
}

export function HezbLogo({
  className = '',
  textClassName = 'text-[26px] font-bold tracking-tight text-[var(--ink)]',
}: {
  className?: string
  textClassName?: string
}) {
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <HezbMark className="w-7 h-8 shrink-0" />
      <span className={textClassName}>Hezb</span>
    </div>
  )
}

export function HexagonAvatar({
  name,
  className = '',
}: {
  name: string | null | undefined
  className?: string
}) {
  const safeName = (name || '').trim() || 'Hezb'
  const parts = safeName.split(/\s+/).slice(-2)
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : safeName.slice(0, 2).toUpperCase()

  return (
    <div
      className={cn('hx select-none', className)}
      style={{
        clipPath: 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)',
      }}
      title={safeName}
    >
      {initials}
    </div>
  )
}
