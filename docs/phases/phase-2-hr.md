# Phase 2: HR — Nhân Sự, Team, Rate, Leave

> **Mục tiêu phase:** Quản lý nhân sự đầy đủ vòng đời (onboarding → terminated), hợp đồng, skill, rate effective-dated, team và nghỉ phép. Leave phải xong trước Phase 3 vì capacity calculation cần dữ liệu leave.

**Dependency:** Phase 1 hoàn chỉnh.  
**Ước lượng tổng:** 14–22 giờ.

---

## Checklist tổng quan

- [ ] 2a. Employee profile
- [ ] 2b. Contract và skill
- [ ] 2c. Rate effective-dated ⚠️ _cần trước Phase 3e (allocation snapshot)_
- [ ] 2d. Team và leader
- [ ] 2e. Leave request và balance ⚠️ _cần trước Phase 3d (capacity)_
- [ ] 2f. Onboarding/offboarding lifecycle

---

## 2a. Employee profile

**Mục tiêu:** Tạo, sửa, xem danh sách nhân sự qua UI admin.

### Việc làm

**Migration `supabase migration new hr_employee`:**
```sql
create type employee_type as enum ('full_time', 'part_time', 'freelancer', 'contractor');
create type employee_status as enum ('onboarding', 'active', 'offboarding', 'terminated');

create table hr_employee (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users on delete set null,
  employee_code   text unique,
  full_name       text not null,
  email           text,
  phone           text,
  type            employee_type not null default 'full_time',
  department      text,
  status          employee_status not null default 'onboarding',
  hire_date       date,
  terminate_date  date,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users,
  version         integer not null default 1
);

alter table hr_employee enable row level security;

-- Mọi authenticated user xem được (không thấy lương — lương ở bảng riêng)
create policy "auth_read_employee" on hr_employee for select
  using (auth.uid() is not null);

-- Chỉ hr_admin và company_owner tạo/sửa
create policy "hr_admin_write_employee" on hr_employee for insert
  with check (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

create policy "hr_admin_update_employee" on hr_employee for update
  using (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

-- Không cho xóa vật lý — dùng status terminated
create policy "no_delete_employee" on hr_employee for delete
  using (false);

-- Audit trigger
create trigger trg_hr_employee_audit
  after insert or update on hr_employee
  for each row execute function fn_audit_log();
```

**Frontend trang `/hr/employees`:**
- [ ] Bảng danh sách nhân sự: name, code, type, status, department, hire_date.
- [ ] Filter theo status, type, department.
- [ ] Form thêm/sửa nhân sự (chỉ hiển thị với `hr_admin`, `company_owner`).
- [ ] Pagination (max 50 per page).

**pgTAP test `tests/hr_employee_rls.sql`:**
- [ ] `developer` SELECT → thấy records.
- [ ] `developer` UPDATE hr_employee của người khác → bị RLS chặn.
- [ ] `hr_admin` INSERT → thành công.

### Definition of Done

- [ ] Tạo 2 nhân sự qua UI.
- [ ] `developer` thấy danh sách nhân sự nhưng không sửa được.
- [ ] pgTAP test pass.
- [ ] Migration chạy sạch.

### Bảng / RPC liên quan

| Tên | Loại | Mô tả |
|---|---|---|
| `hr_employee` | Table | Hồ sơ nhân sự |
| `employee_type` | Enum | full_time, part_time, freelancer, contractor |
| `employee_status` | Enum | onboarding, active, offboarding, terminated |

### Ước lượng: 2–3 giờ

---

## 2b. Contract và skill

**Mục tiêu:** Nhân sự có lịch sử hợp đồng (không sửa, chỉ thêm mới) và danh sách skill.

### Việc làm

**Migration `supabase migration new hr_contract_skill`:**
```sql
create table hr_contract (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references hr_employee on delete cascade,
  contract_type text not null, -- 'probation', 'fixed_term', 'indefinite', 'freelance'
  start_date    date not null,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users,
  -- Không có updated_at — lịch sử bất biến, chỉ INSERT
  version       integer not null default 1
);

alter table hr_contract enable row level security;

-- Chỉ hr_admin, company_owner đọc
create policy "hr_read_contract" on hr_contract for select
  using (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner', 'finance_admin'));

create policy "hr_write_contract" on hr_contract for insert
  with check (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

-- Không cho UPDATE/DELETE — lịch sử bất biến
create policy "no_update_contract" on hr_contract for update using (false);
create policy "no_delete_contract" on hr_contract for delete using (false);

-- Skills
create table hr_skill (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employee on delete cascade,
  skill_name   text not null,
  level        text, -- 'beginner', 'intermediate', 'expert'
  certified_at date,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users
);

alter table hr_skill enable row level security;

create policy "auth_read_skill" on hr_skill for select
  using (auth.uid() is not null);

create policy "hr_write_skill" on hr_skill for insert
  with check (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

create policy "hr_delete_skill" on hr_skill for delete
  using (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));
```

**Frontend:**
- [ ] Tab "Hợp đồng" trên trang chi tiết nhân sự: timeline lịch sử hợp đồng.
- [ ] Form thêm hợp đồng mới (không có nút sửa hợp đồng cũ).
- [ ] Tab "Skill": danh sách + form thêm/xóa skill.

### Definition of Done

- [ ] Nhân sự có 2 hợp đồng kế tiếp; xem được timeline.
- [ ] Không có nút UPDATE hợp đồng cũ.
- [ ] pgTAP: `developer` không INSERT được contract.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `hr_contract` | Table (append-only) |
| `hr_skill` | Table |

### Ước lượng: 2–3 giờ

---

## 2c. Rate effective-dated

**Mục tiêu:** Đổi rate không mất rate cũ; truy vấn rate tại thời điểm quá khứ đúng.

> ⚠️ **Quan trọng:** Sub-phase này phải xong trước **3e (allocation)** vì khi approve allocation sẽ snapshot rate hiện tại.

### Việc làm

**Migration `supabase migration new hr_employee_rate`:**
```sql
create type rate_type as enum ('hourly', 'monthly', 'daily');

create table hr_employee_rate (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references hr_employee on delete cascade,
  rate_type      rate_type not null,
  amount         numeric(18,4) not null check (amount > 0),
  currency       char(3) not null default 'VND',
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users,
  version        integer not null default 1,
  constraint uq_employee_rate_from unique (employee_id, rate_type, effective_from)
);

-- Trigger chặn range chồng lấn
create or replace function fn_check_rate_no_overlap()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from hr_employee_rate
    where employee_id = new.employee_id
      and rate_type = new.rate_type
      and id != coalesce(new.id, gen_random_uuid())
      and (
        new.effective_to is null
        or new.effective_from <= hr_employee_rate.effective_to
      )
      and (
        hr_employee_rate.effective_to is null
        or hr_employee_rate.effective_from <= new.effective_to
      )
  ) then
    raise exception 'RATE_OVERLAP'
      using hint = 'Khoảng thời gian rate bị chồng lấn với rate cùng loại đã tồn tại.';
  end if;
  return new;
end;
$$;

create trigger trg_rate_no_overlap
  before insert or update on hr_employee_rate
  for each row execute function fn_check_rate_no_overlap();

alter table hr_employee_rate enable row level security;

-- Chỉ hr_admin, finance_admin, company_owner xem được rate
create policy "sensitive_read_rate" on hr_employee_rate for select
  using (auth.jwt() ->> 'role' in ('hr_admin', 'finance_admin', 'company_owner'));

create policy "hr_write_rate" on hr_employee_rate for insert
  with check (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

-- Không UPDATE rate cũ — tạo bản ghi mới
create policy "no_update_rate" on hr_employee_rate for update using (false);

-- RPC get_rate_at
create or replace function get_rate_at(
  p_employee_id uuid,
  p_at_date     date
) returns table(rate_type rate_type, amount numeric, currency char)
language sql stable security definer set search_path = public as $$
  select rate_type, amount, currency
  from hr_employee_rate
  where employee_id = p_employee_id
    and effective_from <= p_at_date
    and (effective_to is null or effective_to >= p_at_date)
  order by effective_from desc;
$$;
```

**pgTAP test `tests/hr_rate_rls.sql`:**
- [ ] `developer` SELECT `hr_employee_rate` → expect 0 rows.
- [ ] `hr_admin` SELECT → thấy records.
- [ ] INSERT 2 rate cùng loại chồng lấn → trigger raise exception.
- [ ] `get_rate_at(employee_id, past_date)` trả đúng rate tại thời điểm đó.

### Definition of Done

- [ ] Đổi rate nhân sự → rate cũ vẫn còn.
- [ ] `get_rate_at()` trả đúng rate tại thời điểm quá khứ.
- [ ] Chồng lấn range bị chặn bởi trigger.
- [ ] `developer` không SELECT được rate.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `hr_employee_rate` | Table |
| `get_rate_at(uuid, date)` | RPC |
| `fn_check_rate_no_overlap()` | Trigger function |

### Ước lượng: 3–4 giờ

---

## 2d. Team và leader

**Mục tiêu:** Tạo team, gán leader, thêm/xóa thành viên, xem skill matrix tổng hợp.

### Việc làm

**Migration `supabase migration new hr_team`:**
```sql
create table hr_team (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  leader_employee_id  uuid references hr_employee,
  description         text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users,
  version             integer not null default 1
);

create table hr_team_member (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references hr_team on delete cascade,
  employee_id uuid not null references hr_employee on delete cascade,
  role        text default 'member', -- 'lead', 'member'
  joined_at   date not null default current_date,
  left_at     date,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users,
  constraint uq_team_member_active unique nulls not distinct (team_id, employee_id, left_at)
);

alter table hr_team enable row level security;
alter table hr_team_member enable row level security;

-- Mọi auth user xem được team
create policy "auth_read_team" on hr_team for select using (auth.uid() is not null);
create policy "auth_read_team_member" on hr_team_member for select using (auth.uid() is not null);

-- Chỉ hr_admin, company_owner quản lý team
create policy "hr_write_team" on hr_team for all
  using (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'))
  with check (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

create policy "hr_write_team_member" on hr_team_member for all
  using (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'))
  with check (auth.jwt() ->> 'role' in ('hr_admin', 'company_owner'));

-- View skill matrix
create view hr_team_skill_matrix as
  select
    tm.team_id,
    t.name as team_name,
    e.id as employee_id,
    e.full_name,
    s.skill_name,
    s.level
  from hr_team_member tm
  join hr_team t on t.id = tm.team_id
  join hr_employee e on e.id = tm.employee_id
  left join hr_skill s on s.employee_id = tm.employee_id
  where tm.left_at is null;
```

**Frontend:**
- [ ] Trang `/hr/teams`: danh sách team + leader.
- [ ] Chi tiết team: danh sách thành viên + lịch sử (joined_at, left_at).
- [ ] Tab "Skill Matrix": bảng employee × skill.

### Definition of Done

- [ ] Tạo team 3 người, đổi 1 người (set `left_at`), lịch sử đúng.
- [ ] View `hr_team_skill_matrix` trả đúng dữ liệu.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `hr_team` | Table |
| `hr_team_member` | Table |
| `hr_team_skill_matrix` | View |

### Ước lượng: 2–3 giờ

---

## 2e. Leave request và balance

**Mục tiêu:** Nhân sự request nghỉ phép; HR duyệt; balance cập nhật — **bắt buộc xong trước Phase 3d (capacity)**.

> ⚠️ **Dependency ngược đã sửa từ v2:** Leave phải xong ở Phase 2 vì Phase 3d (`employee_availability`) cần dữ liệu leave approved.

### Việc làm

**Migration `supabase migration new hr_leave`:**
```sql
create table hr_leave_type (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  name                text not null,
  default_days_per_year int not null default 12
);

insert into hr_leave_type(code, name, default_days_per_year) values
  ('annual', 'Nghỉ phép năm', 12),
  ('sick', 'Nghỉ ốm', 5),
  ('unpaid', 'Nghỉ không lương', 0),
  ('other', 'Khác', 0);

create table hr_leave_balance (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references hr_employee on delete cascade,
  leave_type_id uuid not null references hr_leave_type,
  year          int not null,
  total_days    numeric(5,1) not null,
  used_days     numeric(5,1) not null default 0,
  remaining_days numeric(5,1) generated always as (total_days - used_days) stored,
  constraint uq_leave_balance unique (employee_id, leave_type_id, year)
);

create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table hr_leave_request (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references hr_employee on delete cascade,
  leave_type_id   uuid not null references hr_leave_type,
  start_date      date not null,
  end_date        date not null,
  days_requested  numeric(5,1) not null,
  reason          text,
  status          leave_status not null default 'pending',
  approved_by     uuid references auth.users,
  approved_at     timestamptz,
  rejected_reason text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  updated_at      timestamptz not null default now(),
  version         integer not null default 1
);

alter table hr_leave_balance enable row level security;
alter table hr_leave_request enable row level security;

-- Leave request: nhân sự xem của mình, hr_admin xem tất cả
create policy "employee_read_own_leave" on hr_leave_request for select
  using (
    employee_id in (select id from hr_employee where user_id = auth.uid())
    or auth.jwt() ->> 'role' in ('hr_admin', 'company_owner')
  );

create policy "employee_insert_leave" on hr_leave_request for insert
  with check (
    employee_id in (select id from hr_employee where user_id = auth.uid())
  );

-- Không cho UPDATE trực tiếp status — chỉ qua RPC
create policy "no_direct_update_leave_status" on hr_leave_request for update
  using (false);

-- RPC approve_leave
create or replace function approve_leave(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_request hr_leave_request;
  v_balance hr_leave_balance;
begin
  -- Kiểm tra quyền
  if auth.jwt() ->> 'role' not in ('hr_admin', 'company_owner') then
    raise exception 'FORBIDDEN' using hint = 'Chỉ hr_admin được duyệt nghỉ phép.';
  end if;

  select * into v_request from hr_leave_request where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND' using hint = 'Không tìm thấy yêu cầu nghỉ phép.';
  end if;
  if v_request.status != 'pending' then
    raise exception 'INVALID_STATE' using hint = 'Yêu cầu không ở trạng thái pending.';
  end if;

  -- SoD: người request không tự approve
  if v_request.created_by = auth.uid() then
    raise exception 'SOD_VIOLATION' using hint = 'Không thể tự duyệt yêu cầu của mình.';
  end if;

  -- Kiểm tra balance
  select * into v_balance from hr_leave_balance
  where employee_id = v_request.employee_id
    and leave_type_id = v_request.leave_type_id
    and year = extract(year from v_request.start_date)::int
  for update;

  if v_balance is null or v_balance.remaining_days < v_request.days_requested then
    raise exception 'INSUFFICIENT_BALANCE' using hint = 'Số ngày nghỉ phép không đủ.';
  end if;

  -- Cập nhật
  update hr_leave_request
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_request_id;

  update hr_leave_balance
  set used_days = used_days + v_request.days_requested
  where id = v_balance.id;

  -- Audit
  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'hr_leave_request', p_request_id, 'RPC:approve_leave',
          jsonb_build_object('days', v_request.days_requested, 'employee_id', v_request.employee_id));
end;
$$;

-- RPC reject_leave
create or replace function reject_leave(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' not in ('hr_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;
  update hr_leave_request
  set status = 'rejected', rejected_reason = p_reason
  where id = p_request_id and status = 'pending';
end;
$$;
```

**pgTAP test `tests/hr_leave.sql`:**
- [ ] `developer` INSERT leave cho employee của mình → thành công.
- [ ] Approve → balance giảm đúng `days_requested`.
- [ ] SoD: `hr_admin` tự approve request của mình (cùng `created_by`) → raise exception.
- [ ] Approve khi balance không đủ → raise exception `INSUFFICIENT_BALANCE`.

**Frontend:**
- [ ] Trang `/hr/leave`: nhân sự xem danh sách request của mình.
- [ ] Form tạo request nghỉ phép: chọn loại, ngày bắt đầu/kết thúc.
- [ ] `hr_admin` xem tất cả request pending; nút Approve/Reject.

### Definition of Done

- [ ] Tạo request → approve → balance giảm đúng.
- [ ] pgTAP SoD test pass.
- [ ] Balance không đủ → bị reject với lỗi rõ ràng.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `hr_leave_type` | Table |
| `hr_leave_balance` | Table |
| `hr_leave_request` | Table |
| `approve_leave(uuid)` | RPC |
| `reject_leave(uuid, text)` | RPC |

### Ước lượng: 3–4 giờ

---

## 2f. Onboarding/offboarding lifecycle

**Mục tiêu:** Chuyển trạng thái nhân sự qua đủ vòng đời với state machine và audit log.

### Việc làm

**Migration `supabase migration new rpc_employee_lifecycle`:**
```sql
create or replace function transition_employee_status(
  p_employee_id uuid,
  p_new_status  employee_status,
  p_reason      text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_current_status employee_status;
begin
  if auth.jwt() ->> 'role' not in ('hr_admin', 'company_owner') then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_current_status from hr_employee where id = p_employee_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- State machine
  if not (
    (v_current_status = 'onboarding' and p_new_status = 'active') or
    (v_current_status = 'active'     and p_new_status = 'offboarding') or
    (v_current_status = 'offboarding' and p_new_status = 'terminated') or
    (v_current_status = 'onboarding' and p_new_status = 'terminated') -- reject probation
  ) then
    raise exception 'INVALID_TRANSITION'
      using hint = 'Chuyển trạng thái không hợp lệ: ' || v_current_status || ' → ' || p_new_status;
  end if;

  update hr_employee
  set status = p_new_status,
      updated_at = now(),
      updated_by = auth.uid(),
      terminate_date = case when p_new_status = 'terminated' then current_date else terminate_date end
  where id = p_employee_id;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'hr_employee', p_employee_id, 'RPC:transition_status',
          jsonb_build_object('from', v_current_status, 'to', p_new_status, 'reason', p_reason));
end;
$$;
```

**pgTAP test `tests/rpc_employee_lifecycle.sql`:**
- [ ] `developer` gọi `transition_employee_status` → FORBIDDEN.
- [ ] `hr_admin` transition `active → terminated` (bỏ qua offboarding) → INVALID_TRANSITION.
- [ ] `hr_admin` transition theo đúng state machine → thành công, audit log có bản ghi.

**Frontend:**
- [ ] Dropdown đổi trạng thái trên trang chi tiết nhân sự (chỉ hiện với `hr_admin`).
- [ ] Xác nhận trước khi transition; hiển thị lý do (optional).

### Definition of Done

- [ ] Nhân sự đi qua đủ vòng đời: onboarding → active → offboarding → terminated.
- [ ] Invalid transition bị chặn với thông báo rõ ràng.
- [ ] `developer` không gọi được RPC.
- [ ] Audit log ghi đúng from/to/reason/actor.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `transition_employee_status()` | RPC |

### Ước lượng: 2–3 giờ

---

## Kết quả Phase 2

Sau khi hoàn thành phase này:
- Hồ sơ nhân sự đầy đủ: profile, contract lịch sử, skill, rate effective-dated, team membership.
- Nghỉ phép được quản lý với approval flow và balance tracking.
- Rate nhân sự sẵn sàng để Phase 3e snapshot khi approve allocation.
- Leave data sẵn sàng để Phase 3d tính capacity.
