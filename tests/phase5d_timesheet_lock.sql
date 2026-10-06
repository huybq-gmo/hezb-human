-- ============================================================
-- Phase 5d: Timesheet Lock Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

insert into hr_employee(id, user_id, full_name, type, status)
values ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A', 'full_time', 'active');

insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values
  ('proj1', '00000000-0000-0000-0000-000000000010', 'developer', '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000004', 'pm', '00000000-0000-0000-0000-000000000001', current_date, 'active');

-- Timesheets: 1 pm_approved (sẵn sàng lock), 1 submitted (chưa approved)
insert into work_timesheet(id, employee_id, project_id, period_start, period_end, total_hours, status, created_by)
values
  ('ts_approved', 'e1', 'proj1', '2024-03-01', '2024-03-31', 80, 'pm_approved', '00000000-0000-0000-0000-000000000010'),
  ('ts_submitted', 'e1', 'proj1', '2024-04-01', '2024-04-30', 80, 'submitted',   '00000000-0000-0000-0000-000000000010');

-- Timesheet đã locked (cho test UPDATE)
insert into work_timesheet(id, employee_id, project_id, period_start, period_end, total_hours, status, locked_at, locked_by, created_by)
values
  ('ts_locked', 'e1', 'proj1', '2024-01-01', '2024-01-31', 80, 'locked', now(), '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010');

-- ---------------------------------------------------------------------------
-- 1. UPDATE trực tiếp timesheet đã locked → trigger raise exception LOCKED
-- ---------------------------------------------------------------------------
select throws_like(
  $$
    update work_timesheet
    set total_hours = 999
    where id = 'ts_locked'
  $$,
  '%LOCKED%',
  'UPDATE trực tiếp timesheet đã locked → trigger raise exception LOCKED'
);

-- ---------------------------------------------------------------------------
-- 2. developer gọi lock_timesheet_period → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select lock_timesheet_period('proj1'::uuid, '2024-03-01'::date, '2024-03-31'::date)
  $$,
  '%FORBIDDEN%',
  'developer gọi lock_timesheet_period → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 3. pm lock khi còn timesheet submitted (chưa approve hết) → HAS_UNAPPROVED
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004", "role": "project_manager"}';

select throws_like(
  $$
    select lock_timesheet_period('proj1'::uuid, '2024-04-01'::date, '2024-04-30'::date)
  $$,
  '%HAS_UNAPPROVED%',
  'pm lock khi còn timesheet submitted → HAS_UNAPPROVED'
);

-- ---------------------------------------------------------------------------
-- 4. pm lock thành công → trả số timesheet được lock
-- ---------------------------------------------------------------------------
select is(
  (select lock_timesheet_period('proj1'::uuid, '2024-03-01'::date, '2024-03-31'::date)),
  1,
  'pm lock thành công → trả 1 (số timesheet được lock)'
);

-- ---------------------------------------------------------------------------
-- 5. Sau lock: timesheet status = locked
-- ---------------------------------------------------------------------------
set local role to postgres;

select is(
  (select status from work_timesheet where id = 'ts_approved'),
  'locked'::timesheet_status,
  'Sau lock_timesheet_period: timesheet status = locked'
);

select * from finish();
rollback;
