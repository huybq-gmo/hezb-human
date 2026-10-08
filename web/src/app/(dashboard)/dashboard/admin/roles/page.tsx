import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, textParam, uuidParam, searchPattern, type SearchValues } from '@/lib/list-query'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { getWorkspaceUser } from '@/lib/workspace'
import { RoleManagementClient } from './_components/RoleManagementClient'
import { APP_ROLE_LABELS } from '@/lib/types'

export default async function RolesPage({searchParams}: {searchParams: Promise<SearchValues>}) {
  const params=await searchParams; const page=pageNumber(params.page); const q=textParam(params.q)
  const role=textParam(params.role)
  const supabase = await createClient()
  const user = await getWorkspaceUser()
  const isCompanyOwner = user?.roles.includes('company_owner') || false
  let query=supabase.from('admin_role_directory').select('*',{count:'exact'}).is('revoked_at',null)
    .order('granted_at',{ascending:false}).order('id')
  if(q) query=query.or('full_name.ilike.'+searchPattern(q)+',user_id.eq.'+(uuidParam(q) || '00000000-0000-0000-0000-000000000000'))
  if(role && ['company_owner','hr_admin','finance_admin','director','project_manager','team_leader','developer','qa_reviewer','auditor'].includes(role)) query=query.eq('role',role)
  const [assignments, users, auditLogs, permissions, permissionDefinitions] = await Promise.all([
    query.range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1),
    supabase
      .from('core_user_profile')
      .select('id, full_name')
      .order('full_name')
      .limit(1000),
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
    core_user_profile: { full_name: assignment.full_name || names.get(assignment.user_id) || null },
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
        <form className="toolbar" method="get">
          <input name="q" aria-label="Tìm tên hoặc UUID người dùng" placeholder="Tìm tên hoặc UUID người dùng…" defaultValue={q} />
          <select name="role" aria-label="Lọc vai trò" defaultValue={role}><option value="">Tất cả vai trò</option>
            {Object.entries(APP_ROLE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select><button className="btn sm" type="submit">Lọc</button>
        </form>
        <RoleManagementClient
          isCompanyOwner={isCompanyOwner}
          initialData={formatted}
          userList={users.data ?? []}
          auditLogs={auditLogs.data ?? []}
          permissions={permissions.data ?? []}
          permissionDefinitions={permissionDefinitions.data ?? []}
        />
        <Pagination page={page} total={assignments.count ?? 0} />
      </main>
    </div>
  )
}
