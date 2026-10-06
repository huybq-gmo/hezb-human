-- ============================================================
-- Phase 8c: Payroll Approval & Payslip Tests
-- ============================================================

begin;

select plan(8);

set local role to postgres;

-- Setup period (đang ở calculating)
insert into finance_payroll_period(id, month, year, status, opened_by)
values ('period1', 11, 2024, 'calculating', '00000000-0000-0000-0000-000000000005');

-- Employee
insert into hr_employee(id, user_id, full_name, type, status)
values ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A', 'full_time', 'active');

-- Payroll line (đã được tính bởi finance_admin uid=005)
insert into finance_payroll_line(
  id, period_id, employee_id,
  gross_pay, allowances, deductions, net_pay,
  rule_snapshot, input_snapshot,
  calculated_by
)
values (
  'pl1', 'period1', 'e1',
  20000000, '{}',
  '{"income_tax": 1500000, "insurance": 2100000}'::jsonb,
  16400000,
  '{"rule_code": "VN_FULL_TIME_MONTHLY"}'::jsonb,
  '{"approved_hours": 160, "period_start": "2024-11-01"}'::jsonb,
  '00000000-0000-0000-0000-000000000005' -- finance_admin (uid=005) đã tính
);

-- ---------------------------------------------------------------------------
-- 1. developer gọi approve_payroll_period('approve') → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select approve_payroll_period('period1'::uuid, 'approve')
  $$,
  '%FORBIDDEN%',
  'developer gọi approve_payroll_period(approve) → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. finance_admin review (calculating → reviewed)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select lives_ok(
  $$
    select approve_payroll_period('period1'::uuid, 'review')
  $$,
  'finance_admin approve_payroll_period(review) → thành công'
);

set local role to postgres;
select is(
  (select status from finance_payroll_period where id = 'period1'),
  'reviewed'::payroll_period_status,
  'Period status = reviewed sau khi finance_admin review'
);

-- ---------------------------------------------------------------------------
-- 3. SoD: người calculate (uid=005) gọi approve('approve') → SOD_VIOLATION
--    (finance_admin uid=005 đã calculate_payroll, không thể tự approve)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select throws_like(
  $$
    select approve_payroll_period('period1'::uuid, 'approve')
  $$,
  '%SOD_VIOLATION%',
  'Người đã tính lương gọi approve(approve) → SOD_VIOLATION'
);

-- ---------------------------------------------------------------------------
-- 4. director (uid=006, khác người tính) approve → thành công
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000006", "role": "director"}';

select lives_ok(
  $$
    select approve_payroll_period('period1'::uuid, 'approve')
  $$,
  'director (khác người tính) approve_payroll_period(approve) → thành công'
);

set local role to postgres;
select is(
  (select status from finance_payroll_period where id = 'period1'),
  'approved'::payroll_period_status,
  'Period status = approved sau khi director approve'
);

-- ---------------------------------------------------------------------------
-- 5. company_owner lock kỳ → status locked
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "company_owner"}';

select lives_ok(
  $$
    select lock_payroll_period('period1'::uuid)
  $$,
  'company_owner lock_payroll_period → thành công'
);

-- ---------------------------------------------------------------------------
-- 6. Sau lock: UPDATE finance_payroll_line → trigger raise exception PAYROLL_PERIOD_LOCKED
-- ---------------------------------------------------------------------------
set local role to postgres;

select throws_like(
  $$
    update finance_payroll_line
    set gross_pay = 1
    where id = 'pl1'
  $$,
  '%PAYROLL_PERIOD_LOCKED%',
  'Sau lock: UPDATE finance_payroll_line → trigger raise exception PAYROLL_PERIOD_LOCKED'
);

-- ---------------------------------------------------------------------------
-- 7. developer SELECT payslip_view → chỉ thấy payslip của mình
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select is(
  (
    select count(*)::int from payslip_view
    where employee_id = 'e1'
  ),
  1,
  'developer SELECT payslip_view → chỉ thấy payslip của chính mình (1 row)'
);

select * from finish();
rollback;
