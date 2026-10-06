import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { LeaveManagementClient } from './_components/LeaveManagementClient'

export default async function LeaveManagementPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch leave requests
  const { data: requests, error: requestError } = await supabase
    .from('hr_leave_request')
    .select(
      `
      id,
      employee_id,
      leave_type_id,
      start_date,
      end_date,
      days_requested,
      reason,
      status,
      created_by,
      approved_by,
      approved_at,
      created_at,
      hr_employee:employee_id (full_name),
      hr_leave_type:leave_type_id (name, code)
    `,
    )
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch leave types for creating requests
  const { data: leaveTypes, error: typeError } = await supabase
    .from('hr_leave_type')
    .select('id, name, code, default_days_per_year')
    .limit(100)

  // Fetch current user's employee record if any
  const { data: currentEmployee } = await supabase
    .from('hr_employee')
    .select('id, full_name')
    .eq('user_id', user?.id || '')
    .maybeSingle()

  const formattedRequests = (requests ?? []).map((r) => ({
    ...r,
    hr_employee: Array.isArray(r.hr_employee)
      ? r.hr_employee[0]
      : r.hr_employee,
    hr_leave_type: Array.isArray(r.hr_leave_type)
      ? r.hr_leave_type[0]
      : r.hr_leave_type,
  }))

  return (
    <div className="page">
      <Topbar
        title="Nghỉ phép"
        subtitle="Duyệt đơn nghỉ phép và theo dõi ngày nghỉ"
      />
      <main id="main-content" className="page-content">
        <QueryNotice failed={!!requestError || !!typeError} />
        <LeaveManagementClient
          currentUserId={user?.id || ''}
          currentEmployee={currentEmployee}
          leaveTypes={leaveTypes ?? []}
          initialRequests={formattedRequests}
        />
      </main>
    </div>
  )
}
