-- ============================================================
-- Phase 1a: User Profile RLS Tests
-- ============================================================

begin;

select plan(3);

-- Setup
set local role to postgres;
insert into core_user_profile(id, full_name, is_active)
values (
  '00000000-0000-0000-0000-000000000010',
  'Test User A',
  true
);

-- ---------------------------------------------------------------------------
-- 1. Authenticated user SELECT được profile của mình
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "authenticated"}';

select is(
  (select count(*)::int from core_user_profile where id = '00000000-0000-0000-0000-000000000010'),
  1,
  'Authenticated user SELECT được profile của mình → expect 1 row'
);

-- ---------------------------------------------------------------------------
-- 2. Unauthenticated request SELECT → expect 0 rows
-- ---------------------------------------------------------------------------
set local role to anon;

select is(
  (select count(*)::int from core_user_profile),
  0,
  'Unauthenticated (anon) SELECT core_user_profile → expect 0 rows'
);

-- ---------------------------------------------------------------------------
-- 3. Trigger function fn_on_auth_user_created tồn tại
-- ---------------------------------------------------------------------------
set local role to postgres;
select ok(
  exists (
    select 1 from pg_proc
    where proname = 'fn_on_auth_user_created'
  ),
  'Trigger function fn_on_auth_user_created tồn tại'
);

select * from finish();
rollback;
