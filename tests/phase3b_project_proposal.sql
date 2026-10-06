-- ============================================================
-- Phase 3b: Proposal & Approval Flow Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name, code) values ('c1', 'Client ABC', 'ABC');

insert into project_proposal(id, client_id, title, billing_type, status, created_by)
values (
  'p1', 'c1', 'ERP System Phase 1', 'fixed_price', 'draft',
  '00000000-0000-0000-0000-000000000004'
);

insert into project_proposal(id, client_id, title, billing_type, status, sent_at, created_by)
values (
  'p2', 'c1', 'Mobile App Project', 'hourly', 'sent', now(),
  '00000000-0000-0000-0000-000000000004'
);

-- ---------------------------------------------------------------------------
-- 1. developer gọi approve_proposal → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select throws_like(
  $$
    select approve_proposal('p2'::uuid)
  $$,
  '%FORBIDDEN%',
  'developer gọi approve_proposal → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. director approve proposal status draft → INVALID_STATE
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "director"}';

select throws_like(
  $$
    select approve_proposal('p1'::uuid)
  $$,
  '%INVALID_STATE%',
  'director approve proposal status draft → INVALID_STATE (phải ở sent)'
);

-- ---------------------------------------------------------------------------
-- 3. director approve proposal status sent → thành công
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select approve_proposal('p2'::uuid)
  $$,
  'director approve proposal status sent → thành công'
);

-- ---------------------------------------------------------------------------
-- 4. Sau approve: project được tạo với proposal_id
-- ---------------------------------------------------------------------------
set local role to postgres;

select ok(
  exists (
    select 1 from project_project where proposal_id = 'p2'
  ),
  'Sau approve_proposal: project được tạo với đúng proposal_id'
);

-- ---------------------------------------------------------------------------
-- 5. Proposal status → approved
-- ---------------------------------------------------------------------------
select is(
  (select status from project_proposal where id = 'p2'),
  'approved'::proposal_status,
  'Proposal p2 status = approved sau khi approve thành công'
);

select * from finish();
rollback;
