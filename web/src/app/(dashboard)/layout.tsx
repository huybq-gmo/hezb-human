import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { WorkspaceProvider } from '@/components/layout/WorkspaceProvider'
import { getWorkspaceUser } from '@/lib/workspace'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getWorkspaceUser()
  if (!user) redirect('/login')
  return (
    <WorkspaceProvider user={user}>
      <a href="#main-content" className="skip-link">
        Đi tới nội dung
      </a>
      <div className="app-shell">
        <Suspense fallback={<aside className="sidebar" />}>
          <Sidebar />
        </Suspense>
        <div className="app-main">
          {user.demoMode && (
            <div className="demo-notice" role="status">
              <span>Xem thử · Dữ liệu mẫu · Chỉ xem</span>
              <form action="/auth/demo" method="post">
                <input type="hidden" name="action" value="exit" />
                <button type="submit" className="text-link">
                  Về dữ liệu thật
                </button>
              </form>
            </div>
          )}
          {children}
        </div>
      </div>
    </WorkspaceProvider>
  )
}
