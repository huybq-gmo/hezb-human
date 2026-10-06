import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { getWorkspaceUser } from '@/lib/workspace'
import { ProfileClient } from './_components/ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const user = (await getWorkspaceUser())!
  const canAudit = user.roles.some((role) =>
    ['company_owner', 'auditor'].includes(role),
  )
  const [profile, roles, memberships, logs] = await Promise.all([
    supabase
      .from('core_user_profile')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('core_role_assignment')
      .select('*')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .limit(100),
    supabase
      .from('project_membership')
      .select('*, project_project:project_id(name, code)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    canAudit
      ? supabase
          .from('audit_log')
          .select('*')
          .or(`actor_id.eq.${user.id},record_id.eq.${user.id}`)
          .order('occurred_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
  ])
  const formatted = (memberships.data ?? []).map((m) => ({
    ...m,
    project_project: Array.isArray(m.project_project)
      ? m.project_project[0]
      : m.project_project,
  }))
  return (
    <div className="page">
      <Topbar
        title="Hồ sơ cá nhân"
        subtitle="Thông tin tài khoản và vai trò được cấp"
      />
      <main id="main-content" className="page-content">
        <QueryNotice
          failed={[profile, roles, memberships, logs].some(
            (result) => !!result.error,
          )}
        />
        <ProfileClient
          user={{ id: user.id, email: user.email }}
          profile={profile.data}
          roles={roles.data ?? []}
          memberships={formatted}
          recentLogs={logs.data ?? []}
          canAudit={canAudit}
        />
      </main>
    </div>
  )
}
