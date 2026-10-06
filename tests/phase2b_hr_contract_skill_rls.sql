-- ============================================================
-- Phase 2b: HR Contract & Skill RLS Tests
-- ============================================================

begin;

select plan(4);

set local role to postgres;

-- Setup
insert into hr_employee(id, full_name, type, status)
values ('e0000000-0000-0000-0000-000000000001', 'Nguyen Van A', 'full_time', 'active');

insert into hr_contract(id, employee_id, contract_type, start_date)
values ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'indefinite', '2024-01-01');

-- ---------------------------------------------------------------------------
-- 1. developer không đọc được hr_contract → 0 rows
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select is(
  (select count(*)::int from hr_contract),
  0,
  'developer SELECT hr_contract → 0 rows (chỉ hr_admin, company_owner, finance_admin được đọc)'
);

-- ---------------------------------------------------------------------------
-- 2. hr_admin đọc được hr_contract
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select ok(
  (select count(*)::int from hr_contract) > 0,
  'hr_admin SELECT hr_contract → thấy records'
);

-- ---------------------------------------------------------------------------
-- 3. developer không INSERT được hr_contract
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select throws_ok(
  $$
    insert into hr_contract(employee_id, contract_type, start_date)
    values ('e0000000-0000-0000-0000-000000000001', 'fixed_term', '2025-01-01')
  $$,
  'developer INSERT hr_contract → bị RLS chặn (hr_write_contract policy)'
);

-- ---------------------------------------------------------------------------
-- 4. UPDATE hr_contract → bị chặn (lịch sử bất biến)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select throws_ok(
  $$
    update hr_contract
    set notes = 'sửa lại'
    where id = 'c0000000-0000-0000-0000-000000000001'
  $$,
  'UPDATE hr_contract bị chặn (no_update_contract policy) — lịch sử bất biến'
);

select * from finish();
rollback;
