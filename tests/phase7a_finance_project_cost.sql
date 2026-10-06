-- ============================================================
-- Phase 7a: Finance Project Cost Summary Tests
-- ============================================================

begin;

select plan(3);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, budget_amount, status)
values ('proj1', 'c1', 'Project Alpha', 'hourly', 100000000, 'active');

insert into hr_employee(id, user_id, full_name, type, status)
values ('e1', '00000000-0000-0000-0000-000000000010', 'Dev A', 'full_time', 'active');

-- Allocation approved với rate_snapshot
insert into project_allocation(id, project_id, employee_id, role, allocation_percent, start_date, status, rate_snapshot, approved_by, approved_at, created_by)
values (
  'a1', 'proj1', 'e1', 'developer', 100, current_date - 30, 'approved',
  '[{"rate_type": "hourly", "amount": 150000, "currency": "VND"}]'::jsonb,
  '00000000-0000-0000-0000-000000000003',
  now(),
  '00000000-0000-0000-0000-000000000004'
);

insert into work_issue(id, project_id, type, title, status, priority, created_by)
values ('i1', 'proj1', 'task', 'Feature A', 'done', 'high', '00000000-0000-0000-0000-000000000010');

-- Worklog approved: 10 giờ billable
insert into work_worklog(id, issue_id, project_id, employee_id, logged_date, hours, is_billable, status, created_by)
values ('wl1', 'i1', 'proj1', 'e1', current_date - 5, 10, true, 'approved', '00000000-0000-0000-0000-000000000010');

-- ---------------------------------------------------------------------------
-- 1. developer SELECT finance_project_cost_summary → 0 rows (RLS chặn)
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

-- Note: view kế thừa RLS từ base tables; developer không đọc được worklog của project khác
-- Nhưng theo spec, view này dành riêng cho finance/pm/owner
-- Test bằng cách kiểm tra với user không có quyền finance
select is(
  (
    select count(*)::int from finance_project_cost_summary
    where project_id = 'proj1'
  ),
  0,
  'developer SELECT finance_project_cost_summary → 0 rows (không có quyền finance)'
);

-- ---------------------------------------------------------------------------
-- 2. finance_admin SELECT → thấy records với actual_cost tính đúng
--    10h × 150,000 VND/h = 1,500,000 VND
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select ok(
  (
    select actual_cost from finance_project_cost_summary
    where project_id = 'proj1'
  ) = 1500000,
  'finance_admin SELECT: actual_cost = 10h × 150,000 = 1,500,000 VND (đúng)'
);

-- ---------------------------------------------------------------------------
-- 3. Worklog non-billable không được tính vào actual_cost
-- ---------------------------------------------------------------------------
set local role to postgres;

-- Thêm 5 giờ non-billable
insert into work_worklog(id, issue_id, project_id, employee_id, logged_date, hours, is_billable, status, created_by)
values ('wl2', 'i1', 'proj1', 'e1', current_date - 3, 5, false, 'approved', '00000000-0000-0000-0000-000000000010');

set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

-- Vẫn phải là 1,500,000 (không tăng thêm từ non-billable)
select ok(
  (
    select actual_cost from finance_project_cost_summary
    where project_id = 'proj1'
  ) = 1500000,
  'Worklog non-billable không được tính vào actual_cost (vẫn = 1,500,000)'
);

select * from finish();
rollback;
