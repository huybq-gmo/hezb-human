-- ============================================================
-- Phase 2e: Leave Request & Balance Tests
-- ============================================================

begin;

select plan(6);

set local role to postgres;

-- Setup employees
insert into hr_employee(id, user_id, full_name, type, status)
values
  ('e1', '00000000-0000-0000-0000-000000000002', 'Dev A',    'full_time', 'active'),
  ('e2', '00000000-0000-0000-0000-000000000003', 'HR Admin', 'full_time', 'active');

-- Leave type
insert into hr_leave_type(id, code, name, default_days_per_year)
values ('lt1', 'annual', 'Nghỉ phép năm', 12);

-- Balance cho Dev A
insert into hr_leave_balance(employee_id, leave_type_id, year, total_days, used_days)
values ('e1', 'lt1', extract(year from current_date)::int, 12, 0);

-- Balance cho HR Admin
insert into hr_leave_balance(employee_id, leave_type_id, year, total_days, used_days)
values ('e2', 'lt1', extract(year from current_date)::int, 12, 0);

-- ---------------------------------------------------------------------------
-- 1. developer INSERT leave request cho employee của mình → thành công
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select lives_ok(
  $$
    insert into hr_leave_request(
      id, employee_id, leave_type_id, start_date, end_date,
      days_requested, reason, status, created_by
    )
    values (
      'r1', 'e1', 'lt1',
      current_date + 7, current_date + 8,
      2, 'Nghỉ gia đình', 'pending',
      '00000000-0000-0000-0000-000000000002'
    )
  $$,
  'developer INSERT leave request cho employee của mình → thành công'
);

-- ---------------------------------------------------------------------------
-- 2. Approve → balance giảm đúng days_requested (2 ngày)
-- ---------------------------------------------------------------------------
set local role to postgres;
perform set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}', true);
perform approve_leave('r1'::uuid);

select is(
  (select used_days from hr_leave_balance where employee_id = 'e1' and leave_type_id = 'lt1'),
  2::numeric(5,1),
  'Sau approve_leave: used_days tăng đúng 2 ngày'
);

-- ---------------------------------------------------------------------------
-- 3. SoD: hr_admin tự approve request của chính mình → SOD_VIOLATION
-- ---------------------------------------------------------------------------
insert into hr_leave_request(
  id, employee_id, leave_type_id, start_date, end_date,
  days_requested, status, created_by
)
values (
  'r2', 'e2', 'lt1',
  current_date + 14, current_date + 15, 2, 'pending',
  '00000000-0000-0000-0000-000000000003' -- same as hr_admin uid
);

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select throws_like(
  $$
    select approve_leave('r2'::uuid)
  $$,
  '%SOD_VIOLATION%',
  'SoD: hr_admin tự approve request của mình → SOD_VIOLATION'
);

-- ---------------------------------------------------------------------------
-- 4. Approve khi balance không đủ → INSUFFICIENT_BALANCE
-- ---------------------------------------------------------------------------
set local role to postgres;
insert into hr_leave_request(
  id, employee_id, leave_type_id, start_date, end_date,
  days_requested, status, created_by
)
values (
  'r3', 'e1', 'lt1',
  current_date + 30, current_date + 59, 30, 'pending',
  '00000000-0000-0000-0000-000000000002'
);

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select throws_like(
  $$
    select approve_leave('r3'::uuid)
  $$,
  '%INSUFFICIENT_BALANCE%',
  'Approve khi balance không đủ → INSUFFICIENT_BALANCE'
);

-- ---------------------------------------------------------------------------
-- 5. UPDATE trực tiếp status leave_request → bị chặn (no_direct_update_leave_status)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select throws_ok(
  $$
    update hr_leave_request set status = 'approved' where id = 'r3'
  $$,
  'UPDATE leave_request status trực tiếp → bị RLS chặn (no_direct_update_leave_status)'
);

-- ---------------------------------------------------------------------------
-- 6. developer xem được leave request của mình
-- ---------------------------------------------------------------------------
select ok(
  (select count(*)::int from hr_leave_request where employee_id = 'e1') > 0,
  'developer xem được leave request của employee của mình'
);

select * from finish();
rollback;
