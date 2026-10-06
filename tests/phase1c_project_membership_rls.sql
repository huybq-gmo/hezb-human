-- ============================================================
-- Phase 1c: Project Membership RLS Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup dữ liệu
insert into project_membership(project_id, user_id, project_role, granted_by, start_date, end_date, status)
values
  -- Active membership
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010',
   'developer', '00000000-0000-0000-0000-000000000001', current_date - 30, null, 'active'),
  -- Expired membership (end_date đã qua)
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
   'developer', '00000000-0000-0000-0000-000000000001', current_date - 60, current_date - 1, 'active');

-- ---------------------------------------------------------------------------
-- 1. auth.user_project_role() trả đúng role cho membership active
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select is(
  (select auth.user_project_role('10000000-0000-0000-0000-000000000001'::uuid)),
  'developer',
  'user_project_role() trả đúng role cho membership active'
);

-- ---------------------------------------------------------------------------
-- 2. Membership expired → user_project_role() trả null
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000020", "role": "developer"}';

select is(
  (select auth.user_project_role('10000000-0000-0000-0000-000000000001'::uuid)),
  null,
  'user_project_role() trả null khi membership expired (end_date < today)'
);

-- ---------------------------------------------------------------------------
-- 3. INSERT trực tiếp vào project_membership → bị RLS chặn
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    insert into project_membership(project_id, user_id, project_role, granted_by)
    values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000010',
      'developer',
      '00000000-0000-0000-0000-000000000001'
    )
  $$,
  'INSERT trực tiếp vào project_membership bị RLS chặn (no_direct_insert_membership)'
);

-- ---------------------------------------------------------------------------
-- 4. company_owner SELECT được tất cả membership
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "company_owner"}';

select ok(
  (select count(*)::int from project_membership) >= 2,
  'company_owner SELECT được tất cả membership → >= 2 rows'
);

-- ---------------------------------------------------------------------------
-- 5. User xem được membership của chính mình
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select is(
  (select count(*)::int from project_membership where user_id = '00000000-0000-0000-0000-000000000010'),
  1,
  'User SELECT được membership của chính mình → 1 row'
);

select * from finish();
rollback;
