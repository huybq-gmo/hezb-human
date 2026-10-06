import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { PayrollClient } from './_components/PayrollClient'

export default async function PayrollPage() {
  const user = await getWorkspaceUser()
  if (!user?.roles.some((role) => ['company_owner', 'finance_admin', 'hr_admin'].includes(role))) redirect('/dashboard')

  const supabase = await createClient()
  const { data: periods, error } = await supabase
    .from('finance_payroll_period')
    .select('id,month,year,status,opened_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(60)

  return (
    <div className="page">
      <Topbar title="Bảng lương" subtitle="Mở kỳ và xuất giờ công đã được duyệt" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={!!error} />
        <PayrollClient periods={periods ?? []} />
      </main>
    </div>
  )
}
