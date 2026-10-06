-- ============================================================
-- Phase 8a: Payroll Period Tests
-- ============================================================

begin;

select plan(6);

set local role to postgres;

-- ---------------------------------------------------------------------------
-- 1. developer gọi open_payroll_period → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select open_payroll_period(10, 2024)
  $$,
  '%FORBIDDEN%',
  'developer gọi open_payroll_period → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. developer gọi export_payroll_hours → FORBIDDEN
-- ---------------------------------------------------------------------------
select throws_like(
  $$
    select * from export_payroll_hours('00000000-0000-0000-0000-000000000001'::uuid)
  $$,
  '%FORBIDDEN%',
  'developer gọi export_payroll_hours → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 3. finance_admin mở kỳ tháng 10/2024 → status open
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select lives_ok(
  $$
    select open_payroll_period(10, 2024)
  $$,
  'finance_admin mở kỳ tháng 10/2024 → thành công'
);

set local role to postgres;

select is(
  (select status from finance_payroll_period where month = 10 and year = 2024),
  'open'::payroll_period_status,
  'Kỳ tháng 10/2024 status = open sau khi mở'
);

-- ---------------------------------------------------------------------------
-- 4. Mở cùng kỳ lần 2 → idempotent (không duplicate)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select lives_ok(
  $$
    select open_payroll_period(10, 2024)
  $$,
  'Mở cùng kỳ lần 2 → idempotent (không duplicate, không lỗi)'
);

set local role to postgres;

select is(
  (select count(*)::int from finance_payroll_period where month = 10 and year = 2024),
  1,
  'Mở cùng kỳ lần 2 → vẫn chỉ có 1 record (on conflict do nothing)'
);

-- ---------------------------------------------------------------------------
-- NOTE: Test UPDATE kỳ locked → trigger raise exception PAYROLL_LOCKED
-- ---------------------------------------------------------------------------
-- Tạo kỳ locked để test trigger
set local role to postgres;
insert into finance_payroll_period(month, year, status)
values (1, 2024, 'locked');

select throws_like(
  $$
    update finance_payroll_period
    set status = 'open'
    where month = 1 and year = 2024
  $$,
  '%PAYROLL_LOCKED%',
  'UPDATE kỳ lương đã locked → trigger raise exception PAYROLL_LOCKED'
);

select * from finish();
rollback;
