# Phase 5: Worklog, Timesheet, Approval + Dashboard MVP

> **Mục tiêu phase:** Ghi nhận thời gian làm việc → timesheet → approval 2 cấp (leader → PM) → lock kỳ. Dashboard tối thiểu để theo dõi utilization. Sau phase này hệ thống có thể vận hành thật — đây là **ranh giới MVP**.

**Dependency:** Phase 4 (work_issue, project_membership), Phase 3e (project_allocation + rate_snapshot).  
**Ước lượng tổng:** 12–19 giờ.

---

## ⚠️ Đây là ranh giới MVP

```
Phase 0-5 = MVP có thể dùng thật cho một team.
Phase 6-8 = After-MVP: Notification, Billing, Payroll.
```

---

## Checklist tổng quan

- [ ] 5a. Worklog theo issue
- [ ] 5b. Timesheet tổng hợp
- [ ] 5c. Approval flow (leader → PM)
- [ ] 5d. Lock timesheet và điều chỉnh
- [ ] 5e. Dashboard MVP

---

## 5a. Worklog theo issue

**Mục tiêu:** Ghi nhận thời lượng, billable/non-billable trên issue; chỉ chủ sở hữu INSERT.

### Việc làm

**Migration `supabase migration new work_worklog`:**
```sql
create type worklog_status as enum ('draft', 'submitted', 'approved', 'rejected');

create table work_worklog (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references work_issue on delete cascade,
  project_id  uuid not null references project_project, -- denormalize để RLS dễ
  employee_id uuid not null references hr_employee,
  logged_date date not null default current_date,
  hours       numeric(6,2) not null check (hours > 0 and hours <= 24),
  description text,
  is_billable boolean not null default true,
  status      worklog_status not null default 'draft',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users,
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

alter table work_worklog enable row level security;

-- Chỉ chủ sở hữu INSERT worklog của mình
create policy "employee_insert_own_worklog" on work_worklog for insert
  with check (
    employee_id in (select id from hr_employee where user_id = auth.uid())
  );

-- Đọc: chủ sở hữu, team_leader/pm của project, finance_admin
create policy "worklog_read" on work_worklog for select
  using (
    employee_id in (select id from hr_employee where user_id = auth.uid())
    or auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'hr_admin')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = work_worklog.project_id
        and pm.user_id = auth.uid()
        and pm.project_role in ('pm', 'team_leader')
        and pm.status = 'active'
    )
  );

-- Chỉ chủ sở hữu sửa worklog ở trạng thái draft
create policy "employee_update_draft_worklog" on work_worklog for update
  using (
    employee_id in (select id from hr_employee where user_id = auth.uid())
    and status = 'draft'
  );

-- Không xóa worklog đã submitted/approved
create policy "no_delete_approved_worklog" on work_worklog for delete
  using (
    status = 'draft'
    and employee_id in (select id from hr_employee where user_id = auth.uid())
  );

-- Audit trigger
create trigger trg_work_worklog_audit
  after insert or update on work_worklog
  for each row execute function fn_audit_log();
```

**pgTAP test `tests/work_worklog_rls.sql`:**
- [ ] Employee A INSERT worklog cho employee B → bị chặn.
- [ ] Employee INSERT worklog cho issue không thuộc project mình → bị chặn (thêm check project membership trong insert policy).
- [ ] `team_leader` của project SELECT worklog → thấy được.
- [ ] `developer` của project khác SELECT → 0 rows.

**Frontend trang `/projects/[id]/issues/[issueId]`:**
- [ ] Section "Log Work": danh sách worklog + form thêm (hours, description, is_billable, logged_date).
- [ ] Edit/delete worklog của mình (chỉ draft).

### Definition of Done

- [ ] Log work trên issue; xem lại lịch sử log.
- [ ] Employee không log được cho issue ngoài project mình.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `work_worklog` | Table |
| `worklog_status` | Enum |

### Ước lượng: 2–3 giờ

---

## 5b. Timesheet tổng hợp

**Mục tiêu:** Tổng hợp worklog thành timesheet tuần/tháng; submit chuyển trạng thái pending review.

### Việc làm

**Migration `supabase migration new work_timesheet`:**
```sql
create type timesheet_status as enum ('draft', 'submitted', 'leader_approved', 'pm_approved', 'locked', 'adjustment_pending');

create table work_timesheet (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references hr_employee on delete cascade,
  project_id   uuid not null references project_project,
  period_start date not null,
  period_end   date not null,
  total_hours  numeric(8,2) not null default 0,
  status       timesheet_status not null default 'draft',
  submitted_at timestamptz,
  locked_at    timestamptz,
  locked_by    uuid references auth.users,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users,
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  constraint uq_timesheet unique (employee_id, project_id, period_start, period_end)
);

create table work_timesheet_line (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references work_timesheet on delete cascade,
  worklog_id   uuid not null references work_worklog,
  hours        numeric(6,2) not null,
  is_billable  boolean not null,
  logged_date  date not null
);

alter table work_timesheet enable row level security;
alter table work_timesheet_line enable row level security;

-- Đọc: chủ sở hữu, team_leader/pm của project, finance_admin
create policy "timesheet_read" on work_timesheet for select
  using (
    employee_id in (select id from hr_employee where user_id = auth.uid())
    or auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'hr_admin')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = work_timesheet.project_id
        and pm.user_id = auth.uid()
        and pm.project_role in ('pm', 'team_leader')
        and pm.status = 'active'
    )
  );

-- INSERT chỉ chủ sở hữu, qua RPC submit_timesheet
create policy "no_direct_timesheet_ops" on work_timesheet for all
  using (false) with check (false);

create policy "timesheet_line_read" on work_timesheet_line for select
  using (
    exists (
      select 1 from work_timesheet ts
      where ts.id = work_timesheet_line.timesheet_id
        and (
          ts.employee_id in (select id from hr_employee where user_id = auth.uid())
          or auth.jwt() ->> 'role' in ('company_owner', 'finance_admin')
        )
    )
  );

-- RPC submit_timesheet
create or replace function submit_timesheet(
  p_employee_id  uuid,
  p_project_id   uuid,
  p_period_start date,
  p_period_end   date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_emp_user_id uuid;
  v_timesheet_id uuid;
  v_total_hours numeric;
begin
  -- Kiểm tra chủ sở hữu
  select user_id into v_emp_user_id from hr_employee where id = p_employee_id;
  if v_emp_user_id != auth.uid() then
    raise exception 'FORBIDDEN' using hint = 'Chỉ chủ sở hữu được submit timesheet.';
  end if;

  -- Idempotent: nếu đã submit rồi, trả về timesheet_id hiện tại
  select id into v_timesheet_id from work_timesheet
  where employee_id = p_employee_id and project_id = p_project_id
    and period_start = p_period_start and period_end = p_period_end;

  if found then
    if (select status from work_timesheet where id = v_timesheet_id) != 'draft' then
      raise exception 'ALREADY_SUBMITTED' using hint = 'Timesheet này đã được submit.';
    end if;
  end if;

  -- Tính total hours từ worklog draft trong kỳ
  select coalesce(sum(hours), 0) into v_total_hours
  from work_worklog
  where employee_id = p_employee_id
    and project_id = p_project_id
    and logged_date between p_period_start and p_period_end
    and status = 'draft';

  if v_total_hours = 0 then
    raise exception 'NO_WORKLOG' using hint = 'Không có worklog nào trong kỳ.';
  end if;

  -- Tạo hoặc cập nhật timesheet
  insert into work_timesheet(employee_id, project_id, period_start, period_end, total_hours, status, submitted_at, created_by)
  values (p_employee_id, p_project_id, p_period_start, p_period_end, v_total_hours, 'submitted', now(), auth.uid())
  on conflict (employee_id, project_id, period_start, period_end)
  do update set status = 'submitted', total_hours = v_total_hours, submitted_at = now()
  returning id into v_timesheet_id;

  -- Tạo timesheet lines từ worklog
  delete from work_timesheet_line where timesheet_id = v_timesheet_id;
  insert into work_timesheet_line(timesheet_id, worklog_id, hours, is_billable, logged_date)
  select v_timesheet_id, id, hours, is_billable, logged_date
  from work_worklog
  where employee_id = p_employee_id
    and project_id = p_project_id
    and logged_date between p_period_start and p_period_end
    and status = 'draft';

  -- Cập nhật worklog status → submitted
  update work_worklog
  set status = 'submitted'
  where employee_id = p_employee_id
    and project_id = p_project_id
    and logged_date between p_period_start and p_period_end
    and status = 'draft';

  -- Audit
  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'work_timesheet', v_timesheet_id, 'RPC:submit_timesheet',
          jsonb_build_object('total_hours', v_total_hours));

  return v_timesheet_id;
end;
$$;
```

**pgTAP test `tests/work_timesheet.sql`:**
- [ ] Employee A submit timesheet cho employee B → FORBIDDEN.
- [ ] Submit lần 2 cùng timesheet (status != draft) → ALREADY_SUBMITTED.
- [ ] Submit khi không có worklog → NO_WORKLOG.
- [ ] Submit thành công → status = `submitted`, lines được tạo.

**Frontend:**
- [ ] Trang `/timesheet`: chọn project + period → xem worklog summary.
- [ ] Nút "Submit Timesheet" → gọi RPC.
- [ ] Trạng thái timesheet hiển thị rõ ràng với stepper.

### Definition of Done

- [ ] Submit timesheet → status `submitted`; worklog status → `submitted`.
- [ ] Submit lần 2 bị reject với thông báo rõ.
- [ ] pgTAP test pass.

### Ước lượng: 2–3 giờ

---

## 5c. Approval flow (leader → PM)

**Mục tiêu:** Leader review (cấp 1) → PM approve (cấp 2); reject/resubmit được; SoD: người submit không tự approve.

### Việc làm

**Migration `supabase migration new work_approval`:**
```sql
create type approval_step as enum ('leader', 'pm');
create type approval_decision as enum ('approved', 'rejected');

create table work_approval_step (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references work_timesheet on delete cascade,
  step         approval_step not null,
  decision     approval_decision,
  decided_by   uuid references auth.users,
  decided_at   timestamptz,
  reason       text,
  created_at   timestamptz not null default now()
);

alter table work_approval_step enable row level security;

create policy "approval_read" on work_approval_step for select
  using (
    auth.jwt() ->> 'role' in ('company_owner', 'finance_admin', 'hr_admin')
    or exists (
      select 1 from work_timesheet ts
      join project_membership pm on pm.project_id = ts.project_id
      where ts.id = work_approval_step.timesheet_id
        and pm.user_id = auth.uid()
        and pm.project_role in ('pm', 'team_leader')
        and pm.status = 'active'
    )
  );

-- RPC approve_timesheet_step
create or replace function approve_timesheet_step(
  p_timesheet_id uuid,
  p_step         approval_step
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_ts         work_timesheet;
  v_caller_role text;
  v_caller_proj_role text;
  v_employee_user_id uuid;
begin
  select * into v_ts from work_timesheet where id = p_timesheet_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- SoD: caller không phải chủ sở hữu timesheet
  select user_id into v_employee_user_id from hr_employee where id = v_ts.employee_id;
  if v_employee_user_id = auth.uid() then
    raise exception 'SOD_VIOLATION' using hint = 'Không thể tự approve timesheet của mình.';
  end if;

  v_caller_role := auth.jwt() ->> 'role';
  v_caller_proj_role := auth.user_project_role(v_ts.project_id);

  if p_step = 'leader' then
    if v_ts.status != 'submitted' then
      raise exception 'INVALID_STATE';
    end if;
    -- Caller phải là team_leader của project hoặc company_owner/hr_admin
    if v_caller_proj_role != 'team_leader' and v_caller_role not in ('company_owner', 'hr_admin') then
      raise exception 'FORBIDDEN' using hint = 'Chỉ team_leader được approve bước leader.';
    end if;
    update work_timesheet set status = 'leader_approved', updated_at = now() where id = p_timesheet_id;

  elsif p_step = 'pm' then
    if v_ts.status != 'leader_approved' then
      raise exception 'INVALID_STATE';
    end if;
    -- Caller phải là pm của project hoặc company_owner
    if v_caller_proj_role != 'pm' and v_caller_role not in ('company_owner') then
      raise exception 'FORBIDDEN' using hint = 'Chỉ pm được approve bước pm.';
    end if;
    update work_timesheet set status = 'pm_approved', updated_at = now() where id = p_timesheet_id;
    -- Cập nhật worklog → approved
    update work_worklog set status = 'approved'
    where id in (select worklog_id from work_timesheet_line where timesheet_id = p_timesheet_id);
  end if;

  insert into work_approval_step(timesheet_id, step, decision, decided_by, decided_at)
  values (p_timesheet_id, p_step, 'approved', auth.uid(), now());

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'work_timesheet', p_timesheet_id,
          'RPC:approve_step:' || p_step, jsonb_build_object('step', p_step));
end;
$$;

-- RPC reject_timesheet
create or replace function reject_timesheet(p_timesheet_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ts work_timesheet;
  v_step approval_step;
begin
  select * into v_ts from work_timesheet where id = p_timesheet_id for update;
  if v_ts.status not in ('submitted', 'leader_approved') then
    raise exception 'INVALID_STATE';
  end if;

  v_step := case when v_ts.status = 'submitted' then 'leader' else 'pm' end::approval_step;

  update work_timesheet set status = 'draft', updated_at = now() where id = p_timesheet_id;
  -- Revert worklog về draft
  update work_worklog set status = 'draft'
  where id in (select worklog_id from work_timesheet_line where timesheet_id = p_timesheet_id);

  insert into work_approval_step(timesheet_id, step, decision, decided_by, decided_at, reason)
  values (p_timesheet_id, v_step, 'rejected', auth.uid(), now(), p_reason);

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'work_timesheet', p_timesheet_id, 'RPC:reject_timesheet',
          jsonb_build_object('reason', p_reason));
end;
$$;
```

**pgTAP test `tests/timesheet_approval.sql`:**
- [ ] Employee tự approve timesheet của mình → SOD_VIOLATION.
- [ ] `developer` gọi `approve_timesheet_step('leader')` → FORBIDDEN.
- [ ] `team_leader` approve `submitted` → `leader_approved`.
- [ ] `team_leader` approve `pm_approved` (sai state) → INVALID_STATE.
- [ ] Reject → timesheet về `draft`; resubmit được.

**Frontend:**
- [ ] Trang leader: danh sách timesheet pending review; nút Approve/Reject.
- [ ] Trang PM: danh sách `leader_approved`; nút Approve/Reject.
- [ ] Form reject: bắt buộc nhập lý do.
- [ ] Notification khi timesheet bị reject (Phase 6 sẽ bổ sung realtime).

### Definition of Done

- [ ] Timesheet đi đủ 2 bước; audit log ghi đủ.
- [ ] Reject → resubmit → approve đúng luồng.
- [ ] pgTAP SoD test pass.

### Ước lượng: 3–4 giờ

---

## 5d. Lock timesheet và điều chỉnh

**Mục tiêu:** PM lock kỳ sau khi approved; sửa sau khi lock phải qua flow điều chỉnh riêng.

### Việc làm

**Migration `supabase migration new rpc_lock_timesheet`:**
```sql
-- Trigger chặn UPDATE/DELETE trên timesheet đã locked
create or replace function fn_prevent_locked_timesheet_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'locked' and new.status != 'locked' then
    raise exception 'LOCKED' using hint = 'Timesheet đã khóa không thể thay đổi trực tiếp.';
  end if;
  if old.status = 'locked' and (
    new.total_hours != old.total_hours
    -- thêm các field khác nếu cần
  ) then
    raise exception 'LOCKED' using hint = 'Timesheet đã khóa không thể thay đổi.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_locked_timesheet
  before update on work_timesheet
  for each row execute function fn_prevent_locked_timesheet_update();

-- RPC lock_timesheet_period
create or replace function lock_timesheet_period(
  p_project_id   uuid,
  p_period_start date,
  p_period_end   date
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_caller_proj_role text;
begin
  v_caller_proj_role := auth.user_project_role(p_project_id);

  if v_caller_proj_role != 'pm' and auth.jwt() ->> 'role' != 'company_owner' then
    raise exception 'FORBIDDEN' using hint = 'Chỉ pm được lock kỳ timesheet.';
  end if;

  -- Kiểm tra còn timesheet chưa approved
  if exists (
    select 1 from work_timesheet
    where project_id = p_project_id
      and period_start = p_period_start
      and period_end = p_period_end
      and status not in ('pm_approved', 'locked')
  ) then
    raise exception 'HAS_UNAPPROVED' using hint = 'Còn timesheet chưa được approve. Không thể lock kỳ.';
  end if;

  update work_timesheet
  set status = 'locked', locked_at = now(), locked_by = auth.uid()
  where project_id = p_project_id
    and period_start = p_period_start
    and period_end = p_period_end
    and status = 'pm_approved';

  get diagnostics v_count = row_count;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'work_timesheet', p_project_id, 'RPC:lock_timesheet_period',
          jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end, 'locked_count', v_count));

  return v_count;
end;
$$;

-- RPC request_timesheet_adjustment (tạo ticket điều chỉnh)
create table work_timesheet_adjustment (
  id           uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references work_timesheet,
  reason       text not null,
  requested_by uuid references auth.users,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending', -- 'pending', 'approved', 'rejected'
  resolved_by  uuid references auth.users,
  resolved_at  timestamptz
);

alter table work_timesheet_adjustment enable row level security;
create policy "adj_read" on work_timesheet_adjustment for select
  using (requested_by = auth.uid() or auth.jwt() ->> 'role' in ('company_owner', 'project_manager'));
create policy "adj_insert" on work_timesheet_adjustment for insert
  with check (requested_by = auth.uid());

create or replace function request_timesheet_adjustment(p_timesheet_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_adj_id uuid;
begin
  if not exists (select 1 from work_timesheet where id = p_timesheet_id and status = 'locked') then
    raise exception 'NOT_LOCKED' using hint = 'Chỉ điều chỉnh timesheet đã lock.';
  end if;

  insert into work_timesheet_adjustment(timesheet_id, reason, requested_by)
  values (p_timesheet_id, p_reason, auth.uid())
  returning id into v_adj_id;

  return v_adj_id;
end;
$$;
```

**pgTAP test `tests/timesheet_lock.sql`:**
- [ ] UPDATE trực tiếp timesheet đã `locked` → trigger raise exception.
- [ ] `developer` gọi `lock_timesheet_period` → FORBIDDEN.
- [ ] Lock khi còn timesheet `submitted` (chưa approve) → HAS_UNAPPROVED.
- [ ] Lock thành công → trả số timesheet được lock.

**Frontend:**
- [ ] Nút "Lock Period" trên trang PM (chỉ hiện khi tất cả đã pm_approved).
- [ ] Form "Yêu cầu điều chỉnh" khi xem timesheet đã locked.

### Definition of Done

- [ ] UPDATE trực tiếp timesheet đã locked bị trigger chặn.
- [ ] Lock period thành công; count đúng.
- [ ] pgTAP test pass.

### Ước lượng: 2–3 giờ

---

## 5e. Dashboard MVP

**Mục tiêu:** PM và company_owner xem utilization team, issue health, timesheet status với dữ liệu thật.

### Việc làm

**Migration `supabase migration new views_dashboard`:**
```sql
-- Project health
create view dashboard_project_health as
  select
    p.id as project_id,
    p.name as project_name,
    p.status,
    count(i.id) filter (where i.status = 'backlog')    as issues_backlog,
    count(i.id) filter (where i.status in ('todo', 'in_progress', 'in_review')) as issues_open,
    count(i.id) filter (where i.status = 'done')       as issues_done,
    count(i.id) filter (where i.is_overdue)            as issues_overdue,
    count(m.id) filter (where m.health = 'overdue')    as milestones_overdue,
    count(m.id) filter (where m.health = 'on_track')   as milestones_on_track
  from project_project p
  left join work_issue_with_sla i on i.project_id = p.id
  left join project_milestone_with_health m on m.project_id = p.id
  where p.status = 'active'
  group by p.id, p.name, p.status;

-- Team utilization trong kỳ
create view dashboard_team_utilization as
  select
    e.id as employee_id,
    e.full_name,
    e.department,
    sum(ts.total_hours) as approved_hours,
    count(distinct ts.project_id) as active_projects
  from hr_employee e
  left join work_timesheet ts on ts.employee_id = e.id
    and ts.status in ('pm_approved', 'locked')
  where e.status = 'active'
  group by e.id, e.full_name, e.department;

-- Timesheet status per project per period
create view dashboard_timesheet_status as
  select
    p.id as project_id,
    p.name as project_name,
    ts.period_start,
    ts.period_end,
    count(*) filter (where ts.status = 'draft')           as count_draft,
    count(*) filter (where ts.status = 'submitted')       as count_submitted,
    count(*) filter (where ts.status = 'leader_approved') as count_leader_approved,
    count(*) filter (where ts.status = 'pm_approved')     as count_pm_approved,
    count(*) filter (where ts.status = 'locked')          as count_locked
  from project_project p
  join work_timesheet ts on ts.project_id = p.id
  group by p.id, p.name, ts.period_start, ts.period_end;
```

**Frontend trang `/dashboard`:**
- [ ] Card project health: số issue open/done/overdue per project.
- [ ] Bảng team utilization: employee, approved hours, active projects.
- [ ] Bảng timesheet status: project, kỳ, số timesheet theo từng trạng thái.
- [ ] Filter theo project, period.
- [ ] Chart burndown đơn giản (nếu dùng Recharts).

### Definition of Done

- [ ] Dashboard hiển thị đúng số liệu với dữ liệu thật (không mock).
- [ ] `developer` thấy dashboard nhưng chỉ thấy project của mình (RLS membership).
- [ ] `pm` thấy đầy đủ team utilization.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `dashboard_project_health` | View |
| `dashboard_team_utilization` | View |
| `dashboard_timesheet_status` | View |

### Ước lượng: 3–4 giờ

---

## Kết quả Phase 5 — MVP hoàn chỉnh

Sau khi hoàn thành phase này, hệ thống có thể vận hành thật:
- Nhân sự ghi worklog → submit timesheet → leader review → PM approve → lock kỳ.
- PM theo dõi utilization, issue health, timesheet status qua dashboard.
- Dữ liệu approved hours sẵn sàng cho Phase 7 (billing) và Phase 8 (payroll export).

**Tiêu chí nghiệm thu MVP:**
- [ ] 1 nhân sự ghi worklog → submit → leader approve → pm approve → pm lock kỳ.
- [ ] Mọi pgTAP test từ Phase 0-5 pass.
- [ ] Migration chạy trên DB mới và DB có dữ liệu cũ.
- [ ] `supabase db reset` + seed → demo được end-to-end.
