-- ============================================================
-- Phase 1b: Role Assignment RLS Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into core_role_assignment(user_id, role, granted_by)
values
  ('00000000-0000-0000-0000-000000000001', 'company_owner', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', 'developer',     '00000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. company_owner SELECT được core_role_assignment
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "company_owner"}';

select ok(
  (select count(*)::int from core_role_assignment) > 0,
  'company_owner SELECT được core_role_assignment → expect rows'
);

-- ---------------------------------------------------------------------------
-- 2. developer SELECT core_role_assignment → expect 0 rows
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select is(
  (select count(*)::int from core_role_assignment),
  0,
  'developer SELECT core_role_assignment → expect 0 rows'
);

-- ---------------------------------------------------------------------------
-- 3. hr_admin SELECT được core_role_assignment
-- ---------------------------------------------------------------------------
set local role to postgres;
insert into core_role_assignment(user_id, role, granted_by)
values ('00000000-0000-0000-0000-000000000003', 'hr_admin', '00000000-0000-0000-0000-000000000001');

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select ok(
  (select count(*)::int from core_role_assignment) > 0,
  'hr_admin SELECT được core_role_assignment → expect rows'
);

-- ---------------------------------------------------------------------------
-- 4. auth.user_has_role() function tồn tại
-- ---------------------------------------------------------------------------
set local role to postgres;
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'user_has_role'
  ),
  'Helper function auth.user_has_role() tồn tại'
);

-- ---------------------------------------------------------------------------
-- 5. auth.custom_access_token_hook function tồn tại
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'custom_access_token_hook'
  ),
  'Auth hook auth.custom_access_token_hook() tồn tại'
);

select * from finish();
rollback;
