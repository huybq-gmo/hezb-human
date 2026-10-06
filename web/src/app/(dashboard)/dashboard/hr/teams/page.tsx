import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { HrTeamsClient } from './_components/HrTeamsClient'

export default async function HrTeamsPage() {
  const user = await getWorkspaceUser()
  if (!user?.roles.some((role) => ['company_owner', 'hr_admin'].includes(role))) redirect('/dashboard')
  const supabase = await createClient()
  const [teams, memberships, employees] = await Promise.all([
    supabase.from('hr_team').select('*').order('name'),
    supabase.from('hr_team_membership').select('*, hr_team:team_id(name), hr_employee:employee_id(id,full_name,employee_code,status)').order('created_at', { ascending: false }).limit(500),
    supabase.from('hr_employee').select('id,full_name,employee_code,status').eq('status', 'active').order('full_name').limit(500),
  ])
  const normalized = (memberships.data ?? []).map((membership) => ({
    ...membership,
    hr_team: Array.isArray(membership.hr_team) ? membership.hr_team[0] : membership.hr_team,
    hr_employee: Array.isArray(membership.hr_employee) ? membership.hr_employee[0] : membership.hr_employee,
  }))
  return (
    <div className="page">
      <Topbar title="Nhóm nhân sự" subtitle="Quản lý team và trưởng nhóm nội bộ" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={[teams, memberships, employees].some((result) => !!result.error)} />
        <HrTeamsClient teams={teams.data ?? []} memberships={normalized} employees={employees.data ?? []} />
      </main>
    </div>
  )
}
