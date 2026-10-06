-- ============================================================
-- Phase 2a: HR Employee RLS Tests
-- ============================================================

begin;

select plan(4);

set local role to postgres;

-- Setup
insert into hr_employee(id, full_name, type, status)
values
  ('e0000000-0000-0000-0000-000000000001', 'Nguyen Van A', 'full_time', 'active'),
  ('e0000000-0000-0000-0000-000000000002', 'Tran Thi B',   'part_time', 'active');

-- ---------------------------------------------------------------------------
-- 1. developer SELECT hr_employee → thấy records (mọi authenticated user)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "developer"}';

select ok(
  (select count(*)::int from hr_employee) >= 2,
  'developer SELECT hr_employee → thấy records (auth_read_employee policy)'
);

-- ---------------------------------------------------------------------------
-- 2. developer UPDATE hr_employee → bị RLS chặn
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    update hr_employee
    set department = 'Engineering'
    where id = 'e0000000-0000-0000-0000-000000000001'
  $$,
  'developer UPDATE hr_employee → bị RLS chặn (hr_admin_update_employee policy)'
);

-- ---------------------------------------------------------------------------
-- 3. hr_admin INSERT hr_employee → thành công
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select lives_ok(
  $$
    insert into hr_employee(id, full_name, type, status)
    values ('e0000000-0000-0000-0000-000000000099', 'New Employee', 'full_time', 'onboarding')
  $$,
  'hr_admin INSERT hr_employee → thành công'
);

-- ---------------------------------------------------------------------------
-- 4. DELETE hr_employee → bị RLS chặn (no_delete_employee)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$
    delete from hr_employee where id = 'e0000000-0000-0000-0000-000000000001'
  $$,
  'DELETE hr_employee bị RLS chặn → dùng status terminated thay thế'
);

select * from finish();
rollback;
