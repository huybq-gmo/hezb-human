-- ============================================================
-- Phase 6a: Notification RLS & Dedupe Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- ---------------------------------------------------------------------------
-- 1. INSERT trực tiếp vào core_notification → bị RLS chặn
--    (policy: no_direct_insert_notification with check false)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_ok(
  $$
    insert into core_notification(recipient_id, type, title)
    values (
      '00000000-0000-0000-0000-000000000010',
      'timesheet_submitted',
      'Direct insert test'
    )
  $$,
  'INSERT trực tiếp vào core_notification → bị RLS chặn (no_direct_insert_notification)'
);

-- ---------------------------------------------------------------------------
-- 2. fn_notify() với cùng dedupe_key → chỉ tạo 1 notification (idempotent)
-- ---------------------------------------------------------------------------
set local role to postgres;

select fn_notify(
  '00000000-0000-0000-0000-000000000010',
  'timesheet_submitted',
  'Timesheet cần review',
  'Dev A đã submit timesheet kỳ tháng 3',
  '/timesheet/ts1',
  'ts_submit_ts1_test'
);

-- Gọi lần 2 cùng dedupe_key
select fn_notify(
  '00000000-0000-0000-0000-000000000010',
  'timesheet_submitted',
  'Timesheet cần review (duplicate)',
  'Duplicate call',
  '/timesheet/ts1',
  'ts_submit_ts1_test' -- same dedupe_key
);

select is(
  (
    select count(*)::int from core_notification
    where dedupe_key = 'ts_submit_ts1_test'
  ),
  1,
  'fn_notify() với cùng dedupe_key → chỉ tạo 1 notification (on conflict do nothing)'
);

-- ---------------------------------------------------------------------------
-- 3. User A xem notification của chính mình → thấy được
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select ok(
  (
    select count(*)::int from core_notification
    where recipient_id = '00000000-0000-0000-0000-000000000010'
  ) > 0,
  'User A SELECT notification của chính mình → thấy được'
);

-- ---------------------------------------------------------------------------
-- 4. User A SELECT notification của User B → 0 rows
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011", "role": "developer"}';

select is(
  (
    select count(*)::int from core_notification
    where recipient_id = '00000000-0000-0000-0000-000000000010'
  ),
  0,
  'User B SELECT notification của User A → 0 rows (RLS: recipient_read_notification)'
);

-- ---------------------------------------------------------------------------
-- 5. User UPDATE is_read trên notification của chính mình → thành công
-- ---------------------------------------------------------------------------
set local role to postgres;
-- Tạo notification thêm để user có thể mark read
select fn_notify(
  '00000000-0000-0000-0000-000000000011',
  'leave_approved',
  'Đơn nghỉ phép được duyệt',
  null,
  '/hr/leave',
  'leave_notif_user_b_001'
);

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011", "role": "developer"}';

select lives_ok(
  $$
    update core_notification
    set is_read = true
    where recipient_id = '00000000-0000-0000-0000-000000000011'
      and dedupe_key = 'leave_notif_user_b_001'
  $$,
  'User UPDATE is_read trên notification của chính mình → thành công'
);

select * from finish();
rollback;
