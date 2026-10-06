-- ============================================================
-- Phase 3e: Team Allocation Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 'active');

insert into hr_employee(id, user_id, full_name, type, status)
values ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A', 'full_time', 'active');

insert into hr_employee_rate(employee_id, rate_type, amount, currency, effective_from)
values ('e1', 'hourly', 150000, 'VND', '2024-01-01');

insert into project_allocation(id, project_id, employee_id, role, allocation_percent, start_date, status, created_by)
values ('a1', 'proj1', 'e1', 'developer', 100, current_date, 'pending', '00000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------------
-- 1. INSERT project_membership trực tiếp → bị RLS chặn
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_ok(
  $$
    insert into project_membership(project_id, user_id, project_role, granted_by)
    values ('proj1', '00000000-0000-0000-0000-000000000010', 'developer', '00000000-0000-0000-0000-000000000004')
  $$,
  'INSERT project_membership trực tiếp → bị RLS chặn (no_direct_insert_membership)'
);

-- ---------------------------------------------------------------------------
-- 2. developer gọi approve_allocation → FORBIDDEN
-- ---------------------------------------------------------------------------
select throws_like(
  $$
    select approve_allocation('a1'::uuid)
  $$,
  '%FORBIDDEN%',
  'developer gọi approve_allocation → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 3. hr_admin approve_allocation → thành công
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "hr_admin"}';

select lives_ok(
  $$
    select approve_allocation('a1'::uuid)
  $$,
  'hr_admin approve_allocation → thành công'
);

-- ---------------------------------------------------------------------------
-- 4. Sau approve: membership được tạo tự động
-- ---------------------------------------------------------------------------
set local role to postgres;

select ok(
  exists (
    select 1 from project_membership
    where project_id = 'proj1'
      and user_id = '00000000-0000-0000-0000-000000000010'
  ),
  'Sau approve_allocation: project_membership được tạo tự động'
);

-- ---------------------------------------------------------------------------
-- 5. Sau approve: rate_snapshot không rỗng
-- ---------------------------------------------------------------------------
select ok(
  (
    select rate_snapshot is not null and jsonb_array_length(rate_snapshot) > 0
    from project_allocation where id = 'a1'
  ),
  'Sau approve_allocation: rate_snapshot không rỗng, chứa rate hiện tại'
);

select * from finish();
rollback;
