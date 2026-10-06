import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { ProjectMembershipClient } from './_components/ProjectMembershipClient'
import { getWorkspaceUser } from '@/lib/workspace'

export default async function ProjectMembershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const { project } = await searchParams
  const supabase = await createClient()
  const [memberships, projects, profiles, user] = await Promise.all([
    supabase
      .from('project_membership')
      .select('*, project_project:project_id(name, code)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('project_project')
      .select('id, name, code')
      .order('name')
      .limit(100),
    supabase.from('core_user_profile').select('id, full_name').limit(100),
    getWorkspaceUser(),
  ])
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
  )
  const formatted = (memberships.data ?? []).map((m) => ({
    ...m,
    project_project: Array.isArray(m.project_project)
      ? m.project_project[0]
      : m.project_project,
    core_user_profile: { full_name: names.get(m.user_id) || null },
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
        <ProjectMembershipClient
          memberships={formatted}
          projects={projects.data ?? []}
          users={profiles.data ?? []}
          canManage={!!user?.roles.some((role) => ['company_owner', 'director', 'project_manager'].includes(role))}
          manageableProjectIds={user?.memberships.filter((membership) => membership.project_role === 'pm').map((membership) => membership.project_id) ?? []}
          initialProject={project}
        />
      </main>
    </div>
  )
}
