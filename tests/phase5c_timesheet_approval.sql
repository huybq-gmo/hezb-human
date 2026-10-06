-- ============================================================
-- Phase 5c: Timesheet Approval Flow Tests
-- ============================================================

begin;

select plan(6);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

insert into hr_employee(id, user_id, full_name, type, status)
values
  ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A',       'full_time', 'active'),
  ('e_tl', '00000000-0000-0000-0000-000000000012', 'Team Leader', 'full_time', 'active');

insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values
  ('proj1', '00000000-0000-0000-0000-000000000010', 'developer',   '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000012', 'team_leader', '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000004', 'pm',          '00000000-0000-0000-0000-000000000001', current_date, 'active');

-- Timesheet ở trạng thái submitted (của Dev A)
insert into work_timesheet(id, employee_id, project_id, period_start, period_end, total_hours, status, submitted_at, created_by)
values
  ('ts1', 'e1', 'proj1', '2024-01-01', '2024-01-31', 80, 'submitted', now(), '00000000-0000-0000-0000-000000000010'),
  ('ts2', 'e1', 'proj1', '2024-02-01', '2024-02-29', 80, 'leader_approved', now(), '00000000-0000-0000-0000-000000000010');

-- ---------------------------------------------------------------------------
-- 1. Employee tự approve timesheet của mình → SOD_VIOLATION
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select approve_timesheet_step('ts1'::uuid, 'leader'::approval_step)
  $$,
  '%SOD_VIOLATION%',
  'Employee tự approve timesheet của mình → SOD_VIOLATION'
);

-- ---------------------------------------------------------------------------
-- 2. developer (không phải team_leader) approve bước leader → FORBIDDEN
-- ---------------------------------------------------------------------------
-- Dev A là developer không phải team_leader
-- Dùng một developer khác không có membership tl
-- Sử dụng uid của team_leader nhưng với jwt role = developer
-- (giả lập: user có project role developer nhưng system role developer)
-- Thực ra cần một user khác có project role developer, không phải chính Dev A
insert into hr_employee(id, user_id, full_name, type, status)
values ('e_other', '00000000-0000-0000-0000-000000000013', 'Other Dev', 'full_time', 'active');
insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values ('proj1', '00000000-0000-0000-0000-000000000013', 'developer', '00000000-0000-0000-0000-000000000001', current_date, 'active');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000013", "role": "developer"}';

select throws_like(
  $$
    select approve_timesheet_step('ts1'::uuid, 'leader'::approval_step)
  $$,
  '%FORBIDDEN%',
  'developer gọi approve_timesheet_step leader → FORBIDDEN (chỉ team_leader được approve bước leader)'
);

-- ---------------------------------------------------------------------------
-- 3. team_leader approve submitted → leader_approved
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000012", "role": "team_leader"}';

select lives_ok(
  $$
    select approve_timesheet_step('ts1'::uuid, 'leader'::approval_step)
  $$,
  'team_leader approve submitted → thành công'
);

set local role to postgres;
select is(
  (select status from work_timesheet where id = 'ts1'),
  'leader_approved'::timesheet_status,
  'Timesheet ts1 status = leader_approved sau khi team_leader approve'
);

-- ---------------------------------------------------------------------------
-- 4. team_leader approve ts2 (đã ở pm_approved-ish: leader_approved) bước pm → FORBIDDEN
--    (leader không được approve bước pm)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000012", "role": "team_leader"}';

select throws_like(
  $$
    select approve_timesheet_step('ts2'::uuid, 'pm'::approval_step)
  $$,
  '%FORBIDDEN%',
  'team_leader approve bước pm → FORBIDDEN (chỉ pm được approve bước này)'
);

-- ---------------------------------------------------------------------------
-- 5. team_leader approve bước pm với state sai → INVALID_STATE
--    (ts1 hiện tại đang ở leader_approved → approve bước leader lần nữa = INVALID_STATE)
-- ---------------------------------------------------------------------------
select throws_like(
  $$
    select approve_timesheet_step('ts1'::uuid, 'leader'::approval_step)
  $$,
  '%INVALID_STATE%',
  'Approve bước leader khi timesheet đã leader_approved → INVALID_STATE'
);

select * from finish();
rollback;
