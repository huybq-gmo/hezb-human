import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { getWorkspaceUser } from '@/lib/workspace'
import { RoleManagementClient } from './_components/RoleManagementClient'

export default async function RolesPage() {
  const supabase = await createClient()
  const user = await getWorkspaceUser()
  const isCompanyOwner = user?.roles.includes('company_owner') || false
  const [assignments, users, auditLogs, permissions, permissionDefinitions] = await Promise.all([
    supabase
      .from('core_role_assignment')
      .select('*')
      .is('revoked_at', null)
      .order('granted_at', { ascending: false })
      .limit(100),
    supabase
      .from('core_user_profile')
      .select('id, full_name')
      .order('full_name')
      .limit(100),
    isCompanyOwner
          ? supabase
              .from('audit_log')
              .select('*')
              .in('table_name', ['core_role_assignment', 'core_role_permission', 'core_permission_catalog'])
          .order('occurred_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('core_role_permission').select('role,permission,enabled').order('role').order('permission'),
    supabase.from('core_permission_catalog').select('code,label,description,capability,is_system').order('label'),
  ])
  const names = new Map(
    (users.data ?? []).map((profile) => [profile.id, profile.full_name]),
  )
  const formatted = (assignments.data ?? []).map((assignment) => ({
    ...assignment,
    core_user_profile: { full_name: names.get(assignment.user_id) || null },
  }))
  return (
    <div className="page">
      <Topbar
        title="Phân quyền"
        subtitle="Vai trò hệ thống và lịch sử thay đổi"
      />
      <main id="main-content" className="page-content">
        <QueryNotice
          failed={[assignments, users, auditLogs, permissions, permissionDefinitions].some(
            (result) => !!result.error,
          )}
        />
        <RoleManagementClient
          isCompanyOwner={isCompanyOwner}
          initialData={formatted}
          userList={users.data ?? []}
          auditLogs={auditLogs.data ?? []}
          permissions={permissions.data ?? []}
          permissionDefinitions={permissionDefinitions.data ?? []}
        />
      </main>
    </div>
  )
}
