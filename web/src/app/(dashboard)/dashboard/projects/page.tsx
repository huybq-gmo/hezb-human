import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { ProjectListClient } from './_components/ProjectListClient'
import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, searchPattern, textParam, type SearchValues } from '@/lib/list-query'

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const params = await searchParams
  const tab = params.tab === 'proposals' ? 'proposals' : 'projects'
  const page = pageNumber(params.page)
  const status = ['active','completed','on_hold','all'].includes(textParam(params.status)) ? textParam(params.status) : 'active'
  const query = textParam(params.q).slice(0, 100)
  const supabase = await createClient()
  let projectQuery = supabase.from('project_project').select('*, project_client:client_id(name, code)', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id')
  let proposalQuery = supabase.from('project_proposal').select('*, project_client:client_id(name)', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id')
  if (status !== 'all') projectQuery = projectQuery.eq('status', status)
  if (query.trim()) {
    if (tab === 'projects') projectQuery = projectQuery.or(`name.ilike.${searchPattern(query)},code.ilike.${searchPattern(query)}`)
    else proposalQuery = proposalQuery.ilike('title', searchPattern(query))
  }
  const [projects, proposals, clients] = await Promise.all([
    projectQuery.range(tab === 'projects' ? (page - 1) * PAGE_SIZE : 0, tab === 'projects' ? page * PAGE_SIZE - 1 : PAGE_SIZE - 1),
    proposalQuery.range(tab === 'proposals' ? (page - 1) * PAGE_SIZE : 0, tab === 'proposals' ? page * PAGE_SIZE - 1 : PAGE_SIZE - 1),
    supabase.from('project_client').select('*').eq('is_active', true).order('name').limit(1000),
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
          key={`${tab}:${status}:${query}`}
          projects={formattedProjects}
          proposals={formattedProposals}
          clients={clients.data ?? []}
          initialTab={tab}
          initialStatus={status === 'all' ? '' : status}
          initialSearch={query}
        />
        <Pagination page={page} total={(tab === 'projects' ? projects.count : proposals.count) ?? 0} />
      </main>
    </div>
  )
}
