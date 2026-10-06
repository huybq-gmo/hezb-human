import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceUser } from '@/lib/workspace'
import { Topbar } from '@/components/layout/Topbar'
import { QueryNotice } from '@/components/ui'
import { InvoiceManagementClient } from './_components/InvoiceManagementClient'

export default async function InvoicesPage() {
  const user = await getWorkspaceUser()
  if (!user?.roles.some((role) => ['company_owner','finance_admin','director','auditor'].includes(role))) redirect('/dashboard')
  const supabase = await createClient()
  const [invoices, projects, lines, payments] = await Promise.all([
    supabase.from('finance_invoice').select('*, project_project:project_id(name,code), project_client:client_id(name)').order('created_at',{ascending:false}).limit(100),
    supabase.from('project_project').select('id,name,budget_currency').order('name').limit(100),
    supabase.from('finance_invoice_line').select('*').limit(1000),
    supabase.from('finance_payment').select('*').order('payment_date',{ascending:false}).limit(1000),
  ])
  const normalized = (invoices.data ?? []).map((invoice) => ({
    ...invoice,
    project_project: Array.isArray(invoice.project_project) ? invoice.project_project[0] : invoice.project_project,
    project_client: Array.isArray(invoice.project_client) ? invoice.project_client[0] : invoice.project_client,
  }))
  return (
    <div className="page">
      <Topbar title="Hóa đơn" subtitle="Phát hành và đối soát hóa đơn dự án" />
      <main id="main-content" className="page-content">
        <QueryNotice failed={[invoices,projects,lines,payments].some((result) => !!result.error)} />
        <InvoiceManagementClient
          userId={user.id}
          roles={user.roles}
          invoices={normalized}
          projects={projects.data ?? []}
          lines={lines.data ?? []}
          payments={payments.data ?? []}
        />
      </main>
    </div>
  )
}
