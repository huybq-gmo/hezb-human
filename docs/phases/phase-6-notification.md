# Phase 6: Notification & Audit UI

> **Mục tiêu phase:** Thông báo in-app real-time, audit log UI và email reminder qua Edge Function. Phase after-MVP đầu tiên.

**Dependency:** Phase 5 hoàn chỉnh (MVP done), Phase 0b (audit_log, fn_audit_log).  
**Ước lượng tổng:** 7–11 giờ.

---

## Checklist tổng quan

- [ ] 6a. Notification center in-app (Realtime)
- [ ] 6b. Audit log UI
- [ ] 6c. Email reminder (Edge Function)

---

## 6a. Notification center in-app

**Mục tiêu:** Hành động approval/deadline sinh notification cho đúng người nhận; xem và cập nhật real-time.

### Việc làm

**Migration `supabase migration new core_notification`:**
```sql
create type notification_type as enum (
  'timesheet_submitted',
  'timesheet_leader_approved',
  'timesheet_pm_approved',
  'timesheet_rejected',
  'timesheet_locked',
  'issue_assigned',
  'issue_overdue',
  'leave_approved',
  'leave_rejected',
  'allocation_approved'
);

create table core_notification (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users on delete cascade,
  type         notification_type not null,
  title        text not null,
  body         text,
  link         text, -- relative URL, e.g. '/timesheet/abc'
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  dedupe_key   text unique -- chống duplicate notification
);

alter table core_notification enable row level security;

-- Chỉ recipient xem notification của mình
create policy "recipient_read_notification" on core_notification for select
  using (recipient_id = auth.uid());

create policy "recipient_mark_read" on core_notification for update
  using (recipient_id = auth.uid());

-- Không ai INSERT trực tiếp — chỉ qua trigger
create policy "no_direct_insert_notification" on core_notification for insert
  with check (false);
```

**Triggers gửi notification (thêm vào RPC đã có):**
```sql
-- Helper function gửi notification
create or replace function fn_notify(
  p_recipient_id  uuid,
  p_type          notification_type,
  p_title         text,
  p_body          text,
  p_link          text,
  p_dedupe_key    text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into core_notification(recipient_id, type, title, body, link, dedupe_key)
  values (p_recipient_id, p_type, p_title, p_body, p_link, p_dedupe_key)
  on conflict (dedupe_key) do nothing; -- idempotent
end;
$$;
```

**Bổ sung notification call vào các RPC hiện có (migration update):**
```sql
-- Sau submit_timesheet → notify team_leader
-- Sau approve_timesheet_step('leader') → notify pm
-- Sau approve_timesheet_step('pm') → notify employee
-- Sau reject_timesheet → notify employee
-- Sau approve_leave → notify employee

-- Ví dụ thêm vào cuối function submit_timesheet:
-- select fn_notify(leader_user_id, 'timesheet_submitted', 'Timesheet cần review',
--   e.full_name || ' đã submit timesheet kỳ ' || period_start,
--   '/timesheet/' || v_timesheet_id,
--   'ts_submit_' || v_timesheet_id);
```

**Supabase Realtime:**
- [ ] Enable Realtime trên bảng `core_notification` trong Dashboard → Database → Replication.
- [ ] Frontend subscribe: `supabase.channel('notifications').on('postgres_changes', { table: 'core_notification', filter: 'recipient_id=eq.' + userId }, callback)`.

**pgTAP test `tests/notification.sql`:**
- [ ] `fn_notify()` với cùng `dedupe_key` → chỉ tạo 1 notification.
- [ ] INSERT trực tiếp vào `core_notification` → bị RLS chặn.
- [ ] User A SELECT notification của user B → 0 rows.

**Frontend:**
- [ ] Bell icon trong navbar với badge số unread.
- [ ] Dropdown notification list: title, body, thời gian relative, link.
- [ ] Click notification → mark as read; link đến trang liên quan.
- [ ] "Mark all as read" button.

### Definition of Done

- [ ] Submit timesheet → notification xuất hiện real-time cho leader (không cần refresh).
- [ ] Submit 2 lần cùng dedupe_key → chỉ 1 notification.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `core_notification` | Table |
| `fn_notify()` | Helper function |
| Realtime channel `notifications` | Supabase Realtime |

### Ước lượng: 3–4 giờ

---

## 6b. Audit log UI

**Mục tiêu:** `auditor` và `company_owner` tra cứu audit log theo actor, resource, action, thời gian.

### Việc làm

**Không cần migration mới** — `audit_log` đã có từ Phase 0b.

**Frontend trang `/admin/audit`:**
- [ ] Filter: `actor_id` (chọn user), `table_name` (dropdown: work_timesheet, hr_employee, ...), `action` (text search), `occurred_at` (date range).
- [ ] Bảng: actor name, table, record_id, action, before/after (collapsible JSON), occurred_at.
- [ ] Pagination: 50 per page.
- [ ] RLS: chỉ `auditor`, `company_owner` xem được (`auth.jwt() ->> 'role' in ('auditor', 'company_owner')`).

**Frontend guard:**
```typescript
// src/app/(dashboard)/admin/audit/page.tsx
// Kiểm tra role trước khi render
if (!['company_owner', 'auditor'].includes(userRole)) {
  redirect('/403');
}
```

**pgTAP test (đã có từ 0b) — bổ sung:**
- [ ] `auditor` SELECT `audit_log` → thấy records.
- [ ] `developer` SELECT `audit_log` → 0 rows.

### Definition of Done

- [ ] Tra cứu được audit log của một thay đổi timesheet cụ thể.
- [ ] `developer` vào `/admin/audit` → redirect 403.
- [ ] Pagination hoạt động đúng.

### Ước lượng: 2–3 giờ

---

## 6c. Email reminder (Edge Function)

**Mục tiêu:** Gửi email nhắc issue quá hạn, timesheet chưa submit cuối kỳ.

> **Edge Function dùng Resend API.** Cần kiểm tra tài liệu Supabase hiện tại về cách setup Scheduled Functions (pg_cron extension hoặc Supabase Cron Jobs — tính năng có thể thay đổi theo plan).

### Việc làm

**Cài đặt môi trường:**
- [ ] Đăng ký Resend, lấy API key.
- [ ] Trong Supabase Dashboard → Edge Functions → Secrets → thêm `RESEND_API_KEY`.

**Tạo Edge Function `supabase/functions/send-reminders/index.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // bypass RLS để đọc dữ liệu
);

Deno.serve(async (_req) => {
  // 1. Lấy issue overdue (chưa done, due_date < today)
  const { data: overdueIssues } = await supabase
    .from('work_issue_with_sla')
    .select('id, title, assignee_id, project_id')
    .eq('is_overdue', true)
    .neq('status', 'done');

  // 2. Lấy employee chưa submit timesheet trong kỳ hiện tại
  // (logic: employee active, không có timesheet submitted trong 7 ngày qua)

  // 3. Gửi email qua Resend (hoặc log nếu là dry run)
  const isDryRun = Deno.env.get('DRY_RUN') === 'true';
  
  for (const issue of overdueIssues ?? []) {
    console.log(JSON.stringify({
      level: 'info',
      event: 'reminder',
      type: 'issue_overdue',
      issue_id: issue.id,
      // Không log assignee email hay PII chi tiết
    }));
    
    if (!isDryRun) {
      // Gọi Resend API
      // await resend.emails.send({ to: assigneeEmail, subject: '...', html: '...' });
    }
  }

  return new Response(JSON.stringify({ 
    overdue_issues: overdueIssues?.length ?? 0,
    dry_run: isDryRun 
  }), { status: 200 });
});
```

**Schedule:**
- [ ] Tìm hiểu và cấu hình cron schedule cho Edge Function — cần kiểm tra tài liệu Supabase hiện tại về `pg_cron` extension hoặc Supabase Scheduled Functions.
- [ ] Chạy thủ công qua `supabase functions invoke send-reminders` để test.

**pgTAP test:** Không có (Edge Function test bằng Deno test / integration test riêng).

**Test thủ công:**
```bash
# Dry run
supabase functions invoke send-reminders --env-file .env.local

# Kiểm tra log
supabase functions logs send-reminders
```

### Definition of Done

- [ ] Invoke function → log JSON có `overdue_issues` count; không log email/PII trong log.
- [ ] Dry run không gửi email thật.
- [ ] Schedule được cấu hình (theo tài liệu hiện tại).

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| Edge Function `send-reminders` | Deno |
| `RESEND_API_KEY` | Secret |

### Ước lượng: 2–4 giờ

---

## Kết quả Phase 6

Sau khi hoàn thành phase này:
- Notification real-time cho mọi hành động approval.
- `auditor` có thể tra cứu đầy đủ audit trail.
- Email reminder chạy định kỳ (hoặc thủ công trigger).
