import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, textParam, uuidParam, searchPattern, type SearchValues } from '@/lib/list-query'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { ProjectMembershipClient } from './_components/ProjectMembershipClient'
import { getWorkspaceUser } from '@/lib/workspace'

export default async function ProjectMembershipsPage({
  searchParams,
}: {
  searchParams: Promise<SearchValues>
}) {
  const params=await searchParams; const project=uuidParam(params.project)
  const page=pageNumber(params.page); const q=textParam(params.q); const status=textParam(params.status)
  const supabase = await createClient()
  let query=supabase.from('admin_membership_directory').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id')
  if(project) query=query.eq('project_id',project)
  if(['active','expired','revoked','pending'].includes(status)) query=query.eq('effective_status',status)
  if(q) query=query.or('full_name.ilike.'+searchPattern(q)+',project_name.ilike.'+searchPattern(q)+',user_id.eq.'+(uuidParam(q) || '00000000-0000-0000-0000-000000000000'))
  const [memberships, projects, profiles, user] = await Promise.all([
    query.range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1),
    supabase
      .from('project_project')
      .select('id, name, code')
      .order('name')
      .limit(1000),
    supabase.from('core_user_profile').select('id, full_name').limit(1000),
    getWorkspaceUser(),
  ])
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
  )
  const formatted = (memberships.data ?? []).map((m) => ({
    ...m,
    project_project: {name:m.project_name,code:m.project_code},
    core_user_profile: { full_name: m.full_name || names.get(m.user_id) || null },
  }))
  return (
    <div className="page">
      <Topbar
        title="Thành viên dự án"
        subtitle="Vai trò và thời gian tham gia từng dự án"
      />
      <main id="main-content" className="page-content">
        <QueryNotice
          failed={[memberships, projects, profiles].some(
            (result) => !!result.error,
          )}
        />
        <form className="toolbar" method="get">
          <input name="q" aria-label="Tìm thành viên hoặc dự án" placeholder="Tìm thành viên, dự án…" defaultValue={q} />
          <select name="project" aria-label="Lọc dự án" defaultValue={project}><option value="">Tất cả dự án</option>{(projects.data ?? []).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select name="status" aria-label="Lọc trạng thái thành viên" defaultValue={status}><option value="">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="pending">Chưa đến ngày hiệu lực</option><option value="expired">Hết hạn</option><option value="revoked">Đã thu hồi</option></select>
          <button className="btn sm" type="submit">Lọc</button>
        </form>
        <ProjectMembershipClient
          memberships={formatted}
          projects={projects.data ?? []}
          users={profiles.data ?? []}
          canManage={!!user?.roles.some((role) => ['company_owner', 'director', 'project_manager'].includes(role))}
          manageableProjectIds={user?.memberships.filter((membership) => membership.project_role === 'pm').map((membership) => membership.project_id) ?? []}
          initialProject={project}
        />
        <Pagination page={page} total={memberships.count ?? 0} />
      </main>
    </div>
  )
}
