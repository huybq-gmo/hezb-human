import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { HexagonAvatar } from '@/components/HezbLogo'
import { Card, EmptyState, QueryNotice, SearchField } from '@/components/ui'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q: value } = await searchParams
  const q = (value || '').trim().slice(0, 100)
  const supabase = await createClient()
  const escaped = q.replace(/[\\%_]/g, '\\$&')
  const results = q
    ? await Promise.all([
        supabase
          .from('hr_employee')
          .select('id, full_name, employee_code')
          .ilike('full_name', `%${escaped}%`)
          .order('full_name')
          .limit(20),
        supabase
          .from('project_project')
          .select('id, name, code')
          .ilike('name', `%${escaped}%`)
          .order('name')
          .limit(20),
        supabase
          .from('work_issue')
          .select('id, title, type')
          .ilike('title', `%${escaped}%`)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
    : []
  const titles = ['Nhân sự', 'Dự án', 'Ticket']
  const routes = ['hr/employees', 'projects', 'issues']
  return (
    <div className="page">
      <Topbar
        title="Tìm kiếm"
        subtitle="Tìm nhân sự, dự án và ticket trong phạm vi được cấp quyền"
      />
      <main id="main-content" className="page-content">
        <form className="toolbar" action="/dashboard/search" role="search">
          <SearchField
            name="q"
            placeholder="Nhập tên hoặc tiêu đề…"
            defaultValue={q}
            required
          />
          <button className="btn sm" type="submit">
            Tìm kiếm
          </button>
        </form>
        <QueryNotice failed={results.some((result) => !!result.error)} />
        {!q ? (
          <Card>
            <EmptyState
              title="Bạn muốn tìm gì?"
              description="Nhập tên nhân sự, dự án hoặc tiêu đề ticket."
            />
          </Card>
        ) : (
          results.map((result, index) => (
            <Card
              key={titles[index]}
              title={titles[index]}
              action={
                <span className="muted">
                  {result.data?.length ?? 0} kết quả
                </span>
              }
            >
              {!result.data?.length ? (
                <EmptyState title="Không có kết quả phù hợp" />
              ) : (
                <div className="card-body stack">
                  {result.data.map((item) => {
                    const row = item as {
                      id: string
                      full_name?: string
                      name?: string
                      title?: string
                      code?: string
                      employee_code?: string
                    }
                    const label = row.full_name || row.name || row.title || '—'
                    return (
                      <Link
                        key={row.id}
                        href={`/dashboard/${routes[index]}/${row.id}`}
                        className="who hover:text-[var(--pri)]"
                      >
                        {index === 0 && <HexagonAvatar name={label} />}
                        <div>
                          <p className="font-medium">{label}</p>
                          <small>
                            {row.code || row.employee_code}
                          </small>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </Card>
          ))
        )}
      </main>
    </div>
  )
}
