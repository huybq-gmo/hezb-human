-- ============================================================
-- Phase 2f: Employee Lifecycle (State Machine) Tests
-- ============================================================

begin;

select plan(4);

set local role to postgres;

-- Setup
insert into hr_employee(id, full_name, type, status)
values
  ('e1', 'Nguyen Van A', 'full_time', 'onboarding'),
  ('e2', 'Tran Thi B',   'full_time', 'active');

-- ---------------------------------------------------------------------------
-- 1. developer gọi transition_employee_status → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select throws_like(
  $$
    select transition_employee_status('e1'::uuid, 'active'::employee_status, null)
  $$,
  '%FORBIDDEN%',
  'developer gọi transition_employee_status → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. hr_admin transition active → terminated (bỏ qua offboarding) → INVALID_TRANSITION
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select throws_like(
  $$
    select transition_employee_status('e2'::uuid, 'terminated'::employee_status, 'skip')
  $$,
  '%INVALID_TRANSITION%',
  'hr_admin transition active → terminated (bỏ qua offboarding) → INVALID_TRANSITION'
);

-- ---------------------------------------------------------------------------
-- 3. hr_admin transition onboarding → active → thành công
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select transition_employee_status('e1'::uuid, 'active'::employee_status, 'Hoàn thành onboarding')
  $$,
  'hr_admin transition onboarding → active → thành công'
);

-- ---------------------------------------------------------------------------
-- 4. Audit log ghi đúng from=onboarding, to=active
-- ---------------------------------------------------------------------------
set local role to postgres;

select ok(
  exists (
    select 1 from audit_log
    where table_name = 'hr_employee'
      and record_id = 'e1'::uuid
      and action = 'RPC:transition_status'
      and after_masked @> '{"from": "onboarding", "to": "active"}'
  ),
  'Audit log ghi đúng from=onboarding, to=active, actor, action'
);

select * from finish();
rollback;
