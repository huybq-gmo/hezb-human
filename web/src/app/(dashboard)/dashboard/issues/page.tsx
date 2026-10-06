import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { IssueListClient } from './_components/IssueListClient'

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const { project } = await searchParams
  const supabase = await createClient()
  const [issues, projects] = await Promise.all([
    supabase
      .from('work_issue_with_sla')
      .select('*, project_project:project_id(name, code)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('project_project')
      .select('id, name, code')
      .eq('status', 'active')
      .limit(100),
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
        <QueryNotice failed={!!issues.error || !!projects.error} />
        <IssueListClient
          issues={formattedIssues}
          projects={projects.data ?? []}
          initialProject={project}
        />
      </main>
    </div>
  )
}
