'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/components/layout/WorkspaceProvider'
import { NEXT_STATUSES, STATUS_LABELS } from '@/lib/presentation'

export function useIssueActions() {
  const user = useWorkspace()
  const router = useRouter()
  const supabase = createClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  function nextStatuses(issue: { project_id: string; status: string }) {
    const canWrite =
      user.hasRole('company_owner') ||
      user.hasProjectRole(
        issue.project_id,
        'pm',
        'team_leader',
        'developer',
        'qa_reviewer',
      )
    if (!canWrite) return []
    return (NEXT_STATUSES[issue.status] || []).filter((status) => {
      if (user.hasRole('company_owner')) return true
      if (status === 'cancelled' || issue.status === 'done') {
        return user.hasProjectRole(issue.project_id, 'pm', 'team_leader')
      }
      if (issue.status === 'in_review') {
        return user.hasProjectRole(
          issue.project_id,
          'pm',
          'team_leader',
          'qa_reviewer',
        )
      }
      return true
    })
  }
  async function transition(
    issue: { id: string; project_id: string; status: string },
    target: string,
  ) {
    if (busyId) return
    if (!nextStatuses(issue).includes(target)) {
      toast.error('Không thể chuyển công việc sang trạng thái này.')
      return
    }
    setBusyId(issue.id)
    try {
      let { error } = await supabase.rpc('transition_issue', {
        p_issue_id: issue.id,
        p_target_status: target,
        p_comment: null,
      })
      if (error?.code === 'PGRST202') {
        const result = await supabase.rpc('transition_issue', {
          p_issue_id: issue.id,
          p_new_status: target,
          p_reason: null,
        })
        error = result.error
      }
      if (error) {
        toast.error(
          error.message.includes('FORBIDDEN')
            ? 'Bạn không có quyền chuyển trạng thái này.'
            : 'Không thể chuyển trạng thái. Vui lòng tải lại dữ liệu.',
        )
        return
      }
      toast.success(`Đã chuyển sang ${STATUS_LABELS[target] || target}`)
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }
  return { busyId, transition, nextStatuses }
}
