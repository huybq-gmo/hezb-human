import { createClient } from 'npm:@supabase/supabase-js@2'
import { groupUnsubmitted, unsubmittedReminder } from './unsubmitted.mjs'

type Reminder = {
  type: 'issue_overdue' | 'timesheet_pending' | 'timesheet_unsubmitted'
  entityId: string
  recipientId: string
  email: string
  subject: string
  message: string
  link: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function hcmDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function clean(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
}

async function main(req: Request) {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const cronSecret = Deno.env.get('REMINDER_CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'UNAUTHORIZED' }, 401)

  let dryRun = false
  try {
    const body = await req.json()
    if (body?.dry_run !== undefined && typeof body.dry_run !== 'boolean') return json({ error: 'INVALID_REQUEST' }, 400)
    dryRun = body?.dry_run === true
  } catch {
    return json({ error: 'INVALID_REQUEST' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? secretKeys.default
  if (!url || !serviceKey) return json({ error: 'SERVER_CONFIGURATION' }, 500)
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const today = hcmDate()
  const reminders: Reminder[] = []
  const userCache = new Map<string, string | null>()

  async function emailFor(userId: string) {
    if (userCache.has(userId)) return userCache.get(userId) ?? null
    const { data: profile, error: profileError } = await supabase
      .from('core_user_profile')
      .select('is_active')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) throw new Error('PROFILE_LOOKUP_FAILED')
    if (!profile?.is_active) {
      userCache.set(userId, null)
      return null
    }
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    let email = error ? null : data.user?.email?.trim() || null
    if (!email) {
      const { data: employee, error: employeeError } = await supabase
        .from('hr_employee')
        .select('email')
        .eq('user_id', userId)
        .maybeSingle()
      if (employeeError) throw new Error('EMPLOYEE_LOOKUP_FAILED')
      email = employee?.email?.trim() || null
    }
    userCache.set(userId, email)
    return email
  }

  const { data: issues, error: issueError } = await supabase
    .from('work_issue')
    .select('id,title,assignee_id,due_date,project_project:project_id(name)')
    .lt('due_date', today)
    .not('status', 'in', '(done,cancelled)')
    .not('assignee_id', 'is', null)
    .limit(500)
  if (issueError) return json({ error: 'ISSUE_QUERY_FAILED' }, 500)

  for (const issue of issues ?? []) {
    if (!issue.assignee_id) continue
    const email = await emailFor(issue.assignee_id)
    if (!email) continue
    const project = one(issue.project_project as { name: string } | { name: string }[] | null)
    reminders.push({
      type: 'issue_overdue', entityId: issue.id, recipientId: issue.assignee_id, email,
      subject: `Ticket quá hạn: ${clean(issue.title)}`,
      message: `Ticket “${clean(issue.title)}”${project?.name ? ` trong dự án ${clean(project.name)}` : ''} đã quá hạn từ ${issue.due_date}. Vui lòng cập nhật trạng thái hoặc ngày dự kiến.`,
      link: `/dashboard/issues/${issue.id}`,
    })
  }

  const { data: timesheets, error: timesheetError } = await supabase
    .from('work_timesheet')
    .select('id,status,created_by,project_id,period_start,period_end,hr_employee:employee_id(full_name),project_project:project_id(name)')
    .in('status', ['submitted', 'leader_approved'])
    .limit(500)
  if (timesheetError) return json({ error: 'TIMESHEET_QUERY_FAILED' }, 500)

  for (const sheet of timesheets ?? []) {
    const step = sheet.status === 'submitted' ? 'leader' : 'pm'
    const projectRole = step === 'leader' ? 'team_leader' : 'pm'
    const { data: memberships, error: membershipError } = await supabase
      .from('project_membership')
      .select('user_id')
      .eq('project_id', sheet.project_id)
      .eq('project_role', projectRole)
      .eq('status', 'active')
      .is('revoked_at', null)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
    if (membershipError) return json({ error: 'REVIEWER_QUERY_FAILED' }, 500)

    let approverIds = [...new Set((memberships ?? []).map((membership) => membership.user_id))]
      .filter((userId) => userId !== sheet.created_by)
    if (!approverIds.length) {
      const roles = step === 'leader' ? ['company_owner', 'hr_admin'] : ['company_owner']
      const { data: assignments, error: roleError } = await supabase
        .from('core_role_assignment')
        .select('user_id')
        .in('role', roles)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      if (roleError) return json({ error: 'REVIEWER_QUERY_FAILED' }, 500)
      approverIds = [...new Set((assignments ?? []).map((assignment) => assignment.user_id))]
        .filter((userId) => userId !== sheet.created_by)
    }

    const employee = one(sheet.hr_employee as { full_name: string } | { full_name: string }[] | null)
    const project = one(sheet.project_project as { name: string } | { name: string }[] | null)
    for (const recipientId of approverIds) {
      const email = await emailFor(recipientId)
      if (!email) continue
      const employeeName = clean(employee?.full_name || 'Nhân viên')
      reminders.push({
        type: 'timesheet_pending', entityId: sheet.id, recipientId, email,
        subject: 'Timesheet đang chờ bạn duyệt',
        message: `Timesheet của ${employeeName}${project?.name ? ` trong dự án ${clean(project.name)}` : ''}, kỳ ${sheet.period_start} đến ${sheet.period_end}, đang chờ ${step === 'leader' ? 'Leader' : 'PM'} duyệt.`,
        link: '/dashboard/worklogs?tab=approval',
      })
    }
  }

  const missingRows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('get_unsubmitted_timesheet_reminders', {
      p_today: today, p_offset: offset, p_limit: 500,
    })
    if (error) return json({ error: 'UNSUBMITTED_QUERY_FAILED' }, 500)
    missingRows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  for (const group of groupUnsubmitted(missingRows)) {
    const email = await emailFor(group.recipientId)
    if (email) reminders.push(unsubmittedReminder(group, email) as Reminder)
  }
  const unique = [...new Map(reminders.map((item) => [`${item.type}:${item.entityId}:${item.recipientId}`, item])).values()]
  const totals = {
    issues: unique.filter((item) => item.type === 'issue_overdue').length,
    timesheets: unique.filter((item) => item.type === 'timesheet_pending').length,
    unsubmitted: unique.filter((item) => item.type === 'timesheet_unsubmitted').length,
  }
  if (dryRun) return json({ dry_run: true, reminder_date: today, candidates: unique.length, totals })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_REMINDER_FROM')
  const appUrl = Deno.env.get('ERP_BASE_URL')?.replace(/\/+$/, '')
  if (!resendKey || !from || !appUrl) return json({ error: 'EMAIL_CONFIGURATION' }, 500)

  let sent = 0
  let failed = 0
  let skipped = 0
  async function deliver(reminder: Reminder): Promise<'sent' | 'failed' | 'skipped'> {
    const { data: claimId, error: claimError } = await supabase.rpc('claim_email_reminder', {
      p_type: reminder.type, p_entity_id: reminder.entityId, p_recipient_id: reminder.recipientId, p_reminder_date: today,
    })
    if (claimError) throw new Error('CLAIM_FAILED')
    if (!claimId) return 'skipped'

    let responseStatus = 0
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from, to: [reminder.email], subject: reminder.subject,
          text: `${reminder.message}\n\n${appUrl}${reminder.link}`,
          html: `<p>${reminder.message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p><p><a href="${appUrl}${reminder.link}">Mở Hezb ERP</a></p>`,
        }),
      })
      responseStatus = response.status
      if (!response.ok) throw new Error('EMAIL_PROVIDER_REJECTED')
      const provider = await response.json().catch(() => ({}))
      const { error: updateError } = await supabase.from('core_email_reminder_log').update({
        status: 'sent', sent_at: new Date().toISOString(), provider_message_id: typeof provider.id === 'string' ? provider.id.slice(0, 180) : null,
        error_code: null, updated_at: new Date().toISOString(),
      }).eq('id', claimId)
      if (updateError) throw new Error('REMINDER_LOG_UPDATE_FAILED')
      return 'sent'
    } catch {
      await supabase.from('core_email_reminder_log').update({
        status: 'failed', error_code: responseStatus ? `provider_${responseStatus}` : 'delivery_failed', updated_at: new Date().toISOString(),
      }).eq('id', claimId)
      return 'failed'
    }
  }
  for (let offset = 0; offset < unique.length; offset += 10) {
    const results = await Promise.all(unique.slice(offset, offset + 10).map(deliver))
    sent += results.filter((result) => result === 'sent').length
    failed += results.filter((result) => result === 'failed').length
    skipped += results.filter((result) => result === 'skipped').length
  }
  return json({ dry_run: false, reminder_date: today, candidates: unique.length, sent, failed, skipped, totals })
}

Deno.serve((request) => main(request).catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'REMINDER_RUN_FAILED'
  return json({ error: code }, 500)
}))
