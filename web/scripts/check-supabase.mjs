import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const nextRequire = createRequire(require.resolve('next/package.json'))
nextRequire('@next/env').loadEnvConfig(
  fileURLToPath(new URL('../', import.meta.url)),
  true,
)

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const tables = [
  'core_user_profile',
  'core_role_assignment',
  'project_membership',
  'hr_employee',
  'hr_contract',
  'hr_skill',
  'hr_employee_rate',
  'hr_leave_type',
  'hr_leave_balance',
  'hr_leave_request',
  'project_client',
  'project_proposal',
  'project_project',
  'project_milestone',
  'work_issue',
  'work_issue_with_sla',
  'work_issue_comment',
  'work_worklog',
  'work_timesheet',
  'core_notification',
  'audit_log',
  'dashboard_project_health',
  'dashboard_team_utilization',
]

async function main() {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(
      'Điền Project URL vào NEXT_PUBLIC_SUPABASE_URL trong .env.local.',
    )
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (process.argv.includes('--cloud') && local) {
    throw new Error(
      'URL đang trỏ tới localhost. Điền Project URL Supabase Cloud từ nút Connect.',
    )
  }
  if (
    (!local && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Dùng Project URL gốc của Data API, không dùng URL trang Dashboard hoặc URL có mật khẩu.',
    )
  }
  if (!key || /your-|YOUR_|<|>/.test(key)) {
    throw new Error(
      'Điền publishable key vào NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY hoặc anon key vào NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }
  let legacyRole
  if (key.split('.').length === 3) {
    try {
      legacyRole = JSON.parse(
        Buffer.from(key.split('.')[1], 'base64url').toString(),
      ).role
    } catch {}
  }
  if (key.startsWith('sb_secret_') || legacyRole === 'service_role') {
    throw new Error(
      'Cấu hình NEXT_PUBLIC_SUPABASE_* cần publishable/anon key, không dùng key quản trị.',
    )
  }
  console.log(`Kiểm tra Supabase ${local ? 'local' : 'Cloud'}: ${url.origin}`)
  const request = (path) =>
    fetch(new URL(path, url), {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    })
  const auth = await request('/auth/v1/settings')
  if (!auth.ok) {
    throw new Error(
      `Auth trả HTTP ${auth.status}. Kiểm tra Project URL và public API key có cùng project.`,
    )
  }
  const settings = await auth.json()
  console.log('OK: kết nối và API key được Auth chấp nhận.')
  if (!settings.external?.email) {
    console.log(
      'CẦN CẤU HÌNH: bật Email provider trong Supabase Authentication để đăng nhập email/mật khẩu.',
    )
    process.exitCode = 1
  } else console.log('OK: Email provider đang bật.')

  // Only metadata checks with limit=0. Never invoke mutation RPCs or read rows.
  const results = await Promise.allSettled(
    tables.map(async (table) => {
      const response = await request(`/rest/v1/${table}?select=*&limit=0`)
      if (response.ok) return { table, state: 'ok' }
      const body = await response.json().catch(() => ({}))
      if (['PGRST205', '42P01'].includes(body.code))
        return { table, state: 'missing' }
      if ([401, 403].includes(response.status) || body.code === '42501')
        return { table, state: 'restricted' }
      return { table, state: 'error', status: response.status, code: body.code }
    }),
  )
  let missing = 0,
    restricted = 0,
    errors = 0
  results.forEach((result, index) => {
    const table = tables[index]
    if (result.status === 'rejected') {
      errors++
      console.log(`LỖI KẾT NỐI: ${table}`)
    } else if (result.value.state === 'missing') {
      missing++
      console.log(`THIẾU/CHƯA EXPOSE: ${table}`)
    } else if (result.value.state === 'restricted') {
      restricted++
      console.log(`CẦN ĐĂNG NHẬP ĐỂ XÁC MINH: ${table}`)
    } else if (result.value.state === 'error') {
      errors++
      console.log(
        `LỖI: ${table} · HTTP ${result.value.status} · ${result.value.code || 'không có mã lỗi'}`,
      )
    }
  })
  const available = tables.length - missing - restricted - errors
  console.log(
    `Data API: ${available}/${tables.length} bảng/view xác minh được; ${missing} thiếu/chưa expose; ${restricted} cần đăng nhập; ${errors} lỗi.`,
  )
  if (missing || errors) process.exitCode = 1
  console.log(
    'Kiểm tra này không xác minh RLS theo user, RPC duyệt/khóa, tài khoản đăng nhập hoặc Storage policy.',
  )
}

main().catch((error) => {
  // Do not print headers, API keys, database passwords, or response bodies.
  const message =
    error instanceof Error && error.message !== 'fetch failed'
      ? error.message
      : `Không kết nối được Supabase (${error.cause?.code || error.name || 'network error'}).`
  console.error(message)
  process.exitCode = 1
})
