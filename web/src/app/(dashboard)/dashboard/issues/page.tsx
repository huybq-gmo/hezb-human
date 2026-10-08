import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { IssueListClient } from './_components/IssueListClient'
import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, searchPattern, textParam, uuidParam, type SearchValues } from '@/lib/list-query'

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchValues>
}) {
  const params = await searchParams
  const project = uuidParam(params.project)
  const sprint = textParam(params.sprint) === 'backlog' ? 'backlog' : uuidParam(params.sprint)
  const query = textParam(params.q).slice(0, 100)
  const overdue = params.overdue === '1'
  const page = pageNumber(params.page)
  const supabase = await createClient()
  let issueQuery = supabase.from('work_issue_with_sla')
    .select('*, project_project:project_id(name, code)', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id')
  if (project) issueQuery = issueQuery.eq('project_id', project)
  if (sprint === 'backlog') issueQuery = issueQuery.is('sprint_id', null)
  else if (sprint) issueQuery = issueQuery.eq('sprint_id', sprint)
  if (query.trim()) issueQuery = issueQuery.ilike('title', searchPattern(query))
  if (overdue) issueQuery = issueQuery.eq('is_overdue', true)
  let sprintQuery = supabase.from('work_sprint').select('id,project_id,name,status').order('start_date', { ascending: false }).limit(1000)
  if (project) sprintQuery = sprintQuery.eq('project_id', project)
  const [issues, projects, sprints] = await Promise.all([
    issueQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase
      .from('project_project')
      .select('id, name, code')
      .order('name')
      .limit(1000),
    sprintQuery,
  ])
  const formattedIssues = (issues.data ?? []).map((issue) => ({
    ...issue,
    project_project: Array.isArray(issue.project_project)
      ? issue.project_project[0]
      : issue.project_project,
  }))
  return (
    <div className="page">
      <Topbar
        title="Board & ticket"
        subtitle="Theo dõi công việc, tiến độ và thời hạn"
      />
      <main id="main-content" className="page-content">
        <QueryNotice failed={[issues, projects, sprints].some((result) => !!result.error)} />
        <IssueListClient
          key={`${project}:${sprint}:${query}:${overdue}`}
          issues={formattedIssues}
          projects={projects.data ?? []}
          initialProject={project}
          sprints={sprints.data ?? []}
          initialSprint={sprint}
          initialSearch={query}
          initialOverdue={overdue}
        />
        <Pagination page={page} total={issues.count ?? 0} />
      </main>
    </div>
  )
}
