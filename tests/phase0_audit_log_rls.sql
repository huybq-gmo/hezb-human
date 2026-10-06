-- ============================================================
-- Phase 0b: Audit Log RLS Tests
-- ============================================================
-- Run: pg_prove -U postgres tests/phase0_audit_log_rls.sql
-- ============================================================

begin;

select plan(4);

-- ---------------------------------------------------------------------------
-- 1. developer không SELECT được audit_log
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "developer"}';

select is(
  (select count(*)::int from audit_log),
  0,
  'developer không SELECT được audit_log → expect 0 rows'
);

-- ---------------------------------------------------------------------------
-- 2. auditor SELECT được audit_log
-- ---------------------------------------------------------------------------
set local role to postgres;
insert into audit_log(actor_id, table_name, action, record_id)
values (
  '00000000-0000-0000-0000-000000000001',
  'hr_employee',
  'INSERT',
  '00000000-0000-0000-0000-000000000099'
);

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "auditor"}';

select ok(
  (select count(*)::int from audit_log) > 0,
  'auditor SELECT được audit_log → expect rows'
);

-- ---------------------------------------------------------------------------
-- 3. company_owner SELECT được audit_log
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "company_owner"}';

select ok(
  (select count(*)::int from audit_log) > 0,
  'company_owner SELECT được audit_log → expect rows'
);

-- ---------------------------------------------------------------------------
-- 4. core_config có đúng 4 dòng default
-- ---------------------------------------------------------------------------
set local role to postgres;
select is(
  (select count(*)::int from core_config),
  4,
  'core_config có đúng 4 dòng default (org_timezone, org_locale, org_currency, week_start_day)'
);

select * from finish();
rollback;
