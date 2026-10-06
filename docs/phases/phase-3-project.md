# Phase 3: Client, Project, Allocation

> **Mục tiêu phase:** Quản lý client, proposal → project approval flow, milestone, resource capacity và allocation với rate snapshot. Sau phase này team có thể assign người vào project đúng luồng.

**Dependency:** Phase 1 (auth/membership), Phase 2 (hr_employee, hr_employee_rate, hr_leave_request) hoàn chỉnh.  
**Ước lượng tổng:** 13–20 giờ.

---

## Checklist tổng quan

- [ ] 3a. Client và contact
- [ ] 3b. Proposal và approval flow
- [ ] 3c. Project milestone và budget
- [ ] 3d. Resource capacity và availability ⚠️ _cần Phase 2e (leave) đã xong_
- [ ] 3e. Team allocation vào project ⚠️ _cần Phase 2c (rate) đã xong_

---

## 3a. Client và contact

**Mục tiêu:** Tạo client, gắn contact — chuẩn bị cho proposal.

### Việc làm

**Migration `supabase migration new project_client`:**
```sql
create table project_client (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text unique,
  address     text,
  website     text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users,
  version     integer not null default 1
);

create table project_client_contact (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references project_client on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  title       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users
);

alter table project_client enable row level security;
alter table project_client_contact enable row level security;

-- Mọi auth user xem được client
create policy "auth_read_client" on project_client for select
  using (auth.uid() is not null);

create policy "auth_read_client_contact" on project_client_contact for select
  using (auth.uid() is not null);

-- Chỉ một số role được tạo/sửa
create policy "pm_write_client" on project_client for all
  using (auth.jwt() ->> 'role' in ('company_owner', 'director', 'project_manager', 'finance_admin'))
  with check (auth.jwt() ->> 'role' in ('company_owner', 'director', 'project_manager', 'finance_admin'));

create policy "pm_write_contact" on project_client_contact for all
  using (auth.jwt() ->> 'role' in ('company_owner', 'director', 'project_manager', 'finance_admin'))
  with check (auth.jwt() ->> 'role' in ('company_owner', 'director', 'project_manager', 'finance_admin'));
```

**Frontend trang `/clients`:**
- [ ] Danh sách client: name, code, is_active, số contact.
- [ ] Chi tiết client: thông tin + danh sách contact.
- [ ] Form thêm/sửa client và contact.

### Definition of Done

- [ ] Tạo client với 2 contact qua UI.
- [ ] `developer` xem được nhưng không sửa được client.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `project_client` | Table |
| `project_client_contact` | Table |

### Ước lượng: 1–2 giờ

---

## 3b. Proposal và approval flow

**Mục tiêu:** Tạo proposal → director approve → tự động tạo project với snapshot dữ liệu.

### Việc làm

**Migration `supabase migration new project_proposal_and_project`:**
```sql
create type proposal_status as enum ('draft', 'sent', 'approved', 'rejected');
create type project_status as enum ('active', 'on_hold', 'completed', 'cancelled');
create type billing_type as enum ('fixed_price', 'hourly', 'mixed');

create table project_proposal (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references project_client,
  title             text not null,
  description       text,
  scope             jsonb,
  estimated_budget  numeric(18,4),
  currency          char(3) not null default 'VND',
  billing_type      billing_type not null default 'fixed_price',
  status            proposal_status not null default 'draft',
  revision_of       uuid references project_proposal, -- nếu là bản revise
  sent_at           timestamptz,
  expires_at        date,
  decided_by        uuid references auth.users,
  decided_at        timestamptz,
  reject_reason     text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users,
  updated_at        timestamptz not null default now(),
  version           integer not null default 1
);

create table project_project (
  id                 uuid primary key default gen_random_uuid(),
  proposal_id        uuid references project_proposal,
  client_id          uuid not null references project_client,
  name               text not null,
  code               text unique,
  description        text,
  status             project_status not null default 'active',
  billing_type       billing_type not null,
  budget_amount      numeric(18,4),
  budget_currency    char(3) not null default 'VND',
  scope_snapshot     jsonb, -- snapshot từ proposal lúc approve
  start_date         date,
  end_date           date,
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users,
  version            integer not null default 1
);

alter table project_proposal enable row level security;
alter table project_project enable row level security;

-- Proposal: pm và director xem, pm tạo
create policy "pm_read_proposal" on project_proposal for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'director', 'project_manager', 'finance_admin', 'auditor'));

create policy "pm_write_proposal" on project_proposal for insert
  with check (auth.jwt() ->> 'role' in ('company_owner', 'project_manager'));

create policy "pm_update_draft_proposal" on project_proposal for update
  using (status = 'draft' and auth.jwt() ->> 'role' in ('company_owner', 'project_manager'));

-- Project: mọi auth user xem, chỉ qua RPC tạo
create policy "auth_read_project" on project_project for select
  using (auth.uid() is not null);

create policy "no_direct_insert_project" on project_project for insert
  with check (false); -- chỉ qua RPC approve_proposal

-- RPC approve_proposal
create or replace function approve_proposal(p_proposal_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_proposal project_proposal;
  v_project_id uuid;
begin
  if auth.jwt() ->> 'role' not in ('director', 'company_owner') then
    raise exception 'FORBIDDEN' using hint = 'Chỉ director được approve proposal.';
  end if;

  select * into v_proposal from project_proposal where id = p_proposal_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_proposal.status != 'sent' then
    raise exception 'INVALID_STATE' using hint = 'Proposal phải ở trạng thái sent.';
  end if;

  -- Update proposal
  update project_proposal
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = p_proposal_id;

  -- Tạo project với snapshot
  insert into project_project(
    proposal_id, client_id, name, billing_type,
    budget_amount, budget_currency, scope_snapshot, created_by
  )
  values (
    p_proposal_id, v_proposal.client_id, v_proposal.title, v_proposal.billing_type,
    v_proposal.estimated_budget, v_proposal.currency, v_proposal.scope, auth.uid()
  )
  returning id into v_project_id;

  -- Audit
  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'project_proposal', p_proposal_id, 'RPC:approve_proposal',
          jsonb_build_object('project_id', v_project_id));

  return v_project_id;
end;
$$;

-- RPC reject_proposal
create or replace function reject_proposal(p_proposal_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' not in ('director', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;
  update project_proposal
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(), reject_reason = p_reason
  where id = p_proposal_id and status = 'sent';
end;
$$;

-- RPC send_proposal (draft → sent)
create or replace function send_proposal(p_proposal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' not in ('company_owner', 'project_manager') then
    raise exception 'FORBIDDEN';
  end if;
  update project_proposal
  set status = 'sent', sent_at = now()
  where id = p_proposal_id and status = 'draft';
end;
$$;
```

**pgTAP test `tests/project_proposal.sql`:**
- [ ] `developer` gọi `approve_proposal` → FORBIDDEN.
- [ ] `director` approve proposal status `draft` → INVALID_STATE.
- [ ] `director` approve proposal status `sent` → project được tạo với đúng snapshot.
- [ ] Reject → project không được tạo.

**Frontend:**
- [ ] Trang `/proposals`: danh sách + status badge.
- [ ] Form tạo proposal: client, title, scope, budget, billing_type.
- [ ] Nút "Gửi đi" (draft → sent), "Approve"/"Reject" (chỉ director).

### Definition of Done

- [ ] Proposal approved → project tồn tại với snapshot scope/budget.
- [ ] Reject → không tạo project.
- [ ] pgTAP test pass.

### Ước lượng: 3–4 giờ

---

## 3c. Project milestone và budget

**Mục tiêu:** Project có milestone với deadline và budget riêng; tracking on-track/overdue.

### Việc làm

**Migration `supabase migration new project_milestone`:**
```sql
create type milestone_status as enum ('open', 'submitted', 'accepted', 'rejected');

create table project_milestone (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project_project on delete cascade,
  name          text not null,
  description   text,
  due_date      date,
  budget_amount numeric(18,4),
  currency      char(3) not null default 'VND',
  status        milestone_status not null default 'open',
  submitted_at  timestamptz,
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users,
  reject_reason text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users,
  updated_at    timestamptz not null default now(),
  version       integer not null default 1
);

alter table project_milestone enable row level security;

create policy "auth_read_milestone" on project_milestone for select
  using (auth.uid() is not null);

create policy "pm_write_milestone" on project_milestone for all
  using (auth.jwt() ->> 'role' in ('company_owner', 'project_manager', 'director'))
  with check (auth.jwt() ->> 'role' in ('company_owner', 'project_manager', 'director'));

-- View milestone health
create view project_milestone_with_health as
  select
    m.*,
    p.name as project_name,
    case
      when m.status = 'accepted' then 'completed'
      when m.due_date < current_date and m.status = 'open' then 'overdue'
      when m.due_date <= current_date + 7 then 'at_risk'
      else 'on_track'
    end as health
  from project_milestone m
  join project_project p on p.id = m.project_id;
```

**Frontend:**
- [ ] Tab "Milestones" trên trang chi tiết project.
- [ ] Milestone card: name, due_date, budget, status badge, health indicator.
- [ ] Form thêm/sửa milestone.

### Definition of Done

- [ ] Project có 2 milestone với ngày và budget riêng.
- [ ] View `project_milestone_with_health` trả đúng `health`.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `project_milestone` | Table |
| `project_milestone_with_health` | View |

### Ước lượng: 2–3 giờ

---

## 3d. Resource capacity và availability

**Mục tiêu:** Xem giờ rảnh của nhân sự trong khoảng thời gian (trừ leave approved và allocation hiện hữu).

> ⚠️ **Cần Phase 2e (leave) đã xong** trước khi làm sub-phase này.

### Việc làm

**Migration `supabase migration new rpc_employee_availability`:**
```sql
-- RPC tính available hours
create or replace function employee_availability(
  p_employee_id uuid,
  p_from_date   date,
  p_to_date     date
) returns table(
  employee_id       uuid,
  from_date         date,
  to_date           date,
  total_work_days   int,
  leave_days        numeric,
  allocated_percent numeric,
  available_hours   numeric
) language plpgsql stable security definer set search_path = public as $$
declare
  v_work_days int;
  v_leave_days numeric;
  v_allocated_pct numeric;
  v_hours_per_day numeric := 8; -- lấy từ core_config sau
begin
  -- Tổng ngày làm việc (đơn giản: ngày thứ 2-6 trong range)
  select count(*) into v_work_days
  from generate_series(p_from_date, p_to_date, '1 day'::interval) d
  where extract(dow from d) between 1 and 5;

  -- Ngày nghỉ đã approved trong range
  select coalesce(sum(days_requested), 0) into v_leave_days
  from hr_leave_request
  where employee_id = p_employee_id
    and status = 'approved'
    and start_date <= p_to_date
    and end_date >= p_from_date;

  -- Allocation percent trung bình trong range
  select coalesce(avg(a.allocation_percent), 0) into v_allocated_pct
  from project_allocation a
  where a.employee_id = p_employee_id
    and a.status = 'approved'
    and a.start_date <= p_to_date
    and a.end_date >= p_from_date;

  return query select
    p_employee_id,
    p_from_date,
    p_to_date,
    v_work_days,
    v_leave_days,
    v_allocated_pct,
    greatest(0,
      (v_work_days - v_leave_days) * v_hours_per_day * (1 - v_allocated_pct / 100)
    );
end;
$$;
```

> **Lưu ý:** RPC này cần `project_allocation` (từ 3e). Để test trước khi 3e xong, `v_allocated_pct` sẽ trả 0 (chưa có allocation nào).

**pgTAP test `tests/rpc_availability.sql`:**
- [ ] Nhân sự có 2 ngày leave trong tuần 5 ngày → `available_hours = (5-2)*8 = 24`.
- [ ] Nhân sự không có leave → `available_hours = 5*8 = 40`.

**Frontend:**
- [ ] Trang `/hr/capacity`: chọn nhân sự + date range → hiển thị available hours.
- [ ] Warning nếu `allocated_percent >= 100`.

### Definition of Done

- [ ] `employee_availability()` trả đúng khi có leave.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `employee_availability(uuid, date, date)` | RPC |

### Ước lượng: 3–4 giờ

---

## 3e. Team allocation vào project

**Mục tiêu:** Request allocation → approve → snapshot rate → tạo project_membership tự động. Không cho join project nếu chưa có allocation.

> ⚠️ **Cần Phase 2c (rate)** đã xong để snapshot đúng rate tại thời điểm approve.

### Việc làm

**Migration `supabase migration new project_allocation`:**
```sql
create type allocation_status as enum ('pending', 'approved', 'rejected', 'released');

create table project_allocation (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references project_project on delete cascade,
  employee_id       uuid not null references hr_employee on delete cascade,
  role              text not null, -- 'pm', 'developer', 'qa', etc.
  allocation_percent numeric(5,2) not null default 100 check (allocation_percent > 0 and allocation_percent <= 100),
  start_date        date not null,
  end_date          date,
  rate_snapshot     jsonb, -- snapshot rate tại thời điểm approve
  status            allocation_status not null default 'pending',
  approved_by       uuid references auth.users,
  approved_at       timestamptz,
  reject_reason     text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users,
  updated_at        timestamptz not null default now(),
  version           integer not null default 1
);

alter table project_allocation enable row level security;

create policy "pm_read_allocation" on project_allocation for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'director', 'project_manager', 'hr_admin', 'finance_admin'));

create policy "pm_insert_allocation" on project_allocation for insert
  with check (auth.jwt() ->> 'role' in ('company_owner', 'project_manager', 'hr_admin'));

-- Không UPDATE trực tiếp status — chỉ qua RPC
create policy "no_direct_update_alloc_status" on project_allocation for update
  using (false);

-- RPC approve_allocation
create or replace function approve_allocation(p_allocation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_alloc project_allocation;
  v_rate_snapshot jsonb;
  v_user_id uuid;
begin
  if auth.jwt() ->> 'role' not in ('company_owner', 'director', 'hr_admin') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_alloc from project_allocation where id = p_allocation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_alloc.status != 'pending' then
    raise exception 'INVALID_STATE' using hint = 'Allocation không ở trạng thái pending.';
  end if;

  -- Snapshot rate hiện tại
  select jsonb_agg(jsonb_build_object('rate_type', rate_type, 'amount', amount, 'currency', currency))
  into v_rate_snapshot
  from hr_employee_rate
  where employee_id = v_alloc.employee_id
    and effective_from <= current_date
    and (effective_to is null or effective_to >= current_date);

  -- Update allocation
  update project_allocation
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      rate_snapshot = v_rate_snapshot
  where id = p_allocation_id;

  -- Lấy user_id của employee
  select user_id into v_user_id from hr_employee where id = v_alloc.employee_id;

  -- Tạo project_membership (nếu user có tài khoản)
  if v_user_id is not null then
    insert into project_membership(project_id, user_id, project_role, granted_by, start_date, end_date)
    values (
      v_alloc.project_id,
      v_user_id,
      (case v_alloc.role
        when 'pm' then 'pm'
        when 'qa' then 'qa_reviewer'
        else 'developer'
      end)::project_role,
      auth.uid(),
      v_alloc.start_date,
      v_alloc.end_date
    )
    on conflict (project_id, user_id, project_role) do nothing;
  end if;

  -- Audit
  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'project_allocation', p_allocation_id, 'RPC:approve_allocation',
          jsonb_build_object('rate_snapshot', v_rate_snapshot));
end;
$$;

-- Override policy để RPC được insert membership
-- (RPC là security definer, bypass RLS)
```

**pgTAP test `tests/project_allocation.sql`:**
- [ ] INSERT `project_membership` trực tiếp → bị RLS chặn (policy `no_direct_insert_membership` từ 1c).
- [ ] `approve_allocation()` → membership được tạo; rate_snapshot không rỗng.
- [ ] `developer` gọi `approve_allocation` → FORBIDDEN.

**Frontend:**
- [ ] Tab "Allocation" trên trang chi tiết project.
- [ ] Form request allocation: chọn nhân sự, role, allocation%, start/end date.
- [ ] Nút Approve/Reject (chỉ hr_admin, director, company_owner).

### Definition of Done

- [ ] Approve allocation → membership tồn tại với rate_snapshot.
- [ ] INSERT membership trực tiếp bị chặn.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `project_allocation` | Table |
| `approve_allocation(uuid)` | RPC |

### Ước lượng: 3–4 giờ

---

## Kết quả Phase 3

Sau khi hoàn thành phase này:
- Quản lý client và proposal đầy đủ.
- Project được tạo qua flow approve (có snapshot dữ liệu).
- Milestone tracking với health indicator.
- Allocation có rate snapshot — chuẩn bị cho billing Phase 7.
- Project membership được tạo tự động sau approve allocation.
