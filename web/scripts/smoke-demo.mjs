// Run against `node scripts/dev-demo.mjs --port 3012`; no Supabase env needed.
import assert from 'node:assert/strict'
import { createDemoData, PROJECT_ID, ISSUE_ID } from '../src/lib/demo/data.mjs'

const base = process.argv[2] || 'http://127.0.0.1:3012'
const rows = createDemoData()
const sprint = rows.work_sprint.find((sprint) => sprint.project_id === PROJECT_ID)
const cases = [
  ['/dashboard','Utilization theo nhân sự trong kỳ'],
  [`/dashboard?project=${PROJECT_ID}&start=2026-10-05&end=2026-10-11`,'Capacity tính 8h'],
  ['/dashboard/clients','Người liên hệ chính'],
  ['/dashboard/projects','Khách hàng &amp; liên hệ'],
  [`/dashboard/projects/${PROJECT_ID}`,'Backlog / chưa gán Sprint'],
  [`/dashboard/issues?project=${PROJECT_ID}&sprint=${sprint.id}`,'Lọc Sprint'],
  [`/dashboard/issues/${ISSUE_ID}`,'Epic / story và ticket con'],
  ['/dashboard/hr/teams','Skill Matrix'],
  ['/dashboard/worklogs?tab=logs','Thao tác'],
  ['/dashboard/worklogs','Tổng mỗi ngày'],
  ['/dashboard/worklogs?tab=adjustments','Duyệt &amp;'],
  ['/dashboard/hr/leave?status=pending','Phân trang'],
  ['/dashboard/admin/roles?role=developer','Phân trang'],
  [`/dashboard/admin/memberships?project=${PROJECT_ID}&status=active`,'Phân trang'],
  ['/dashboard/finance/invoices','Tìm số hóa đơn'],
]
for (const [path,expected] of cases) {
  const response = await fetch(new URL(path,base),{ headers: { cookie: 'hezb-preview=1' },signal: AbortSignal.timeout(60000) })
  const html = await response.text()
  assert.equal(response.status,200,`${path} HTTP status`)
  assert(html.includes(expected),`${path} missing expected UI: ${expected}`)
  assert(!html.includes('Không thể tải đầy đủ dữ liệu'),`${path} reports a failed data query`)
  assert(!html.includes('NEXT_HTTP_ERROR_FALLBACK;500'),`${path} server rendering error`)
  console.log(`PASS ${path}`)
}
