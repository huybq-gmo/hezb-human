import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { InvoiceManagementClient } from './_components/InvoiceManagementClient'
import { Pagination } from '@/components/Pagination'
import { PAGE_SIZE, pageNumber, searchPattern, textParam, uuidParam, type SearchValues } from '@/lib/list-query'

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const params = await searchParams
  const page = pageNumber(params.page)
  const linePage = pageNumber(params.linePage)
  const paymentPage = pageNumber(params.paymentPage)
  const query = textParam(params.q).slice(0, 100)
  const user = await getWorkspaceUser()
  if (!user?.roles.some((role) => ['company_owner','finance_admin','director','auditor'].includes(role))) redirect('/dashboard')
  const supabase = await createClient()
  let invoiceQuery = supabase.from('finance_invoice').select('*, project_project:project_id(name,code), project_client:client_id(name)', { count: 'exact' }).order('created_at',{ascending:false}).order('id')
  if (query.trim()) invoiceQuery = invoiceQuery.ilike('invoice_number',searchPattern(query))
  const [invoices, projects] = await Promise.all([
    invoiceQuery.range((page - 1) * PAGE_SIZE,page * PAGE_SIZE - 1),
    supabase.from('project_project').select('id,name,budget_currency').order('name').limit(1000),
  ])
  const selectedId = uuidParam(params.invoice) || invoices.data?.[0]?.id
  const selected = selectedId ? await supabase.from('finance_invoice').select('*, project_project:project_id(name,code), project_client:client_id(name)').eq('id',selectedId).maybeSingle()
    : { data: null, error: null }
  const [lines,payments,summary] = selected.data ? await Promise.all([
    supabase.from('finance_invoice_line').select('*', { count: 'exact' }).eq('invoice_id',selected.data.id).order('id').range((linePage - 1) * PAGE_SIZE,linePage * PAGE_SIZE - 1),
    supabase.from('finance_payment').select('*', { count: 'exact' }).eq('invoice_id',selected.data.id).order('payment_date',{ascending:false}).order('id').range((paymentPage - 1) * PAGE_SIZE,paymentPage * PAGE_SIZE - 1),
    supabase.from('finance_invoice_payment_summary').select('*').eq('invoice_id',selected.data.id).maybeSingle(),
  ]) : [{ data: [],error: null,count: 0 },{ data: [],error: null,count: 0 },{ data: null,error: null }]
  const normalized = (invoices.data ?? []).map((invoice) => ({
    ...invoice,
    project_project: Array.isArray(invoice.project_project) ? invoice.project_project[0] : invoice.project_project,
    project_client: Array.isArray(invoice.project_client) ? invoice.project_client[0] : invoice.project_client,
  }))
  return (
    <div className="page">
      <Topbar title="Hóa đơn" subtitle="Phát hành và đối soát hóa đơn dự án" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={[invoices,projects,selected,lines,payments,summary].some((result) => !!result.error)} />
        <form method="get" className="toolbar"><input name="q" defaultValue={query} aria-label="Tìm số hóa đơn" placeholder="Tìm số hóa đơn…" /><button type="submit" className="btn sm ghost">Tìm</button></form>
        <InvoiceManagementClient
          key={`${selectedId}:${page}`}
          userId={user.id}
          roles={user.roles}
          invoices={normalized}
          projects={projects.data ?? []}
          lines={lines.data ?? []}
          payments={payments.data ?? []}
          selectedInvoice={selected.data ? { ...selected.data,
            project_project: Array.isArray(selected.data.project_project) ? selected.data.project_project[0] : selected.data.project_project,
            project_client: Array.isArray(selected.data.project_client) ? selected.data.project_client[0] : selected.data.project_client,
          } : null}
          confirmedAmount={summary.data?.confirmed_amount ?? null}
          pendingAmount={summary.data?.pending_amount ?? 0}
        />
        <Pagination page={page} total={invoices.count ?? 0} />
        {!!lines.count && <><p className="muted">Chi tiết dòng hóa đơn</p><Pagination page={linePage} total={lines.count} parameter="linePage" /></>}
        {!!payments.count && <><p className="muted">Thanh toán của hóa đơn đang chọn</p><Pagination page={paymentPage} total={payments.count} parameter="paymentPage" /></>}
      </main>
    </div>
  )
}
