-- ============================================================
-- Phase 5a: Worklog RLS Tests
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

insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values
  ('proj1', '00000000-0000-0000-0000-000000000010', 'developer',   '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000012', 'team_leader', '00000000-0000-0000-0000-000000000001', current_date, 'active');

insert into work_issue(id, project_id, type, title, status, priority, created_by)
values ('i1', 'proj1', 'task', 'Task 1', 'in_progress', 'medium', '00000000-0000-0000-0000-000000000010');

-- Seed worklog từ Dev A
insert into work_worklog(id, issue_id, project_id, employee_id, logged_date, hours, description, status, created_by)
values (
  'wl1', 'i1', 'proj1', 'e1',
  current_date, 4, 'Implement API', 'draft',
  '00000000-0000-0000-0000-000000000010'
);

-- ---------------------------------------------------------------------------
-- 1. Employee A INSERT worklog cho employee B → bị chặn (RLS: employee_insert_own_worklog)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_ok(
  $$
    insert into work_worklog(issue_id, project_id, employee_id, logged_date, hours, created_by)
    values ('i1', 'proj1', 'e2', current_date, 2, '00000000-0000-0000-0000-000000000010')
  $$,
  'Employee A INSERT worklog cho employee B → bị RLS chặn (chỉ chủ sở hữu INSERT)'
);

-- ---------------------------------------------------------------------------
-- 2. Employee A INSERT worklog cho chính mình → thành công
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    insert into work_worklog(issue_id, project_id, employee_id, logged_date, hours, description, created_by)
    values ('i1', 'proj1', 'e1', current_date - 1, 3, 'Testing', '00000000-0000-0000-0000-000000000010')
  $$,
  'Employee A INSERT worklog cho chính mình → thành công'
);

-- ---------------------------------------------------------------------------
-- 3. team_leader của project SELECT worklog → thấy được
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000012", "role": "team_leader"}';

select ok(
  (select count(*)::int from work_worklog where project_id = 'proj1') > 0,
  'team_leader của project SELECT worklog → thấy được'
);

-- ---------------------------------------------------------------------------
-- 4. developer của project KHÁC → 0 rows
-- ---------------------------------------------------------------------------
-- Dev B (uid=011) không có membership nào trong proj1 và không phải chủ sở hữu wl1
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011", "role": "developer"}';

select is(
  (select count(*)::int from work_worklog where project_id = 'proj1'),
  0,
  'developer không thuộc project SELECT worklog → 0 rows'
);

-- ---------------------------------------------------------------------------
-- 5. Employee không thể DELETE worklog đã submitted
-- ---------------------------------------------------------------------------
set local role to postgres;
update work_worklog set status = 'submitted' where id = 'wl1';

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_ok(
  $$
    delete from work_worklog where id = 'wl1'
  $$,
  'DELETE worklog đã submitted → bị RLS chặn (no_delete_approved_worklog: chỉ draft được xóa)'
);

select * from finish();
rollback;
