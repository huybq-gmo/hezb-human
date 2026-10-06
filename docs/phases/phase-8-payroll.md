# Phase 8: Payroll

> **Mục tiêu phase:** Quản lý kỳ lương, tính gross pay với rule engine cấu hình được, approval 2 cấp, lock kỳ và nhân sự xem payslip của mình.

**Dependency:** Phase 5d (timesheet locked, approved hours), Phase 2c (rate effective-dated).  
**Ước lượng tổng:** 9–13 giờ.

---

## Checklist tổng quan

- [ ] 8a. Payroll period và export CSV approved hours
- [ ] 8b. Rule engine tính gross pay
- [ ] 8c. Approval kỳ lương và payslip

---

## 8a. Payroll period và export approved hours (CSV)

**Mục tiêu:** Mở kỳ lương; xuất CSV approved hours per employee — bước 1 trước khi có rule engine.

### Việc làm

**Migration `supabase migration new finance_payroll_period`:**
```sql
create type payroll_period_status as enum ('open', 'calculating', 'reviewed', 'approved', 'locked');

create table finance_payroll_period (
  id          uuid primary key default gen_random_uuid(),
  month       int not null check (month between 1 and 12),
  year        int not null check (year > 2020),
  status      payroll_period_status not null default 'open',
  opened_by   uuid references auth.users,
  opened_at   timestamptz not null default now(),
  locked_by   uuid references auth.users,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  constraint uq_payroll_period unique (month, year)
);

alter table finance_payroll_period enable row level security;

create policy "finance_read_payroll_period" on finance_payroll_period for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'director', 'hr_admin', 'auditor'));

create policy "no_direct_payroll_period" on finance_payroll_period for all
  using (false) with check (false);

-- Trigger chặn UPDATE kỳ đã locked
create or replace function fn_prevent_locked_payroll_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'locked' then
    raise exception 'PAYROLL_LOCKED' using hint = 'Kỳ lương đã khóa không thể thay đổi.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_locked_payroll
  before update on finance_payroll_period
  for each row execute function fn_prevent_locked_payroll_update();

-- RPC open_payroll_period
create or replace function open_payroll_period(p_month int, p_year int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_period_id uuid;
begin
  if auth.jwt() ->> 'role' not in ('finance_admin', 'company_owner', 'hr_admin') then
    raise exception 'FORBIDDEN';
  end if;

  insert into finance_payroll_period(month, year, opened_by)
  values (p_month, p_year, auth.uid())
  on conflict (month, year) do nothing
  returning id into v_period_id;

  if v_period_id is null then
    select id into v_period_id from finance_payroll_period where month = p_month and year = p_year;
  end if;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_payroll_period', v_period_id, 'RPC:open_payroll_period',
          jsonb_build_object('month', p_month, 'year', p_year));

  return v_period_id;
end;
$$;

-- RPC export_payroll_hours (trả data để frontend export CSV)
create or replace function export_payroll_hours(p_period_id uuid)
returns table(
  employee_id   uuid,
  employee_code text,
  full_name     text,
  employee_type employee_type,
  total_approved_hours numeric,
  rate_snapshot jsonb,
  period_start  date,
  period_end    date
) language plpgsql stable security definer set search_path = public as $$
declare
  v_period finance_payroll_period;
  v_period_start date;
  v_period_end   date;
begin
  if auth.jwt() ->> 'role' not in ('finance_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_period from finance_payroll_period where id = p_period_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  v_period_start := make_date(v_period.year, v_period.month, 1);
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  return query
    select
      e.id,
      e.employee_code,
      e.full_name,
      e.type,
      coalesce(sum(wl.hours), 0) as total_approved_hours,
      -- Rate tại đầu kỳ lương
      (select jsonb_agg(jsonb_build_object('rate_type', rate_type, 'amount', amount, 'currency', currency))
       from hr_employee_rate r
       where r.employee_id = e.id
         and r.effective_from <= v_period_start
         and (r.effective_to is null or r.effective_to >= v_period_start)
      ) as rate_snapshot,
      v_period_start,
      v_period_end
    from hr_employee e
    left join work_worklog wl on wl.employee_id = e.id
      and wl.status = 'approved'
      and wl.logged_date between v_period_start and v_period_end
    where e.status = 'active'
    group by e.id, e.employee_code, e.full_name, e.type;
end;
$$;
```

**pgTAP test `tests/payroll_period.sql`:**
- [ ] `developer` gọi `open_payroll_period` → FORBIDDEN.
- [ ] `developer` gọi `export_payroll_hours` → FORBIDDEN.
- [ ] `finance_admin` mở kỳ → status `open`.
- [ ] Mở cùng kỳ lần 2 → idempotent (không duplicate).
- [ ] UPDATE kỳ `locked` → trigger raise exception.

**Frontend trang `/payroll`:**
- [ ] Danh sách payroll period: tháng/năm, status, actions.
- [ ] Nút "Mở kỳ mới" → gọi `open_payroll_period`.
- [ ] Nút "Export CSV" → gọi `export_payroll_hours`, generate CSV client-side.
- [ ] CSV columns: employee_code, full_name, type, total_hours, hourly_rate, monthly_rate.

### Definition of Done

- [ ] Mở kỳ tháng → status `open`.
- [ ] Export CSV có đúng approved hours; `developer` không gọi được.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `finance_payroll_period` | Table |
| `open_payroll_period()` | RPC |
| `export_payroll_hours()` | RPC |

### Ước lượng: 2–3 giờ

---

## 8b. Rule engine tính gross pay

**Mục tiêu:** Cấu hình công thức tính lương theo loại nhân sự; đổi tham số không cần deploy lại; kết quả có snapshot đầy đủ.

> ⚠️ **Cảnh báo complexity:** Nếu logic payroll rule quá phức tạp cho PL/pgSQL, xem xét chuyển sang Edge Function. Quyết định này cần POC trước khi implement đầy đủ.

### Việc làm

**Migration `supabase migration new finance_payroll_rule`:**
```sql
create table finance_payroll_rule (
  id             uuid primary key default gen_random_uuid(),
  rule_code      text not null, -- 'VN_FULL_TIME_MONTHLY', 'VN_PART_TIME_HOURLY', etc.
  employee_type  employee_type not null,
  description    text,
  config         jsonb not null,
  -- config example:
  -- {
  --   "base_formula": "monthly_rate",          -- hoặc "hourly_rate * approved_hours"
  --   "overtime_multiplier": 1.5,
  --   "tax_brackets": [...],
  --   "insurance_rate": 0.105,
  --   "employer_insurance_rate": 0.215,
  --   "personal_deduction": 11000000,
  --   "dependent_deduction": 4400000
  -- }
  version        int not null default 1,
  effective_from date not null,
  effective_to   date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users,
  constraint uq_rule_version unique (rule_code, version)
);

-- Immutable sau khi đã dùng để tính (enforced qua trigger)
create or replace function fn_prevent_used_rule_update()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from finance_payroll_line where rule_snapshot->>'rule_id' = old.id::text) then
    raise exception 'RULE_IN_USE'
      using hint = 'Rule đã được dùng để tính lương, không thể sửa. Tạo version mới.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_used_rule_update
  before update on finance_payroll_rule
  for each row execute function fn_prevent_used_rule_update();

alter table finance_payroll_rule enable row level security;
create policy "finance_read_rule" on finance_payroll_rule for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'hr_admin', 'auditor'));
create policy "finance_write_rule" on finance_payroll_rule for insert
  with check (auth.jwt() ->> 'role' in ('company_owner', 'finance_admin'));

-- Seed rule cơ bản
insert into finance_payroll_rule(rule_code, employee_type, description, config, effective_from)
values (
  'VN_FULL_TIME_MONTHLY', 'full_time',
  'Nhân viên toàn thời gian, lương tháng, thuế TNCN VN 2024',
  '{
    "base_formula": "monthly_rate",
    "tax_brackets": [
      {"from": 0, "to": 5000000, "rate": 0.05},
      {"from": 5000000, "to": 10000000, "rate": 0.10},
      {"from": 10000000, "to": 18000000, "rate": 0.15},
      {"from": 18000000, "to": 32000000, "rate": 0.20},
      {"from": 32000000, "to": 52000000, "rate": 0.25},
      {"from": 52000000, "to": 80000000, "rate": 0.30},
      {"from": 80000000, "to": null, "rate": 0.35}
    ],
    "insurance_rate": 0.105,
    "employer_insurance_rate": 0.215,
    "personal_deduction": 11000000,
    "dependent_deduction": 4400000
  }',
  '2024-01-01'
);

-- Bảng kết quả payroll
create table finance_payroll_line (
  id              uuid primary key default gen_random_uuid(),
  period_id       uuid not null references finance_payroll_period,
  employee_id     uuid not null references hr_employee,
  gross_pay       numeric(18,4) not null,
  allowances      jsonb not null default '{}',
  deductions      jsonb not null default '{}', -- tax, insurance, etc.
  net_pay         numeric(18,4) not null,
  rule_snapshot   jsonb not null, -- snapshot của finance_payroll_rule dùng để tính
  input_snapshot  jsonb not null, -- approved_hours, rate_snapshot, tháng/năm
  calculated_at   timestamptz not null default now(),
  calculated_by   uuid references auth.users,
  created_at      timestamptz not null default now(),
  constraint uq_payroll_line unique (period_id, employee_id)
);

alter table finance_payroll_line enable row level security;

-- Finance/owner đọc tất cả; nhân sự chỉ xem payslip của mình
create policy "finance_read_payroll_line" on finance_payroll_line for select
  using (
    auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'hr_admin', 'auditor', 'director')
    or employee_id in (select id from hr_employee where user_id = auth.uid())
  );

create policy "no_direct_payroll_line" on finance_payroll_line for all
  using (false) with check (false);

-- Trigger chặn sửa payroll_line sau khi kỳ locked
create or replace function fn_prevent_locked_payroll_line_update()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from finance_payroll_period where id = old.period_id and status = 'locked') then
    raise exception 'PAYROLL_PERIOD_LOCKED';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_locked_payroll_line
  before update or delete on finance_payroll_line
  for each row execute function fn_prevent_locked_payroll_line_update();

-- RPC calculate_payroll
create or replace function calculate_payroll(p_period_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_period      finance_payroll_period;
  v_period_start date;
  v_period_end   date;
  v_emp_data    record;
  v_rule        finance_payroll_rule;
  v_gross_pay   numeric;
  v_insurance   numeric;
  v_taxable     numeric;
  v_tax         numeric;
  v_net_pay     numeric;
  v_count       int := 0;
  v_bracket     jsonb;
  v_bracket_tax numeric;
begin
  if auth.jwt() ->> 'role' not in ('finance_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_period from finance_payroll_period where id = p_period_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_period.status not in ('open', 'calculating') then
    raise exception 'INVALID_STATE';
  end if;

  v_period_start := make_date(v_period.year, v_period.month, 1);
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  -- Tính lương cho từng nhân sự active
  for v_emp_data in
    select
      e.id as employee_id,
      e.type as employee_type,
      coalesce(sum(wl.hours), 0) as approved_hours,
      (select jsonb_agg(jsonb_build_object('rate_type', rate_type, 'amount', amount))
       from hr_employee_rate r
       where r.employee_id = e.id
         and r.effective_from <= v_period_start
         and (r.effective_to is null or r.effective_to >= v_period_start)
      ) as rate_snapshot
    from hr_employee e
    left join work_worklog wl on wl.employee_id = e.id
      and wl.status = 'approved'
      and wl.logged_date between v_period_start and v_period_end
    where e.status = 'active'
    group by e.id, e.type
  loop
    -- Lấy rule phù hợp
    select * into v_rule from finance_payroll_rule
    where employee_type = v_emp_data.employee_type
      and effective_from <= v_period_start
      and (effective_to is null or effective_to >= v_period_start)
      and is_active = true
    order by effective_from desc
    limit 1;

    if v_rule is null then continue; end if;

    -- Tính gross pay (simplified)
    if v_rule.config ->> 'base_formula' = 'monthly_rate' then
      select (elem ->> 'amount')::numeric into v_gross_pay
      from jsonb_array_elements(v_emp_data.rate_snapshot) elem
      where elem ->> 'rate_type' = 'monthly'
      limit 1;
    else
      -- hourly_rate * approved_hours
      select (elem ->> 'amount')::numeric * v_emp_data.approved_hours into v_gross_pay
      from jsonb_array_elements(v_emp_data.rate_snapshot) elem
      where elem ->> 'rate_type' = 'hourly'
      limit 1;
    end if;

    v_gross_pay := coalesce(v_gross_pay, 0);

    -- Tính bảo hiểm
    v_insurance := v_gross_pay * (v_rule.config ->> 'insurance_rate')::numeric;

    -- Tính thuế TNCN (progressive)
    v_taxable := v_gross_pay - v_insurance
               - (v_rule.config ->> 'personal_deduction')::numeric;
    v_taxable := greatest(v_taxable, 0);

    v_tax := 0;
    for v_bracket in select * from jsonb_array_elements(v_rule.config -> 'tax_brackets')
    loop
      declare
        v_from numeric := (v_bracket ->> 'from')::numeric;
        v_to   numeric := coalesce((v_bracket ->> 'to')::numeric, 999999999);
        v_rate numeric := (v_bracket ->> 'rate')::numeric;
      begin
        if v_taxable > v_from then
          v_bracket_tax := (least(v_taxable, v_to) - v_from) * v_rate;
          v_tax := v_tax + v_bracket_tax;
        end if;
      end;
    end loop;

    v_net_pay := v_gross_pay - v_insurance - v_tax;

    -- Upsert payroll_line
    insert into finance_payroll_line(
      period_id, employee_id, gross_pay, allowances, deductions, net_pay,
      rule_snapshot, input_snapshot, calculated_by
    )
    values (
      p_period_id,
      v_emp_data.employee_id,
      v_gross_pay,
      '{}',
      jsonb_build_object(
        'insurance', v_insurance,
        'income_tax', v_tax
      ),
      v_net_pay,
      to_jsonb(v_rule),
      jsonb_build_object(
        'approved_hours', v_emp_data.approved_hours,
        'rate_snapshot', v_emp_data.rate_snapshot,
        'period_start', v_period_start,
        'period_end', v_period_end
      ),
      auth.uid()
    )
    on conflict (period_id, employee_id) do update
    set gross_pay = excluded.gross_pay,
        deductions = excluded.deductions,
        net_pay = excluded.net_pay,
        rule_snapshot = excluded.rule_snapshot,
        input_snapshot = excluded.input_snapshot,
        calculated_at = now(),
        calculated_by = auth.uid();

    v_count := v_count + 1;
  end loop;

  -- Update period status
  update finance_payroll_period set status = 'calculating' where id = p_period_id;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_payroll_period', p_period_id, 'RPC:calculate_payroll',
          jsonb_build_object('employee_count', v_count));

  return v_count;
end;
$$;
```

**pgTAP test `tests/payroll_rule.sql`:**
- [ ] `developer` gọi `calculate_payroll` → FORBIDDEN.
- [ ] Tính lương nhân sự hourly: 160h × 100,000 = 16,000,000 gross; insurance + tax đúng.
- [ ] Sửa rule đã dùng để tính → RULE_IN_USE.
- [ ] Tính lại cùng kỳ → upsert (không duplicate record).
- [ ] Kỳ locked → trigger chặn update payroll_line.

**Frontend:**
- [ ] Trang `/payroll/[periodId]`: danh sách nhân sự + gross/net pay per employee.
- [ ] Nút "Tính lương" → gọi `calculate_payroll`; hiển thị progress.
- [ ] Trang cấu hình rule: xem/thêm rule mới (không sửa rule cũ).

### Definition of Done

- [ ] Đổi tham số rule (tạo version mới) → kỳ cũ không thay đổi.
- [ ] Tính lương → payroll_line có đủ gross/net/snapshot.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `finance_payroll_rule` | Table (immutable sau khi dùng) |
| `finance_payroll_line` | Table |
| `calculate_payroll()` | RPC |

### Ước lượng: 4–6 giờ

---

## 8c. Approval kỳ lương và payslip

**Mục tiêu:** Finance review → director approve → lock kỳ → nhân sự xem payslip của mình.

### Việc làm

**Migration `supabase migration new rpc_payroll_approval`:**
```sql
-- RPC approve_payroll_period
create or replace function approve_payroll_period(p_period_id uuid, p_step text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_period finance_payroll_period;
  v_calc_by uuid;
begin
  select * into v_period from finance_payroll_period where id = p_period_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if p_step = 'review' then
    if v_period.status != 'calculating' then raise exception 'INVALID_STATE'; end if;
    if auth.jwt() ->> 'role' not in ('hr_admin', 'finance_admin', 'company_owner') then
      raise exception 'FORBIDDEN';
    end if;
    update finance_payroll_period set status = 'reviewed' where id = p_period_id;

  elsif p_step = 'approve' then
    if v_period.status != 'reviewed' then raise exception 'INVALID_STATE'; end if;
    if auth.jwt() ->> 'role' not in ('director', 'company_owner') then
      raise exception 'FORBIDDEN';
    end if;

    -- SoD: director không phải người tính lương (chặn nếu calculated_by = auth.uid())
    select distinct calculated_by into v_calc_by
    from finance_payroll_line where period_id = p_period_id limit 1;
    if v_calc_by = auth.uid() and auth.jwt() ->> 'role' != 'company_owner' then
      raise exception 'SOD_VIOLATION' using hint = 'Người tính lương không được tự approve.';
    end if;

    update finance_payroll_period set status = 'approved' where id = p_period_id;
  end if;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_payroll_period', p_period_id,
          'RPC:approve_payroll:' || p_step, null);
end;
$$;

-- RPC lock_payroll_period
create or replace function lock_payroll_period(p_period_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' not in ('company_owner') then
    raise exception 'FORBIDDEN' using hint = 'Chỉ company_owner được lock kỳ lương.';
  end if;

  update finance_payroll_period
  set status = 'locked', locked_by = auth.uid(), locked_at = now()
  where id = p_period_id and status = 'approved';

  if not found then raise exception 'INVALID_STATE'; end if;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'finance_payroll_period', p_period_id, 'RPC:lock_payroll_period', null);
end;
$$;

-- View payslip (nhân sự xem của mình; finance xem tất cả)
create view payslip_view as
  select
    pl.id,
    pl.period_id,
    pp.month,
    pp.year,
    pp.status as period_status,
    e.id as employee_id,
    e.employee_code,
    e.full_name,
    e.type as employee_type,
    pl.gross_pay,
    pl.allowances,
    pl.deductions,
    pl.net_pay,
    pl.input_snapshot ->> 'approved_hours' as approved_hours,
    pl.rule_snapshot ->> 'rule_code' as rule_code,
    pl.calculated_at
  from finance_payroll_line pl
  join finance_payroll_period pp on pp.id = pl.period_id
  join hr_employee e on e.id = pl.employee_id;
-- RLS tự động từ finance_payroll_line:
-- nhân sự chỉ thấy payslip của mình; finance thấy tất cả
```

**pgTAP test `tests/payroll_approval.sql`:**
- [ ] `developer` gọi `approve_payroll_period('approve')` → FORBIDDEN.
- [ ] SoD: người `calculate_payroll` gọi `approve('approve')` → SOD_VIOLATION.
- [ ] `director` approve → status `approved`.
- [ ] `company_owner` lock → status `locked`.
- [ ] Sau lock: UPDATE `finance_payroll_line` → trigger raise exception.
- [ ] `developer` SELECT `payslip_view` → chỉ thấy payslip của mình.

**Frontend:**
- [ ] Stepper trên trang kỳ lương: calculating → reviewed → approved → locked.
- [ ] `finance_admin`: nút "Submit for review".
- [ ] `director`: nút "Approve".
- [ ] `company_owner`: nút "Lock period".
- [ ] Trang `/payroll/payslip`: nhân sự xem payslip của mình theo tháng/năm.
- [ ] Payslip detail: gross, allowances, deductions breakdown, net.

### Definition of Done

- [ ] Kỳ lương qua đủ: open → calculating → reviewed → approved → locked.
- [ ] SoD test pass (người tính không tự approve).
- [ ] Nhân sự chỉ thấy payslip của mình; finance thấy tất cả.
- [ ] Update payroll_line sau khi locked bị trigger chặn.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `approve_payroll_period()` | RPC |
| `lock_payroll_period()` | RPC |
| `payslip_view` | View |

### Ước lượng: 3–4 giờ

---

## Kết quả Phase 8 — Hệ thống hoàn chỉnh

Sau khi hoàn thành tất cả phase (0-8):
- **Phase 0-5 (MVP):** Auth, HR, Project, Issue, Worklog, Timesheet, Approval, Dashboard.
- **Phase 6:** Notification real-time, Audit UI, Email reminder.
- **Phase 7:** Budget tracking, Invoice, Payment, Reconciliation.
- **Phase 8:** Payroll rule engine, Approval kỳ lương, Payslip per employee.

### Checklist nghiệm thu cuối

- [ ] Tất cả pgTAP test pass (Phase 0-8).
- [ ] Migration chạy trên DB fresh + DB có dữ liệu.
- [ ] End-to-end: 1 employee → worklog → timesheet → approval → invoice → payroll → payslip.
- [ ] SoD test pass cho: timesheet approval, invoice reconcile, payroll approve.
- [ ] `developer` không truy cập được rate, payroll, invoice của người khác.
- [ ] Audit log đầy đủ cho mọi RPC nhạy cảm.
