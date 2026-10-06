-- ============================================================
-- Phase 1d: RPC Role Management Tests
-- ============================================================

begin;

select plan(4);

set local role to postgres;

insert into core_role_assignment(user_id, role, granted_by)
values
  ('00000000-0000-0000-0000-000000000001', 'company_owner', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', 'developer', '00000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. developer gọi assign_role → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select throws_like(
  $$
    select assign_role(
      '00000000-0000-0000-0000-000000000099'::uuid,
      'hr_admin'::app_role,
      null
    )
  $$,
  '%FORBIDDEN%',
  'developer gọi assign_role → raise exception FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. company_owner gọi assign_role → thành công
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "company_owner"}';

select lives_ok(
  $$
    select assign_role(
      '00000000-0000-0000-0000-000000000099'::uuid,
      'hr_admin'::app_role,
      null
    )
  $$,
  'company_owner gọi assign_role → thành công'
);

-- ---------------------------------------------------------------------------
-- 3. Role được gán + audit log có bản ghi
-- ---------------------------------------------------------------------------
set local role to postgres;

select ok(
  exists (
    select 1 from core_role_assignment
    where user_id = '00000000-0000-0000-0000-000000000099'
      and role = 'hr_admin'
      and revoked_at is null
  ),
  'Sau assign_role: role hr_admin được gán cho user 099'
);

select ok(
  exists (
    select 1 from audit_log
    where action = 'RPC:assign_role'
      and record_id = '00000000-0000-0000-0000-000000000099'
  ),
  'Audit log có bản ghi RPC:assign_role'
);

select * from finish();
rollback;


-- ============================================================
-- revoke_role Test
-- ============================================================
begin;

select plan(2);

set local role to postgres;

insert into core_role_assignment(user_id, role, granted_by, revoked_at)
values ('00000000-0000-0000-0000-000000000005', 'hr_admin', '00000000-0000-0000-0000-000000000001', null);

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "company_owner"}';

select lives_ok(
  $$
    select revoke_role(
      '00000000-0000-0000-0000-000000000005'::uuid,
      'hr_admin'::app_role
    )
  $$,
  'company_owner gọi revoke_role → thành công'
);

set local role to postgres;
select ok(
  exists (
    select 1 from core_role_assignment
    where user_id = '00000000-0000-0000-0000-000000000005'
      and role = 'hr_admin'
      and revoked_at is not null
  ),
  'Sau revoke_role: revoked_at được set (không còn null)'
);

select * from finish();
rollback;
