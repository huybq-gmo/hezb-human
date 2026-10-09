import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { notFound } from 'next/navigation'
import { getWorkspaceUser } from '@/lib/workspace'
import { EmployeeDetailClient } from './_components/EmployeeDetailClient'

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getWorkspaceUser()
  const { data: employee, error } = await supabase
    .from('hr_employee')
    .select('id,user_id,employee_code,full_name,email,phone,type,status,hire_date,terminate_date,created_at,created_by,updated_at,updated_by,version')
    .eq('id', id)
    .maybeSingle()
  if (!employee && !error) notFound()
  if (!employee)
    return (
      <div className="page">
        <Topbar title="Hồ sơ nhân sự" />
        <main id="main-content" className="page-content">
          <QueryNotice failed />
        </main>
      </div>
    )
  const roles = currentUser?.roles ?? []
  const canReadContracts = roles.some((role) =>
    ['company_owner', 'hr_admin', 'finance_admin'].includes(role),
  )
  const canReadRates = canReadContracts
  const canReadLeaveBalances =
    roles.some((role) => ['company_owner', 'hr_admin'].includes(role)) ||
    employee.user_id === currentUser?.id
  const skippedQuery = { data: [] as never[], error: null }
  const [contracts, rates, balances, skills, leaveTypes] = await Promise.all([
    canReadContracts
      ? supabase
          .from('hr_contract')
          .select('*')
          .eq('employee_id', id)
          .order('start_date', { ascending: false })
          .limit(100)
      : skippedQuery,
    canReadRates
      ? supabase
          .from('hr_employee_rate')
          .select('*')
          .eq('employee_id', id)
          .order('effective_from', { ascending: false })
          .limit(100)
      : skippedQuery,
    canReadLeaveBalances
      ? supabase
          .from('hr_leave_balance')
          .select('*, hr_leave_type(name, code)')
          .eq('employee_id', id)
          .eq('year', new Date().getFullYear())
          .limit(100)
      : skippedQuery,
    supabase
      .from('hr_skill')
      .select('*')
      .eq('employee_id', id)
      .order('skill_name')
      .limit(100),
    supabase
      .from('hr_leave_type')
      .select('id, name, default_days_per_year')
      .order('name')
      .limit(100),
  ])
  return (
    <div className="page">
      <Topbar
        title={employee.full_name || 'Hồ sơ nhân sự'}
        subtitle={employee.employee_code || 'Thông tin nhân sự'}
      />
      <main id="main-content" className="page-content">
        <QueryNotice
          failed={[contracts, rates, balances, skills, leaveTypes].some(
            (result) => !!result.error,
          )}
        />
        <EmployeeDetailClient
          employee={employee}
          contracts={contracts.data ?? []}
          rates={rates.data ?? []}
          leaveBalances={balances.data ?? []}
          leaveTypes={leaveTypes.data ?? []}
          skills={skills.data ?? []}
        />
      </main>
    </div>
  )
}
