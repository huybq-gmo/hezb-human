'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { SearchField } from '@/components/ui'
import { ThemeToggle } from './ThemeToggle'
import { Notifications } from './Notifications'
import { useWorkspace } from './WorkspaceProvider'

export function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  const user = useWorkspace()
  const canLog =
    user.hasRole(
      'company_owner',
      'project_manager',
      'team_leader',
      'developer',
      'qa_reviewer',
    ) || user.memberships.length > 0
  return (
    <header className="topbar">
      <div className="topbar-heading">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <form action="/dashboard/search" role="search" className="topbar-search">
        <SearchField
          name="q"
          placeholder="Tìm nhân sự, dự án, issue…"
          required
        />
      </form>
      {actions}
      {canLog && (
        <Link
          href="/dashboard/worklogs?log=1"
          className="btn sm"
          aria-label="Ghi nhận giờ làm"
        >
          <Plus size={15} />
          <span className="log-label">Log work</span>
        </Link>
      )}
      <Notifications />
      <ThemeToggle />
    </header>
  )
}
