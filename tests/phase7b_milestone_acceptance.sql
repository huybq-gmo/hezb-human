-- ============================================================
-- Phase 7b: Milestone Acceptance Flow Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'fixed_price', 'active');

insert into project_membership(project_id, user_id, project_role, granted_by, start_date, status)
values
  ('proj1', '00000000-0000-0000-0000-000000000010', 'developer', '00000000-0000-0000-0000-000000000001', current_date, 'active'),
  ('proj1', '00000000-0000-0000-0000-000000000004', 'pm', '00000000-0000-0000-0000-000000000001', current_date, 'active');

-- Milestones
insert into project_milestone(id, project_id, name, status, budget_amount, created_by)
values
  ('m1', 'proj1', 'Milestone 1 (open)',      'open',      50000000, '00000000-0000-0000-0000-000000000004'),
  ('m2', 'proj1', 'Milestone 2 (submitted)', 'submitted', 50000000, '00000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------------
-- 1. developer gọi submit_milestone_acceptance → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select submit_milestone_acceptance('m1'::uuid)
  $$,
  '%FORBIDDEN%',
  'developer gọi submit_milestone_acceptance → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. pm submit milestone open → status submitted
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004", "role": "project_manager"}';

select lives_ok(
  $$
    select submit_milestone_acceptance('m1'::uuid)
  $$,
  'pm submit milestone open → thành công'
);

set local role to postgres;
select is(
  (select status from project_milestone where id = 'm1'),
  'submitted'::milestone_status,
  'Milestone m1 status = submitted sau khi pm submit'
);

-- ---------------------------------------------------------------------------
-- 3. director accept submitted → status accepted, audit log
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "director"}';

select lives_ok(
  $$
    select accept_milestone('m2'::uuid)
  $$,
  'director accept milestone submitted → thành công'
);

set local role to postgres;
select is(
  (select status from project_milestone where id = 'm2'),
  'accepted'::milestone_status,
  'Milestone m2 status = accepted sau khi director accept'
);

select * from finish();
rollback;
