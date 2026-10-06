-- ============================================================
-- Phase 8b: Payroll Rule Engine & calculate_payroll Tests
-- ============================================================

begin;

select plan(6);

set local role to postgres;

-- Setup employee và rate
insert into hr_employee(id, user_id, full_name, type, status)
values (
  'e1', '00000000-0000-0000-0000-000000000010',
  'Dev A (hourly)', 'part_time', 'active'
);

-- Rate hourly: 100,000 VND/h (effective from 2024-01-01)
insert into hr_employee_rate(employee_id, rate_type, amount, currency, effective_from)
values ('e1', 'hourly', 100000, 'VND', '2024-01-01');

-- Payroll rule cho part_time (hourly)
insert into finance_payroll_rule(
  id, rule_code, employee_type, description, config, effective_from, is_active
) values (
  'rule1',
  'VN_PART_TIME_HOURLY',
  'part_time',
  'Part-time nhân viên tính theo giờ',
  '{
    "base_formula": "hourly_rate * approved_hours",
    "insurance_rate": 0.105,
    "employer_insurance_rate": 0.215,
    "personal_deduction": 11000000,
    "dependent_deduction": 4400000,
    "tax_brackets": [
      {"from": 0,         "to": 5000000,  "rate": 0.05},
      {"from": 5000000,   "to": 10000000, "rate": 0.10},
      {"from": 10000000,  "to": 18000000, "rate": 0.15},
      {"from": 18000000,  "to": 32000000, "rate": 0.20},
      {"from": 32000000,  "to": 52000000, "rate": 0.25},
      {"from": 52000000,  "to": 80000000, "rate": 0.30},
      {"from": 80000000,  "to": null,     "rate": 0.35}
    ]
  }',
  '2024-01-01',
  true
);

-- Payroll period tháng 10/2024
insert into finance_payroll_period(id, month, year, status, opened_by)
values ('period1', 10, 2024, 'open', '00000000-0000-0000-0000-000000000005');

-- Issue + worklog approved: 160 giờ trong tháng 10/2024
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

insert into work_issue(id, project_id, type, title, status, priority, created_by)
values ('i1', 'proj1', 'task', 'Work', 'done', 'medium', '00000000-0000-0000-0000-000000000010');

-- 160 giờ approved (20 ngày × 8 giờ)
insert into work_worklog(id, issue_id, project_id, employee_id, logged_date, hours, is_billable, status, created_by)
select
  gen_random_uuid(), 'i1', 'proj1', 'e1',
  '2024-10-01'::date + (n * interval '1 day'),
  8,
  true,
  'approved',
  '00000000-0000-0000-0000-000000000010'
from generate_series(0, 19) n;

-- ---------------------------------------------------------------------------
-- 1. developer gọi calculate_payroll → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select calculate_payroll('period1'::uuid)
  $$,
  '%FORBIDDEN%',
  'developer gọi calculate_payroll → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. finance_admin calculate_payroll thành công
--    160h × 100,000 = 16,000,000 gross
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select is(
  (select calculate_payroll('period1'::uuid)),
  1,  -- 1 nhân sự được tính
  'calculate_payroll trả số nhân sự được tính = 1'
);

-- ---------------------------------------------------------------------------
-- 3. Kiểm tra gross_pay đúng: 160h × 100,000 = 16,000,000
-- ---------------------------------------------------------------------------
set local role to postgres;

select is(
  (
    select gross_pay from finance_payroll_line
    where period_id = 'period1' and employee_id = 'e1'
  ),
  16000000::numeric(18,4),
  'gross_pay = 160h × 100,000 VND = 16,000,000 VND (đúng)'
);

-- ---------------------------------------------------------------------------
-- 4. Tính lại cùng kỳ → upsert (không duplicate record)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select lives_ok(
  $$
    select calculate_payroll('period1'::uuid)
  $$,
  'Tính lại cùng kỳ → thành công (upsert, không duplicate)'
);

set local role to postgres;

select is(
  (select count(*)::int from finance_payroll_line where period_id = 'period1'),
  1,
  'Tính lại cùng kỳ → vẫn chỉ có 1 payroll_line (upsert hoạt động đúng)'
);

-- ---------------------------------------------------------------------------
-- 5. Sửa rule đã dùng để tính → RULE_IN_USE
-- ---------------------------------------------------------------------------
select throws_like(
  $$
    update finance_payroll_rule
    set description = 'Sửa rule cũ'
    where id = 'rule1'
  $$,
  '%RULE_IN_USE%',
  'Sửa rule đã dùng để tính lương → trigger raise exception RULE_IN_USE'
);

select * from finish();
rollback;
