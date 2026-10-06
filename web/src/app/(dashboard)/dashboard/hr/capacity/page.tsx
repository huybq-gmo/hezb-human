import { redirect } from 'next/navigation'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { CapacityClient } from './_components/CapacityClient'

export default async function CapacityPage() {
  const user = await getWorkspaceUser()
  if (!user?.roles.some((role) => ['company_owner', 'hr_admin', 'director', 'project_manager'].includes(role))) {
    redirect('/dashboard')
  }
  return (
    <div className="page">
      <Topbar title="Năng lực nhân sự" subtitle="Giờ làm việc còn khả dụng và tỷ lệ đã phân bổ" />
      <main id="main-content" className="page-content">
        <CapacityClient />
      </main>
    </div>
  )
}
