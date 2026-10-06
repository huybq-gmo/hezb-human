-- ============================================================
-- Phase 5b: Timesheet Submit Tests (submit_timesheet RPC)
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

insert into hr_employee(id, user_id, full_name, type, status)
values
  ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A', 'full_time', 'active'),
  ('e2', '00000000-0000-0000-0000-000000000011', 'Dev B', 'full_time', 'active');

insert into work_issue(id, project_id, type, title, status, priority, created_by)
values ('i1', 'proj1', 'task', 'Task 1', 'in_progress', 'medium', '00000000-0000-0000-0000-000000000010');

-- Worklog draft của Dev A trong kỳ (tháng hiện tại)
insert into work_worklog(id, issue_id, project_id, employee_id, logged_date, hours, status, created_by)
values (
  'wl1', 'i1', 'proj1', 'e1',
  date_trunc('month', current_date)::date + 1,
  8, 'draft', '00000000-0000-0000-0000-000000000010'
);

-- ---------------------------------------------------------------------------
-- 1. Employee A submit timesheet cho employee B → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select submit_timesheet(
      'e2'::uuid,
      'proj1'::uuid,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    )
  $$,
  '%FORBIDDEN%',
  'Employee A submit timesheet cho employee B → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. Submit khi không có worklog trong kỳ → NO_WORKLOG
-- ---------------------------------------------------------------------------
-- Dev B không có worklog nào trong kỳ
select throws_like(
  $$
    select submit_timesheet(
      'e1'::uuid,
      'proj1'::uuid,
      '2020-01-01'::date,
      '2020-01-31'::date
    )
  $$,
  '%NO_WORKLOG%',
  'Submit khi không có worklog trong kỳ → NO_WORKLOG'
);

-- ---------------------------------------------------------------------------
-- 3. Submit thành công → status = submitted, worklog → submitted
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select submit_timesheet(
      'e1'::uuid,
      'proj1'::uuid,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    )
  $$,
  'submit_timesheet thành công với worklog draft hợp lệ'
);

set local role to postgres;

select is(
  (
    select status from work_timesheet
    where employee_id = 'e1' and project_id = 'proj1'
  ),
  'submitted'::timesheet_status,
  'Sau submit_timesheet: timesheet status = submitted'
);

-- ---------------------------------------------------------------------------
-- 4. Submit lần 2 cùng timesheet (status != draft) → ALREADY_SUBMITTED
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select submit_timesheet(
      'e1'::uuid,
      'proj1'::uuid,
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    )
  $$,
  '%ALREADY_SUBMITTED%',
  'Submit lần 2 cùng timesheet → ALREADY_SUBMITTED'
);

select * from finish();
rollback;
