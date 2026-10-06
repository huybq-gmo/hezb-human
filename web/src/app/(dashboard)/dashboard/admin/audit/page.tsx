import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { AuditLogClient } from './_components/AuditLogClient'

export default async function AuditPage() {
  const user = await getWorkspaceUser()
  if (!user?.roles.some((role) => ['company_owner', 'auditor'].includes(role))) {
    redirect('/dashboard')
  }

  const supabase = await createClient()
  const [logs, profiles] = await Promise.all([
    supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range(0, 49),
    supabase.from('core_user_profile').select('id, full_name').limit(1000),
  ])
  return (
    <div className="page">
      <Topbar title="Nhật ký hệ thống" subtitle="Tra cứu thay đổi đã được kiểm toán" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={!!logs.error || !!profiles.error} />
        <AuditLogClient
          initialLogs={logs.data ?? []}
          total={logs.count ?? 0}
          profiles={profiles.data ?? []}
        />
      </main>
    </div>
  )
}
