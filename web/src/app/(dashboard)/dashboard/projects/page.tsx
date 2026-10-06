import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { ProjectListClient } from './_components/ProjectListClient'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const [projects, proposals, clients] = await Promise.all([
    supabase
      .from('project_project')
      .select('*, project_client:client_id(name, code)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('project_proposal')
      .select('*, project_client:client_id(name)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('project_client').select('*').eq('is_active', true).order('name').limit(100),
  ])
  const formattedProjects = (projects.data ?? []).map((p) => ({
    ...p,
    currency: p.budget_currency || p.currency || 'VND',
    project_client: Array.isArray(p.project_client)
      ? p.project_client[0]
      : p.project_client,
  }))
  const formattedProposals = (proposals.data ?? []).map((p) => ({
    ...p,
    budget_amount: p.estimated_budget ?? p.budget_amount,
    project_client: Array.isArray(p.project_client)
      ? p.project_client[0]
      : p.project_client,
  }))
  return (
    <div className="page">
      <Topbar title="Dự án" subtitle="Theo dõi dự án và phê duyệt đề xuất" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={!!projects.error || !!proposals.error || !!clients.error} />
        <ProjectListClient
          projects={formattedProjects}
          proposals={formattedProposals}
          clients={clients.data ?? []}
        />
      </main>
    </div>
  )
}
