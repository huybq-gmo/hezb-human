import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { EmployeeListClient } from './_components/EmployeeListClient'

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(pageParam)) || 1))
  const supabase = await createClient()
  const { data, error, count } = await supabase
    .from('hr_employee')
    .select('id,user_id,employee_code,full_name,email,phone,type,status,hire_date,terminate_date,created_at,created_by,updated_at,updated_by,version', { count: 'exact' })
    .order('full_name')
    .range((page - 1) * 50, page * 50 - 1)
  return (
    <div className="page">
      <Topbar title="Nhân sự" subtitle="Hồ sơ, hợp đồng và vòng đời nhân sự" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={!!error} />
        <EmployeeListClient
          initialData={data ?? []}
          total={count ?? 0}
          page={page}
        />
      </main>
    </div>
  )
}
