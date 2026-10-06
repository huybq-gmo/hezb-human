import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, searchPattern, textParam, uuidParam, type SearchValues } from '@/lib/list-query'
import { ClientManagementClient } from './_components/ClientManagementClient'

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const params = await searchParams
  const page = pageNumber(params.page)
  const contactPage = pageNumber(params.contactPage)
  const query = textParam(params.q).slice(0, 100)
  const supabase = await createClient()
  let request = supabase.from('project_client').select('*', { count: 'exact' }).order('name').order('id')
  if (query.trim()) request = request.ilike('name', searchPattern(query))
  const clients = await request.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  const selectedId = uuidParam(params.client) || clients.data?.[0]?.id
  const selected = selectedId ? await supabase.from('project_client').select('*').eq('id', selectedId).maybeSingle()
    : { data: null, error: null }
  const contacts = selected.data ? await supabase.from('project_client_contact').select('*', { count: 'exact' })
    .eq('client_id', selected.data.id).order('is_primary', { ascending: false }).order('full_name').order('id')
    .range((contactPage - 1) * PAGE_SIZE, contactPage * PAGE_SIZE - 1)
    : { data: [], error: null, count: 0 }
  return <div className="page">
    <Topbar title="Khách hàng & liên hệ" subtitle="Hồ sơ khách hàng và người liên hệ chính" />
    <main id="main-content" className="page-content">
      <QueryNotice failed={[clients, selected, contacts].some((result) => !!result.error)} />
      <form className="toolbar" method="get"><input name="q" aria-label="Tìm khách hàng" placeholder="Tìm khách hàng…" defaultValue={query} /><button type="submit" className="btn sm ghost">Tìm</button></form>
      <ClientManagementClient key={`${selectedId}:${page}`} clients={clients.data ?? []} selected={selected.data} contacts={contacts.data ?? []} />
      <Pagination page={page} total={clients.count ?? 0} />
      {!!contacts.count && <Pagination page={contactPage} total={contacts.count} parameter="contactPage" />}
    </main>
  </div>
}
