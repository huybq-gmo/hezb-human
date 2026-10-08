'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  FolderKanban,
  Kanban,
  Clock,
  CheckSquare,
  Users,
  Calendar,
  Activity,
  ReceiptText,
  WalletCards,
  ShieldCheck,
  ScrollText,
  UserCircle,
  Network,
  LogOut,
  Search,
} from 'lucide-react'
import { HezbLogo, HexagonAvatar } from '@/components/HezbLogo'
import { useWorkspace } from './WorkspaceProvider'
import { APP_ROLE_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { isDemoAvailable } from '@/lib/demo'

export function Sidebar() {
  const pathname = usePathname()
  const params = useSearchParams()
  const user = useWorkspace()
  const canReview =
    user.hasRole('company_owner', 'project_manager', 'team_leader') ||
    user.memberships.some((m) => ['pm', 'team_leader'].includes(m.project_role))
  const sections = [
    {
      title: 'Tổng quan',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Dự án',
      items: [
        { label: 'Dự án', href: '/dashboard/projects', icon: FolderKanban },
        { label: 'Khách hàng', href: '/dashboard/clients', icon: Users },
        { label: 'Board & ticket', href: '/dashboard/issues', icon: Kanban },
      ],
    },
    {
      title: 'Chấm công',
      items: [
        {
          label: 'Timesheet của tôi',
          href: '/dashboard/worklogs',
          icon: Clock,
        },
        ...(canReview
          ? [
              {
                label: 'Duyệt timesheet',
                href: '/dashboard/worklogs?tab=approval',
                icon: CheckSquare,
              },
            ]
          : []),
      ],
    },
    {
      title: 'Nhân sự',
      items: [
        { label: 'Nhân sự', href: '/dashboard/hr/employees', icon: Users },
        ...(user.hasRole('company_owner', 'hr_admin')
          ? [{ label: 'Nhóm & trưởng nhóm', href: '/dashboard/hr/teams', icon: Network }]
          : []),
        { label: 'Nghỉ phép', href: '/dashboard/hr/leave', icon: Calendar },
        ...(user.hasRole('company_owner', 'hr_admin', 'director', 'project_manager')
          ? [{ label: 'Năng lực', href: '/dashboard/hr/capacity', icon: Activity }]
          : []),
      ],
    },
    {
      title: 'Hệ thống',
      items: [
        ...(user.hasRole('company_owner', 'finance_admin', 'director', 'auditor')
          ? [{ label: 'Hóa đơn', href: '/dashboard/finance/invoices', icon: ReceiptText }]
          : []),
        ...(user.hasRole('company_owner', 'finance_admin', 'hr_admin')
          ? [{ label: 'Bảng lương', href: '/dashboard/payroll', icon: WalletCards }]
          : []),
        ...(user.hasRole('company_owner', 'hr_admin')
          ? [
              {
                label: 'Phân quyền',
                href: '/dashboard/admin/roles',
                icon: ShieldCheck,
              },
            ]
          : []),
        ...(user.hasRole('company_owner', 'auditor')
          ? [{ label: 'Nhật ký hệ thống', href: '/dashboard/admin/audit', icon: ScrollText }]
          : []),
        {
          label: 'Thành viên dự án',
          href: '/dashboard/admin/memberships',
          icon: Network,
        },
        { label: 'Tìm kiếm', href: '/dashboard/search', icon: Search },
        {
          label: 'Hồ sơ cá nhân',
          href: '/dashboard/profile',
          icon: UserCircle,
        },
      ],
    },
  ]
  return (
    <aside className="sidebar" aria-label="Điều hướng chính">
      <div className="sidebar-brand">
        <Link href="/dashboard" aria-label="Hezb — Dashboard">
          <HezbLogo />
        </Link>
      </div>
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="nav-group">{section.title}</p>
            {section.items.map((item) => {
              const [path, query] = item.href.split('?')
              const isActive =
                path === '/dashboard/worklogs'
                  ? pathname === path &&
                    (query
                      ? ['approval', 'timesheet'].includes(
                          params.get('tab') || '',
                        )
                      : !['approval', 'timesheet'].includes(
                          params.get('tab') || '',
                        ))
                  : pathname === path ||
                    (path !== '/dashboard' && pathname.startsWith(path + '/'))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn('nav-link', isActive && 'active')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      {isDemoAvailable && !user.demoMode && (
        <form action="/auth/demo" method="post" className="sidebar-preview">
          <button type="submit" className="btn ghost sm">
            Xem dữ liệu mẫu
          </button>
        </form>
      )}
      <div className="sidebar-user">
        <Link href="/dashboard/profile">
          <HexagonAvatar name={user.name} />
          <div className="identity">
            <p>{user.name}</p>
            <small>{APP_ROLE_LABELS[user.roles[0]] || 'Thành viên'}</small>
          </div>
        </Link>
        <a
          href="/auth/logout"
          className="ib"
          aria-label={user.demoMode ? 'Thoát dữ liệu mẫu' : 'Đăng xuất'}
          title={user.demoMode ? 'Thoát dữ liệu mẫu' : 'Đăng xuất'}
        >
          <LogOut size={16} />
        </a>
      </div>
    </aside>
  )
}
