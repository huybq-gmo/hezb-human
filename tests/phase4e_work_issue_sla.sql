-- ============================================================
-- Phase 4e: SLA View Tests (work_issue_with_sla)
-- ============================================================

begin;

select plan(4);

set local role to postgres;

-- Setup project
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

-- Issues
insert into work_issue(id, project_id, type, title, status, priority, due_date, created_by)
values
  -- Overdue: due_date hôm qua, status còn in_progress
  ('i_overdue', 'proj1', 'task', 'Overdue Task',    'in_progress', 'high',   current_date - 1, '00000000-0000-0000-0000-000000000001'),
  -- At risk: due_date trong 3 ngày tới
  ('i_atrisk',  'proj1', 'task', 'At Risk Task',    'todo',        'medium', current_date + 2, '00000000-0000-0000-0000-000000000001'),
  -- On track: due_date còn xa
  ('i_ontrack', 'proj1', 'task', 'On Track Task',   'todo',        'low',    current_date + 30,'00000000-0000-0000-0000-000000000001'),
  -- Done: không bao giờ overdue dù due_date đã qua
  ('i_done',    'proj1', 'task', 'Completed Task',  'done',        'medium', current_date - 10,'00000000-0000-0000-0000-000000000001'),
  -- No deadline
  ('i_nodeadl', 'proj1', 'task', 'No Deadline Task','backlog',     'low',    null,              '00000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Issue có due_date hôm qua và status in_progress → is_overdue = true
-- ---------------------------------------------------------------------------
select is(
  (select is_overdue from work_issue_with_sla where id = 'i_overdue'),
  true,
  'Issue due_date hôm qua, status in_progress → is_overdue = true'
);

-- ---------------------------------------------------------------------------
-- 2. is_overdue = true → sla_status = overdue
-- ---------------------------------------------------------------------------
select is(
  (select sla_status from work_issue_with_sla where id = 'i_overdue'),
  'overdue',
  'Issue overdue → sla_status = ''overdue'''
);

-- ---------------------------------------------------------------------------
-- 3. Issue done dù due_date đã qua → is_overdue = false
-- ---------------------------------------------------------------------------
select is(
  (select is_overdue from work_issue_with_sla where id = 'i_done'),
  false,
  'Issue done dù due_date đã qua → is_overdue = false'
);

-- ---------------------------------------------------------------------------
-- 4. Issue due_date trong 3 ngày → sla_status = at_risk
-- ---------------------------------------------------------------------------
select is(
  (select sla_status from work_issue_with_sla where id = 'i_atrisk'),
  'at_risk',
  'Issue due_date trong 3 ngày tới → sla_status = ''at_risk'''
);

select * from finish();
rollback;
