# Phase 7: Billing & Invoice

> **Mục tiêu phase:** Budget tracking thực tế, milestone acceptance, sinh invoice từ worklog approved/milestone, ghi nhận payment và reconciliation với SoD.

**Dependency:** Phase 5d (timesheet locked, worklog approved), Phase 3c (milestone), Phase 3e (rate_snapshot trong allocation).  
**Ước lượng tổng:** 10–15 giờ.

---

## Checklist tổng quan

- [ ] 7a. Budget tracking thực tế (actual vs budget)
- [ ] 7b. Milestone acceptance flow
- [ ] 7c. Invoice sinh và phát hành
- [ ] 7d. Payment và reconciliation

---

## 7a. Budget tracking thực tế

**Mục tiêu:** Project hiển thị budget vs actual cost tính từ worklog billable đã approved × rate_snapshot.

### Việc làm

**Migration `supabase migration new view_project_cost`:**
```sql
-- View tính actual cost per project
-- Dùng rate_snapshot từ project_allocation vì rate nhân sự có thể thay đổi sau khi approve
create view finance_project_cost_summary as
  select
    wl.project_id,
    p.name as project_name,
    p.budget_amount,
    p.budget_currency,
    sum(
      wl.hours *
      -- Lấy hourly rate từ rate_snapshot của allocation tương ứng
      coalesce(
        (
          select (elem ->> 'amount')::numeric
          from jsonb_array_elements(pa.rate_snapshot) elem
          where elem ->> 'rate_type' = 'hourly'
          limit 1
        ),
        0
      )
    ) as actual_cost,
    p.budget_currency as actual_currency,
    round(
      sum(wl.hours * coalesce(
        (select (elem ->> 'amount')::numeric from jsonb_array_elements(pa.rate_snapshot) elem
         where elem ->> 'rate_type' = 'hourly' limit 1), 0
      )) / nullif(p.budget_amount, 0) * 100, 2
    ) as budget_utilization_pct
  from work_worklog wl
  join project_project p on p.id = wl.project_id
  left join project_allocation pa on pa.project_id = wl.project_id
    and pa.employee_id = wl.employee_id
    and pa.status = 'approved'
  where wl.is_billable = true
    and wl.status = 'approved'
  group by wl.project_id, p.name, p.budget_amount, p.budget_currency;

-- RLS: chỉ pm/finance/company_owner xem
-- (view kế thừa RLS của base tables — kiểm tra lại behavior trong Supabase)
```

> **Lưu ý:** View trong Supabase có thể không tự động kế thừa RLS của base table nếu dùng `security invoker`. Cần test thực tế hoặc tạo function `security definer` để đọc view này.

**pgTAP test `tests/finance_project_cost.sql`:**
- [ ] `developer` SELECT `finance_project_cost_summary` → 0 rows (kiểm tra RLS hoạt động).
- [ ] `finance_admin` SELECT → thấy records với actual_cost tính đúng.

**Frontend:**
- [ ] Widget "Budget vs Actual" trên trang chi tiết project.
- [ ] Progress bar: actual_cost / budget_amount.
- [ ] Warning nếu `budget_utilization_pct > 90`.

### Definition of Done

- [ ] Actual cost cập nhật sau khi worklog approved.
- [ ] `developer` không SELECT được view này.
- [ ] Tính đúng: 10h × 150,000 VND/h = 1,500,000 VND.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `finance_project_cost_summary` | View |

### Ước lượng: 2–3 giờ

---

## 7b. Milestone acceptance flow

**Mục tiêu:** PM gửi nghiệm thu milestone → director accept/reject; audit log đầy đủ.

### Việc làm

**Migration `supabase migration new rpc_milestone_acceptance`:**
```sql
-- Thêm field vào project_milestone (nếu chưa có từ Phase 3c)
alter table project_milestone
  add column if not exists submitted_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references auth.users,
  add column if not exists reject_reason text;

-- Update status enum nếu cần
-- (nếu milestone_status đã có 'submitted', 'accepted', 'rejected' từ Phase 3c thì skip)

-- RPC submit_milestone_acceptance
create or replace function submit_milestone_acceptance(p_milestone_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_milestone project_milestone;
  v_caller_proj_role text;
begin
  select * into v_milestone from project_milestone where id = p_milestone_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  v_caller_proj_role := auth.user_project_role(v_milestone.project_id);

  if v_caller_proj_role != 'pm' and auth.jwt() ->> 'role' not in ('company_owner') then
    raise exception 'FORBIDDEN' using hint = 'Chỉ pm được submit nghiệm thu milestone.';
  end if;

  if v_milestone.status != 'open' then
    raise exception 'INVALID_STATE' using hint = 'Milestone phải ở trạng thái open.';
  end if;

  update project_milestone
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_milestone_id;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'project_milestone', p_milestone_id, 'RPC:submit_acceptance', null);
end;
$$;

-- RPC accept_milestone
create or replace function accept_milestone(p_milestone_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' not in ('director', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  update project_milestone
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid(), updated_at = now()
  where id = p_milestone_id and status = 'submitted';

  if not found then raise exception 'INVALID_STATE'; end if;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'project_milestone', p_milestone_id, 'RPC:accept_milestone', null);
end;
$$;

-- RPC reject_milestone
create or replace function reject_milestone(p_milestone_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' not in ('director', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  update project_milestone
  set status = 'rejected', reject_reason = p_reason, updated_at = now()
  where id = p_milestone_id and status = 'submitted';

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'project_milestone', p_milestone_id, 'RPC:reject_milestone',
          jsonb_build_object('reason', p_reason));
end;
$$;
```

**pgTAP test `tests/milestone_acceptance.sql`:**
- [ ] `developer` gọi `submit_milestone_acceptance` → FORBIDDEN.
- [ ] `pm` submit milestone `open` → status `submitted`.
- [ ] `director` accept `submitted` → status `accepted`, audit log.
- [ ] `director` accept milestone đã `accepted` (lần 2) → không found (idempotent-ish).

**Frontend:**
- [ ] Tab Milestones trên project: nút "Gửi nghiệm thu" (chỉ pm).
- [ ] `director` thấy nút "Accept"/"Reject" với form lý do.
- [ ] Status badge: open / submitted / accepted / rejected.

### Definition of Done

- [ ] Milestone qua đủ luồng: open → submitted → accepted.
- [ ] Audit log ghi đủ actor, action.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `submit_milestone_acceptance()` | RPC |
| `accept_milestone()` | RPC |
| `reject_milestone()` | RPC |

### Ước lượng: 2–3 giờ

---

## 7c. Invoice sinh và phát hành

**Mục tiêu:** Finance sinh invoice từ milestone accepted hoặc worklog billable; không sửa trực tiếp sau phát hành.

### Việc làm

**Migration `supabase migration new finance_invoice`:**
```sql
create type invoice_status as enum ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'voided');

-- Sequence cho invoice number
create sequence finance_invoice_number_seq start 1;

create table finance_invoice (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text unique not null default 'INV-' || to_char(nextval('finance_invoice_number_seq'), 'FM00000'),
  project_id      uuid not null references project_project,
  client_id       uuid not null references project_client,
  status          invoice_status not null default 'draft',
  amount          numeric(18,4) not null,
  tax_amount      numeric(18,4) not null default 0,
  total_amount    numeric(18,4) generated always as (amount + tax_amount) stored,
  currency        char(3) not null default 'VND',
  due_date        date,
  issued_at       timestamptz,
  issued_by       uuid references auth.users,
  source_snapshot jsonb not null, -- snapshot milestone/worklog dùng để tính
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  updated_at      timestamptz not null default now(),
  version         integer not null default 1
);

create table finance_invoice_line (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references finance_invoice on delete cascade,
  description  text not null,
  quantity     numeric(10,2) not null default 1,
  unit_price   numeric(18,4) not null,
  line_total   numeric(18,4) generated always as (quantity * unit_price) stored,
  source_type  text, -- 'milestone' | 'worklog'
  source_id    uuid
);

alter table finance_invoice enable row level security;
alter table finance_invoice_line enable row level security;

create policy "finance_read_invoice" on finance_invoice for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'director', 'auditor')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = finance_invoice.project_id
        and pm.user_id = auth.uid()
        and pm.project_role = 'pm'
        and pm.status = 'active'
    )
  );

-- Không INSERT/UPDATE trực tiếp
create policy "no_direct_invoice" on finance_invoice for all
  using (false) with check (false);

create policy "finance_read_invoice_line" on finance_invoice_line for select
  using (
    exists (
      select 1 from finance_invoice fi
      where fi.id = finance_invoice_line.invoice_id
        and auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'director', 'auditor')
    )
  );

-- Trigger chặn UPDATE trực tiếp sau khi issued
create or replace function fn_prevent_issued_invoice_update()
returns trigger language plpgsql as $$
begin
  if old.status in ('issued', 'partially_paid', 'paid') then
    raise exception 'INVOICE_LOCKED'
      using hint = 'Invoice đã phát hành không thể sửa trực tiếp. Dùng credit note.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_invoice_update
  before update on finance_invoice
  for each row execute function fn_prevent_issued_invoice_update();

-- RPC issue_invoice
create or replace function issue_invoice(
  p_project_id    uuid,
  p_milestone_ids uuid[],  -- optional: danh sách milestone accepted
  p_period_start  date,    -- optional: lấy worklog trong kỳ
  p_period_end    date,
  p_tax_rate      numeric default 0.1,
  p_due_date      date default null,
  p_notes         text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invoice_id  uuid;
  v_amount      numeric := 0;
  v_source_snap jsonb := '[]'::jsonb;
  v_client_id   uuid;
  v_line        record;
begin
  if auth.jwt() ->> 'role' not in ('finance_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  select client_id into v_client_id from project_project where id = p_project_id;

  -- Tính amount từ milestone accepted
  if p_milestone_ids is not null then
    for v_line in
      select id, name, budget_amount from project_milestone
      where id = any(p_milestone_ids)
        and status = 'accepted'
        and project_id = p_project_id
    loop
      v_amount := v_amount + coalesce(v_line.budget_amount, 0);
      v_source_snap := v_source_snap || jsonb_build_object(
        'type', 'milestone', 'id', v_line.id, 'name', v_line.name, 'amount', v_line.budget_amount
      );
    end loop;
  end if;

  -- Tính amount từ billable worklog trong kỳ
  if p_period_start is not null then
    -- (simplified: dùng view finance_project_cost_summary hoặc tính trực tiếp)
    select coalesce(sum(
      wl.hours * coalesce(
        (select (elem ->> 'amount')::numeric from jsonb_array_elements(pa.rate_snapshot) elem
         where elem ->> 'rate_type' = 'hourly' limit 1), 0
      )
    ), 0) into v_amount
    from work_worklog wl
    join project_allocation pa on pa.project_id = wl.project_id and pa.employee_id = wl.employee_id and pa.status = 'approved'
    where wl.project_id = p_project_id
      and wl.is_billable = true
      and wl.status = 'approved'
      and wl.logged_date between p_period_start and p_period_end;

    v_source_snap := v_source_snap || jsonb_build_object(
      'type', 'worklog', 'period_start', p_period_start, 'period_end', p_period_end, 'amount', v_amount
    );
  end if;

  if v_amount <= 0 then
    raise exception 'ZERO_AMOUNT' using hint = 'Không có dữ liệu hợp lệ để sinh invoice.';
  end if;

  -- Tạo invoice
  insert into finance_invoice(
    project_id, client_id, status, amount, tax_amount, currency,
    due_date, issued_at, issued_by, source_snapshot, notes, created_by
  )
  values (
    p_project_id, v_client_id, 'issued', v_amount, v_amount * p_tax_rate, 'VND',
    p_due_date, now(), auth.uid(), v_source_snap, p_notes, auth.uid()
  )
  returning id into v_invoice_id;

  -- Audit
  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_invoice', v_invoice_id, 'RPC:issue_invoice',
          jsonb_build_object('amount', v_amount, 'project_id', p_project_id));

  return v_invoice_id;
end;
$$;
```

**pgTAP test `tests/finance_invoice.sql`:**
- [ ] `developer` gọi `issue_invoice` → FORBIDDEN.
- [ ] `finance_admin` issue invoice với amount = 0 → ZERO_AMOUNT.
- [ ] UPDATE trực tiếp invoice đã `issued` → trigger raise exception.
- [ ] `finance_admin` tạo invoice → invoice_number auto-generated theo sequence.

**Frontend trang `/finance/invoices`:**
- [ ] Danh sách invoice: number, project, client, amount, status, due_date.
- [ ] Form tạo invoice: chọn project, milestone (multi-select) hoặc kỳ worklog.
- [ ] Xem chi tiết invoice: breakdown lines, source snapshot.
- [ ] Badge "Overdue" nếu `due_date < today` và status != paid.

### Definition of Done

- [ ] Invoice sinh đúng amount từ milestone accepted.
- [ ] Trigger chặn UPDATE trực tiếp invoice đã issued.
- [ ] Invoice number auto-increment đúng thứ tự.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `finance_invoice` | Table |
| `finance_invoice_line` | Table |
| `finance_invoice_number_seq` | Sequence |
| `issue_invoice()` | RPC |

### Ước lượng: 3–4 giờ

---

## 7d. Payment và reconciliation

**Mục tiêu:** Ghi nhận payment từ client; đối soát invoice; SoD: người tạo invoice ≠ người reconcile.

### Việc làm

**Migration `supabase migration new finance_payment`:**
```sql
create type payment_status as enum ('pending', 'confirmed', 'failed', 'refunded');

create table finance_payment (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references finance_invoice,
  amount          numeric(18,4) not null check (amount > 0),
  currency        char(3) not null default 'VND',
  payment_date    date not null,
  external_ref    text unique, -- idempotency key: mã GD ngân hàng
  fee             numeric(18,4) not null default 0,
  notes           text,
  status          payment_status not null default 'pending',
  recorded_by     uuid references auth.users,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  version         integer not null default 1
);

alter table finance_payment enable row level security;

create policy "finance_read_payment" on finance_payment for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'director', 'auditor'));

create policy "no_direct_payment" on finance_payment for all
  using (false) with check (false);

-- RPC record_payment
create or replace function record_payment(
  p_invoice_id   uuid,
  p_amount       numeric,
  p_payment_date date,
  p_external_ref text,
  p_fee          numeric default 0,
  p_notes        text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invoice      finance_invoice;
  v_payment_id   uuid;
  v_total_paid   numeric;
begin
  if auth.jwt() ->> 'role' not in ('finance_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_invoice from finance_invoice where id = p_invoice_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_invoice.status in ('paid', 'voided') then
    raise exception 'INVALID_STATE' using hint = 'Invoice đã thanh toán hoặc bị hủy.';
  end if;

  -- Idempotency: cùng external_ref → reject
  if p_external_ref is not null and exists (
    select 1 from finance_payment where external_ref = p_external_ref
  ) then
    raise exception 'DUPLICATE_PAYMENT' using hint = 'Mã giao dịch đã tồn tại.';
  end if;

  insert into finance_payment(invoice_id, amount, currency, payment_date, external_ref, fee, notes, recorded_by, created_by)
  values (p_invoice_id, p_amount, v_invoice.currency, p_payment_date, p_external_ref, p_fee, p_notes, auth.uid(), auth.uid())
  returning id into v_payment_id;

  -- Cập nhật invoice status
  select coalesce(sum(amount), 0) into v_total_paid
  from finance_payment where invoice_id = p_invoice_id and status = 'confirmed';
  v_total_paid := v_total_paid + p_amount;

  update finance_invoice set
    status = case
      when v_total_paid >= total_amount then 'paid'
      when v_total_paid > 0 then 'partially_paid'
      else status
    end,
    updated_at = now()
  where id = p_invoice_id;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_payment', v_payment_id, 'RPC:record_payment',
          jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount));

  return v_payment_id;
end;
$$;

-- RPC reconcile_invoice
create or replace function reconcile_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_invoice finance_invoice;
begin
  if auth.jwt() ->> 'role' not in ('finance_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_invoice from finance_invoice where id = p_invoice_id;

  -- SoD: người reconcile không phải người tạo invoice
  if v_invoice.issued_by = auth.uid() then
    raise exception 'SOD_VIOLATION'
      using hint = 'Người phát hành invoice không thể tự reconcile.';
  end if;

  -- Xác nhận tất cả payment của invoice
  update finance_payment set status = 'confirmed'
  where invoice_id = p_invoice_id and status = 'pending';

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_invoice', p_invoice_id, 'RPC:reconcile_invoice', null);
end;
$$;
```

**pgTAP test `tests/finance_payment.sql`:**
- [ ] `record_payment` với cùng `external_ref` lần 2 → DUPLICATE_PAYMENT.
- [ ] `record_payment` amount >= total_amount → invoice status = `paid`.
- [ ] `record_payment` amount < total_amount → `partially_paid`.
- [ ] `reconcile_invoice` bởi người tạo invoice → SOD_VIOLATION.
- [ ] `developer` gọi `record_payment` → FORBIDDEN.

**Frontend trang `/finance/invoices/[id]`:**
- [ ] Tab "Payments": danh sách payment; form ghi nhận payment mới.
- [ ] Nút "Reconcile" (chỉ hiện với `finance_admin` và không phải người tạo invoice).
- [ ] Progress bar: total_paid / total_amount.

### Definition of Done

- [ ] Payment ghi nhận → invoice status cập nhật đúng.
- [ ] Ghi 2 lần cùng `external_ref` bị reject.
- [ ] SoD reconcile test pass.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `finance_payment` | Table |
| `record_payment()` | RPC |
| `reconcile_invoice()` | RPC |

### Ước lượng: 3–5 giờ

---

## Kết quả Phase 7

Sau khi hoàn thành phase này:
- Budget tracking thực tế với actual cost từ approved worklog.
- Milestone acceptance flow đầy đủ.
- Invoice sinh tự động với snapshot; không sửa được sau khi issued.
- Payment ghi nhận idempotent; SoD reconciliation.
- Dữ liệu approved hours sẵn sàng cho Phase 8 (payroll export).
