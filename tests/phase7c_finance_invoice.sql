-- ============================================================
-- Phase 7c: Invoice Issue Tests
-- ============================================================

begin;

select plan(5);

set local role to postgres;

-- Setup
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, budget_amount, status)
values ('proj1', 'c1', 'Project Alpha', 'fixed_price', 100000000, 'active');

-- Milestone accepted (có budget_amount)
insert into project_milestone(id, project_id, name, status, budget_amount, accepted_at, accepted_by, created_by)
values (
  'm1', 'proj1', 'Milestone 1', 'accepted',
  50000000, now(), '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000004'
);

-- ---------------------------------------------------------------------------
-- 1. developer gọi issue_invoice → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select issue_invoice(
      'proj1'::uuid,
      array['m1'::uuid],
      null, null, 0.1, null, null
    )
  $$,
  '%FORBIDDEN%',
  'developer gọi issue_invoice → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. finance_admin issue invoice với amount = 0 (không có milestone/worklog hợp lệ) → ZERO_AMOUNT
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select throws_like(
  $$
    select issue_invoice(
      'proj1'::uuid,
      null,               -- không có milestone
      '2020-01-01'::date, -- kỳ không có worklog
      '2020-01-31'::date,
      0.1, null, null
    )
  $$,
  '%ZERO_AMOUNT%',
  'finance_admin issue invoice khi không có dữ liệu hợp lệ → ZERO_AMOUNT'
);

-- ---------------------------------------------------------------------------
-- 3. finance_admin tạo invoice từ milestone accepted → thành công
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select issue_invoice(
      'proj1'::uuid,
      array['m1'::uuid],
      null, null, 0.1, null, 'Invoice tháng 3'
    )
  $$,
  'finance_admin issue_invoice từ milestone accepted → thành công'
);

-- ---------------------------------------------------------------------------
-- 4. invoice_number được auto-generate (không rỗng)
-- ---------------------------------------------------------------------------
set local role to postgres;

select ok(
  (
    select invoice_number from finance_invoice
    where project_id = 'proj1'
    order by created_at desc
    limit 1
  ) is not null,
  'invoice_number được auto-generate (không null)'
);

-- ---------------------------------------------------------------------------
-- 5. UPDATE trực tiếp invoice đã issued → trigger raise exception INVOICE_LOCKED
-- ---------------------------------------------------------------------------
select throws_like(
  $$
    update finance_invoice
    set amount = 1
    where project_id = 'proj1'
      and status = 'issued'
  $$,
  '%INVOICE_LOCKED%',
  'UPDATE trực tiếp invoice đã issued → trigger raise exception INVOICE_LOCKED'
);

select * from finish();
rollback;
