import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { HrTeamsClient } from './_components/HrTeamsClient'
import { SkillMatrix, type SkillMatrixRow } from './_components/SkillMatrix'
import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, uuidParam, type SearchValues } from '@/lib/list-query'

export default async function HrTeamsPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const params = await searchParams
  const matrixPage = pageNumber(params.matrixPage)
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
  const teamId = uuidParam(params.team) || teams.data?.find((team) => team.is_active)?.id || ''
  const matrix = teamId ? await supabase.from('hr_team_skill_matrix').select('*', { count: 'exact' }).eq('team_id', teamId)
    .order('full_name').order('employee_id').range((matrixPage - 1) * PAGE_SIZE, matrixPage * PAGE_SIZE - 1)
    : { data: [], error: null, count: 0 }
  return (
    <div className="page">
      <Topbar title="Nhóm nhân sự" subtitle="Quản lý team và trưởng nhóm nội bộ" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={[teams, memberships, employees, matrix].some((result) => !!result.error)} />
        <HrTeamsClient teams={teams.data ?? []} memberships={normalized} employees={employees.data ?? []} />
        <form method="get" className="toolbar">
          <label htmlFor="matrix-team">Skill Matrix theo nhóm</label>
          <select id="matrix-team" name="team" defaultValue={teamId}>{(teams.data ?? []).filter((team) => team.is_active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          <button type="submit" className="btn sm ghost">Xem kỹ năng</button>
        </form>
        <SkillMatrix rows={(matrix.data ?? []) as SkillMatrixRow[]} />
        {!!matrix.count && <Pagination page={matrixPage} total={matrix.count} parameter="matrixPage" />}
      </main>
    </div>
  )
}
