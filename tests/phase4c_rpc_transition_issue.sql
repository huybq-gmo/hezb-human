-- ============================================================
-- Phase 4c: Workflow Transition Tests (transition_issue RPC)
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

-- Memberships
insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values
  ('proj1', '00000000-0000-0000-0000-000000000010', 'developer',    '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000011', 'qa_reviewer',  '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000012', 'team_leader',  '00000000-0000-0000-0000-000000000001', current_date, 'active');

-- Issues
insert into work_issue(id, project_id, type, title, status, priority, created_by)
values
  ('i1', 'proj1', 'task', 'Task 1 (in_review)',  'in_review', 'medium', '00000000-0000-0000-0000-000000000010'),
  ('i2', 'proj1', 'task', 'Task 2 (todo)',        'todo',       'medium', '00000000-0000-0000-0000-000000000010'),
  ('i3', 'proj1', 'task', 'Task 3 (backlog→done)','backlog',    'medium', '00000000-0000-0000-0000-000000000010');

-- Seed workflow config
insert into work_issue_workflow(from_status, to_status, allowed_roles) values
  ('backlog',     'todo',        array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('todo',        'in_progress', array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('in_progress', 'in_review',   array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('in_review',   'done',        array['pm', 'team_leader', 'qa_reviewer']),
  ('in_review',   'in_progress', array['pm', 'team_leader', 'qa_reviewer']),
  ('done',        'backlog',     array['pm', 'team_leader']),
  ('backlog',     'cancelled',   array['pm', 'team_leader']),
  ('todo',        'cancelled',   array['pm', 'team_leader']),
  ('in_progress', 'blocked',     array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('blocked',     'in_progress', array['pm', 'team_leader', 'developer', 'qa_reviewer'])
on conflict (from_status, to_status) do nothing;

-- ---------------------------------------------------------------------------
-- 1. developer transition in_review → done → FORBIDDEN (developer không có quyền)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select transition_issue('i1'::uuid, 'done'::issue_status, null)
  $$,
  '%FORBIDDEN%',
  'developer transition in_review → done → FORBIDDEN (developer không trong allowed_roles của bước này)'
);

-- ---------------------------------------------------------------------------
-- 2. qa_reviewer transition in_review → done → thành công
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011", "role": "qa_reviewer"}';

select lives_ok(
  $$
    select transition_issue('i1'::uuid, 'done'::issue_status, null)
  $$,
  'qa_reviewer transition in_review → done → thành công'
);

-- Verify status
set local role to postgres;
select is(
  (select status from work_issue where id = 'i1'),
  'done'::issue_status,
  'Issue i1 status = done sau khi qa_reviewer transition'
);

-- ---------------------------------------------------------------------------
-- 3. todo → done (bỏ qua in_progress/in_review) → INVALID_TRANSITION
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000011", "role": "qa_reviewer"}';

select throws_like(
  $$
    select transition_issue('i2'::uuid, 'done'::issue_status, null)
  $$,
  '%INVALID_TRANSITION%',
  'todo → done (bỏ qua in_progress/in_review) → INVALID_TRANSITION'
);

-- ---------------------------------------------------------------------------
-- 4. developer transition backlog → cancelled → FORBIDDEN (chỉ pm/team_leader)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select transition_issue('i3'::uuid, 'cancelled'::issue_status, null)
  $$,
  '%FORBIDDEN%',
  'developer transition backlog → cancelled → FORBIDDEN (chỉ pm/team_leader được cancel)'
);

select * from finish();
rollback;
