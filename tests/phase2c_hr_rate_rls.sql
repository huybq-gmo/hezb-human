-- ============================================================
-- Phase 2c: Rate Effective-Dated Tests
-- ============================================================

begin;

select plan(6);

set local role to postgres;

-- Setup employee
insert into hr_employee(id, full_name, type, status)
values ('e0000000-0000-0000-0000-000000000001', 'Nguyen Van A', 'full_time', 'active');

-- ---------------------------------------------------------------------------
-- 1. developer SELECT hr_employee_rate → expect 0 rows
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select is(
  (select count(*)::int from hr_employee_rate),
  0,
  'developer SELECT hr_employee_rate → expect 0 rows (sensitive_read_rate RLS)'
);

-- ---------------------------------------------------------------------------
-- 2. hr_admin SELECT → thấy records
-- ---------------------------------------------------------------------------
set local role to postgres;
insert into hr_employee_rate(employee_id, rate_type, amount, currency, effective_from)
values ('e0000000-0000-0000-0000-000000000001', 'hourly', 150000, 'VND', '2024-01-01');

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select ok(
  (select count(*)::int from hr_employee_rate) > 0,
  'hr_admin SELECT hr_employee_rate → thấy records'
);

-- ---------------------------------------------------------------------------
-- 3. INSERT 2 rate cùng loại chồng lấn → trigger RATE_OVERLAP
-- ---------------------------------------------------------------------------
set local role to postgres;
insert into hr_employee_rate(employee_id, rate_type, amount, currency, effective_from, effective_to)
values ('e0000000-0000-0000-0000-000000000001', 'monthly', 20000000, 'VND', '2024-01-01', '2024-06-30');

select throws_like(
  $$
    insert into hr_employee_rate(employee_id, rate_type, amount, currency, effective_from)
    values ('e0000000-0000-0000-0000-000000000001', 'monthly', 25000000, 'VND', '2024-04-01')
  $$,
  '%RATE_OVERLAP%',
  'INSERT 2 rate cùng loại chồng lấn → trigger raise exception RATE_OVERLAP'
);

-- ---------------------------------------------------------------------------
-- 4. get_rate_at() tại 2024-03-15 → 150,000 VND/h
-- ---------------------------------------------------------------------------
set local role to postgres;
insert into hr_employee_rate(employee_id, rate_type, amount, currency, effective_from)
values ('e0000000-0000-0000-0000-000000000001', 'hourly', 200000, 'VND', '2024-07-01');

select is(
  (
    select amount from get_rate_at(
      'e0000000-0000-0000-0000-000000000001', '2024-03-15'
    ) where rate_type = 'hourly' limit 1
  ),
  150000::numeric,
  'get_rate_at(2024-03-15) trả hourly rate = 150,000 VND (đúng)'
);

-- ---------------------------------------------------------------------------
-- 5. get_rate_at() tại 2024-08-01 → 200,000 VND/h (rate mới)
-- ---------------------------------------------------------------------------
select is(
  (
    select amount from get_rate_at(
      'e0000000-0000-0000-0000-000000000001', '2024-08-01'
    ) where rate_type = 'hourly' limit 1
  ),
  200000::numeric,
  'get_rate_at(2024-08-01) trả hourly rate mới = 200,000 VND (đúng)'
);

-- ---------------------------------------------------------------------------
-- 6. UPDATE hr_employee_rate → bị chặn (no_update_rate policy)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select throws_ok(
  $$
    update hr_employee_rate set amount = 999999
    where employee_id = 'e0000000-0000-0000-0000-000000000001'
  $$,
  'UPDATE hr_employee_rate → bị chặn (no_update_rate policy)'
);

select * from finish();
rollback;
