-- ============================================================
-- Phase 7d: Payment & Reconciliation Tests
-- ============================================================

begin;

select plan(6);

set local role to postgres;

-- Setup: invoice issued (amount=10,000,000, tax=1,000,000, total=11,000,000)
insert into project_client(id, name) values ('c1', 'Client X');
insert into project_project(id, client_id, name, billing_type, status)
values ('proj1', 'c1', 'Project Alpha', 'fixed_price', 'active');

insert into finance_invoice(
  id, project_id, client_id, status,
  amount, tax_amount, currency, due_date,
  issued_at, issued_by, source_snapshot, created_by
)
values (
  'inv1', 'proj1', 'c1', 'issued',
  10000000, 1000000, 'VND', current_date + 30,
  now(), '00000000-0000-0000-0000-000000000005', -- issued_by = finance_admin uid=005
  '{"type": "milestone"}'::jsonb,
  '00000000-0000-0000-0000-000000000005'
);

-- ---------------------------------------------------------------------------
-- 1. developer gọi record_payment → FORBIDDEN
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000010", "role": "developer"}';

select throws_like(
  $$
    select record_payment(
      'inv1'::uuid, 5000000, current_date, 'BANK-TX-001', 0, null
    )
  $$,
  '%FORBIDDEN%',
  'developer gọi record_payment → FORBIDDEN'
);

-- ---------------------------------------------------------------------------
-- 2. record_payment amount < total_amount → invoice status = partially_paid
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000006", "role": "finance_admin"}';

select lives_ok(
  $$
    select record_payment(
      'inv1'::uuid, 5000000, current_date, 'BANK-TX-001', 0, 'Thanh toán đợt 1'
    )
  $$,
  'record_payment amount < total → thành công'
);

set local role to postgres;
select is(
  (select status from finance_invoice where id = 'inv1'),
  'partially_paid'::invoice_status,
  'Invoice status = partially_paid sau khi thanh toán một phần'
);

-- ---------------------------------------------------------------------------
-- 3. record_payment cùng external_ref lần 2 → DUPLICATE_PAYMENT
-- ---------------------------------------------------------------------------
set local role to authenticator;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000006", "role": "finance_admin"}';

select throws_like(
  $$
    select record_payment(
      'inv1'::uuid, 1000000, current_date, 'BANK-TX-001', 0, null  -- same external_ref
    )
  $$,
  '%DUPLICATE_PAYMENT%',
  'record_payment cùng external_ref lần 2 → DUPLICATE_PAYMENT (idempotency)'
);

-- ---------------------------------------------------------------------------
-- 4. record_payment amount >= total_amount → invoice status = paid
-- ---------------------------------------------------------------------------
select lives_ok(
  $$
    select record_payment(
      'inv1'::uuid, 6000000, current_date, 'BANK-TX-002', 0, 'Thanh toán đợt 2 (đủ)'
    )
  $$,
  'record_payment amount đủ → thành công'
);

-- ---------------------------------------------------------------------------
-- 5. reconcile_invoice bởi người tạo invoice (issued_by = uid=005) → SOD_VIOLATION
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "finance_admin"}';

select throws_like(
  $$
    select reconcile_invoice('inv1'::uuid)
  $$,
  '%SOD_VIOLATION%',
  'reconcile_invoice bởi người tạo invoice → SOD_VIOLATION'
);

-- ---------------------------------------------------------------------------
-- 6. reconcile_invoice bởi người khác → thành công
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000006", "role": "finance_admin"}';

select lives_ok(
  $$
    select reconcile_invoice('inv1'::uuid)
  $$,
  'reconcile_invoice bởi người khác (không phải issued_by) → thành công'
);

select * from finish();
rollback;
