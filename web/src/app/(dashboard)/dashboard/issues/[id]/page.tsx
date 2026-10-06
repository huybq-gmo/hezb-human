import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { IssueDetailClient } from './_components/IssueDetailClient'

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: issue, error } = await supabase
    .from('work_issue_with_sla')
    .select('*, project_project:project_id(name, code)')
    .eq('id', id)
    .maybeSingle()
  if (!issue && !error) notFound()
  if (!issue)
    return (
      <div className="page">
        <Topbar title="Ticket" />
        <main id="main-content" className="page-content">
          <QueryNotice failed />
        </main>
      </div>
    )
  const [comments, logs, profiles, projectMembers] = await Promise.all([
    supabase
      .from('work_issue_comment')
      .select('*')
      .eq('issue_id', id)
      .eq('is_deleted', false)
      .order('created_at')
      .limit(100),
    supabase
      .from('work_worklog')
      .select('*, hr_employee:employee_id(full_name)')
      .eq('issue_id', id)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.from('core_user_profile').select('id, full_name').limit(100),
    supabase.from('project_membership').select('user_id').eq('project_id', issue.project_id).eq('status', 'active').is('revoked_at', null).limit(200),
  ])
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
  )
  const assignees = (projectMembers.data ?? []).map((member) => ({
    id: member.user_id,
    name: names.get(member.user_id) || 'Thành viên',
  }))
  const project = Array.isArray(issue.project_project)
    ? issue.project_project[0]
    : issue.project_project
  const formattedComments = await Promise.all(
    (comments.data ?? []).map(async (comment) => {
      const paths = comment.attachment_paths ?? []
      const { data: signed } = paths.length
        ? await supabase.storage
            .from('issue-attachments')
            .createSignedUrls(paths, 3600)
        : { data: [] }
      return {
        ...comment,
        author: names.get(comment.created_by) || 'Thành viên',
        attachments: (signed ?? []).flatMap((file, index) =>
          file.signedUrl
            ? [{ name: paths[index].split('/').at(-1)?.replace(/^[0-9a-f-]{36}-/, '') || 'Tệp đính kèm', url: file.signedUrl }]
            : [],
        ),
      }
    }),
  )
  const formattedLogs = (logs.data ?? []).map((log) => ({
    ...log,
    author:
      (Array.isArray(log.hr_employee) ? log.hr_employee[0] : log.hr_employee)
        ?.full_name || 'Nhân sự',
  }))
  return (
    <div className="page">
      <Topbar title="Ticket" subtitle={project?.name} />
      <main id="main-content" className="page-content">
        <QueryNotice
          failed={[comments, logs, profiles].some((result) => !!result.error)}
        />
        <IssueDetailClient
          issue={{ ...issue, project_project: project }}
          comments={formattedComments}
          logs={formattedLogs}
          assignee={names.get(issue.assignee_id) || null}
          reporter={names.get(issue.reporter_id) || null}
          assignees={assignees}
        />
      </main>
    </div>
  )
}
