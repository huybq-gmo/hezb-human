-- ============================================================
-- Phase 4a: Work Issue RLS Tests
-- ============================================================

begin;

select plan(4);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

-- Active membership (uid=010)
insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values ('proj1', '00000000-0000-0000-0000-000000000010', 'developer', '00000000-0000-0000-0000-000000000001', current_date, 'active');

-- Expired membership (uid=011)
insert into project_membership(project_id, user_id, project_role, granted_by, start_date, end_date, status)
values ('proj1', '00000000-0000-0000-0000-000000000011', 'developer', '00000000-0000-0000-0000-000000000001', current_date - 60, current_date - 1, 'active');

-- Seed issue
insert into work_issue(id, project_id, type, title, status, priority, created_by)
values ('i1', 'proj1', 'task', 'Implement login', 'backlog', 'high', '00000000-0000-0000-0000-000000000010');

-- ---------------------------------------------------------------------------
-- 1. User không có membership → SELECT 0 rows
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000099", "role": "developer"}';

select is(
  (select count(*)::int from work_issue where project_id = 'proj1'),
  0,
  'User không có membership trong project → SELECT 0 rows'
);

-- ---------------------------------------------------------------------------
-- 2. User có membership active → SELECT thấy issues
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select ok(
  (select count(*)::int from work_issue where project_id = 'proj1') > 0,
  'User có membership active → SELECT thấy issues'
);

-- ---------------------------------------------------------------------------
-- 3. User membership expired → SELECT 0 rows
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011", "role": "developer"}';

select is(
  (select count(*)::int from work_issue where project_id = 'proj1'),
  0,
  'User membership expired → SELECT 0 rows (end_date < today)'
);

-- ---------------------------------------------------------------------------
-- 4. company_owner SELECT được tất cả issues
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "company_owner"}';

select ok(
  (select count(*)::int from work_issue where project_id = 'proj1') > 0,
  'company_owner SELECT được tất cả issues của project'
);

select * from finish();
rollback;
