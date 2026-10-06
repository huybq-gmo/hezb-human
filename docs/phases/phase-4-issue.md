# Phase 4: Issue & Sprint

> **Mục tiêu phase:** Jira-like issue management với workflow có kiểm soát, sprint, board, comment, attachment và SLA cảnh báo.

**Dependency:** Phase 3 hoàn chỉnh (cần `project_project`, `project_membership`).  
**Ước lượng tổng:** 11–16 giờ.

---

## Checklist tổng quan

- [ ] 4a. Issue CRUD
- [ ] 4b. Sprint và Kanban board
- [ ] 4c. Workflow transition có kiểm soát
- [ ] 4d. Comment và attachment
- [ ] 4e. SLA cảnh báo

---

## 4a. Issue CRUD

**Mục tiêu:** Tạo Epic, Story, Task, Bug với parent/child; chỉ member của project mới thấy issue.

### Việc làm

**Migration `supabase migration new work_issue`:**
```sql
create type issue_type as enum ('epic', 'story', 'task', 'subtask', 'bug');
create type issue_priority as enum ('critical', 'high', 'medium', 'low');
create type issue_status as enum ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled', 'blocked');

create table work_issue (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references project_project on delete cascade,
  sprint_id      uuid, -- FK sang work_sprint, thêm sau 4b
  parent_id      uuid references work_issue on delete set null,
  type           issue_type not null default 'task',
  title          text not null,
  description    text,
  status         issue_status not null default 'backlog',
  priority       issue_priority not null default 'medium',
  assignee_id    uuid references auth.users,
  reporter_id    uuid references auth.users,
  story_points   int,
  due_date       date,
  board_order    int default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users,
  version        integer not null default 1
);

alter table work_issue enable row level security;

-- Chỉ member active của project mới xem được issue
create policy "project_member_read_issue" on work_issue for select
  using (
    auth.jwt() ->> 'role' in ('company_owner', 'director')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = work_issue.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and (pm.end_date is null or pm.end_date >= current_date)
    )
  );

-- Member INSERT issue trong project của mình
create policy "project_member_insert_issue" on work_issue for insert
  with check (
    auth.jwt() ->> 'role' in ('company_owner', 'project_manager')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = work_issue.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and (pm.end_date is null or pm.end_date >= current_date)
    )
  );

-- UPDATE qua RPC transition_issue (status); các field khác update trực tiếp nếu có quyền
create policy "project_member_update_issue" on work_issue for update
  using (
    auth.jwt() ->> 'role' in ('company_owner', 'project_manager')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = work_issue.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
    )
  );

-- Audit trigger
create trigger trg_work_issue_audit
  after insert or update on work_issue
  for each row execute function fn_audit_log();
```

**pgTAP test `tests/work_issue_rls.sql`:**
- [ ] User không có membership trong project → SELECT 0 rows.
- [ ] User có membership active → SELECT thấy issues.
- [ ] User membership expired → SELECT 0 rows.

**Frontend trang `/projects/[id]/issues`:**
- [ ] Danh sách issue: type icon, title, status, priority, assignee avatar.
- [ ] Form tạo issue: type, title, description, priority, due_date, parent_id.
- [ ] Trang chi tiết issue: full info + edit inline.

### Definition of Done

- [ ] Tạo epic với 2 story con; parent_id trỏ đúng.
- [ ] `developer` không thuộc project không SELECT được issue.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `work_issue` | Table |
| `issue_type`, `issue_priority`, `issue_status` | Enums |

### Ước lượng: 2–3 giờ

---

## 4b. Sprint và Kanban board

**Mục tiêu:** Tạo sprint, gán issue vào sprint, kéo thả đổi status trên board.

### Việc làm

**Migration `supabase migration new work_sprint`:**
```sql
create type sprint_status as enum ('planning', 'active', 'completed');

create table work_sprint (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project_project on delete cascade,
  name        text not null,
  goal        text,
  status      sprint_status not null default 'planning',
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users,
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

alter table work_sprint enable row level security;

create policy "project_member_sprint" on work_sprint for all
  using (
    auth.jwt() ->> 'role' in ('company_owner', 'project_manager')
    or exists (
      select 1 from project_membership pm
      where pm.project_id = work_sprint.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
    )
  )
  with check (auth.jwt() ->> 'role' in ('company_owner', 'project_manager'));

-- Thêm FK sprint_id vào work_issue
alter table work_issue add column sprint_id uuid references work_sprint;
```

**Frontend:**
- [ ] Trang `/projects/[id]/board`: Kanban với cột `todo`, `in_progress`, `in_review`, `done`.
- [ ] Kéo thả issue giữa cột → gọi `supabase.rpc('transition_issue', ...)` (thêm sau 4c).
- [ ] Dropdown chọn sprint; nút "Start sprint", "Complete sprint".
- [ ] Backlog view: issue chưa có sprint.

### Definition of Done

- [ ] Sprint có 3 issue; board hiển thị đúng cột.
- [ ] Gán issue vào sprint → sprint_id cập nhật.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `work_sprint` | Table |
| `work_issue.sprint_id` | FK column added |

### Ước lượng: 3–4 giờ

---

## 4c. Workflow transition có kiểm soát

**Mục tiêu:** Chỉ transition hợp lệ được phép; permission theo role (QA mới được done).

### Việc làm

**Migration `supabase migration new rpc_transition_issue`:**
```sql
-- Bảng cấu hình workflow (có thể mở rộng per-project sau)
create table work_issue_workflow (
  id             uuid primary key default gen_random_uuid(),
  from_status    issue_status not null,
  to_status      issue_status not null,
  allowed_roles  text[] not null, -- project roles được phép
  constraint uq_transition unique (from_status, to_status)
);

-- Seed workflow mặc định
insert into work_issue_workflow(from_status, to_status, allowed_roles) values
  ('backlog',     'todo',        array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('todo',        'in_progress', array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('in_progress', 'in_review',   array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('in_review',   'done',        array['pm', 'team_leader', 'qa_reviewer']),  -- developer không tự done
  ('in_review',   'in_progress', array['pm', 'team_leader', 'qa_reviewer']),  -- reject review
  ('done',        'backlog',     array['pm', 'team_leader']),                  -- reopen
  ('backlog',     'cancelled',   array['pm', 'team_leader']),
  ('todo',        'cancelled',   array['pm', 'team_leader']),
  ('in_progress', 'blocked',     array['pm', 'team_leader', 'developer', 'qa_reviewer']),
  ('blocked',     'in_progress', array['pm', 'team_leader', 'developer', 'qa_reviewer']);

alter table work_issue_workflow enable row level security;
create policy "auth_read_workflow" on work_issue_workflow for select
  using (auth.uid() is not null);

-- RPC transition_issue
create or replace function transition_issue(
  p_issue_id   uuid,
  p_new_status issue_status,
  p_reason     text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_issue        work_issue;
  v_project_role text;
  v_allowed_roles text[];
begin
  select * into v_issue from work_issue where id = p_issue_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Lấy project role của caller
  v_project_role := auth.user_project_role(v_issue.project_id);

  -- company_owner bypass
  if auth.jwt() ->> 'role' = 'company_owner' then
    v_project_role := 'pm';
  end if;

  if v_project_role is null then
    raise exception 'FORBIDDEN' using hint = 'Bạn không phải thành viên project này.';
  end if;

  -- Kiểm tra transition hợp lệ
  select allowed_roles into v_allowed_roles
  from work_issue_workflow
  where from_status = v_issue.status and to_status = p_new_status;

  if not found then
    raise exception 'INVALID_TRANSITION'
      using hint = v_issue.status || ' → ' || p_new_status || ' không hợp lệ.';
  end if;

  if not (v_project_role = any(v_allowed_roles)) then
    raise exception 'FORBIDDEN'
      using hint = 'Role ' || v_project_role || ' không được phép transition này.';
  end if;

  -- Update
  update work_issue
  set status = p_new_status, updated_at = now(), updated_by = auth.uid()
  where id = p_issue_id;

  -- Audit
  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'work_issue', p_issue_id, 'transition:' || p_new_status,
          jsonb_build_object('from', v_issue.status, 'to', p_new_status, 'reason', p_reason));
end;
$$;
```

**pgTAP test `tests/rpc_transition_issue.sql`:**
- [ ] `developer` transition `in_review → done` → FORBIDDEN.
- [ ] `qa_reviewer` transition `in_review → done` → thành công.
- [ ] `todo → done` (bỏ qua in_progress) → INVALID_TRANSITION.
- [ ] `developer` transition `backlog → cancelled` → FORBIDDEN.

**Frontend:**
- [ ] Kéo thả trên board gọi `supabase.rpc('transition_issue', ...)`.
- [ ] Hiển thị lỗi rõ ràng nếu transition bị chặn.
- [ ] Dropdown status trên trang chi tiết issue.

### Definition of Done

- [ ] `developer` không tự transition `in_review → done`.
- [ ] 3 invalid transition test pass trong pgTAP.
- [ ] Audit log ghi đúng from/to.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `work_issue_workflow` | Table (config) |
| `transition_issue(uuid, issue_status, text)` | RPC |

### Ước lượng: 3–4 giờ

---

## 4d. Comment và attachment

**Mục tiêu:** Comment và file đính kèm trên issue; file dùng private bucket, signed URL.

### Việc làm

**Migration `supabase migration new work_issue_comment`:**
```sql
create table work_issue_comment (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references work_issue on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

alter table work_issue_comment enable row level security;

create policy "project_member_comment" on work_issue_comment for select
  using (
    exists (
      select 1 from work_issue i
      join project_membership pm on pm.project_id = i.project_id
      where i.id = work_issue_comment.issue_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
    )
    or auth.jwt() ->> 'role' in ('company_owner', 'director')
  );

create policy "project_member_insert_comment" on work_issue_comment for insert
  with check (
    exists (
      select 1 from work_issue i
      join project_membership pm on pm.project_id = i.project_id
      where i.id = work_issue_comment.issue_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
    )
  );

-- Chỉ chủ sở hữu sửa comment của mình (soft delete)
create policy "owner_update_comment" on work_issue_comment for update
  using (created_by = auth.uid());
```

**Supabase Storage:**
- [ ] Trong Dashboard → Storage → tạo bucket `issue-attachments` (Private).
- [ ] RLS policy trên bucket:
```sql
-- Upload: chỉ member project
create policy "project_member_upload" on storage.objects for insert
  with check (
    bucket_id = 'issue-attachments'
    and auth.uid() is not null
    -- thêm kiểm tra project membership qua path naming: {project_id}/{issue_id}/{filename}
  );

-- Download: chỉ member project (signed URL)
create policy "project_member_download" on storage.objects for select
  using (bucket_id = 'issue-attachments' and auth.uid() is not null);
```

**Frontend:**
- [ ] Section comment trên trang chi tiết issue: list + form thêm comment.
- [ ] Drag & drop upload file → gọi `supabase.storage.from('issue-attachments').upload(...)`.
- [ ] Hiển thị attachment list với signed URL (1 giờ): `supabase.storage.createSignedUrl(...)`.

### Definition of Done

- [ ] Comment trên issue, xem lại được.
- [ ] Upload file → signed URL trả về; link hết hạn sau 1 giờ.
- [ ] User không thuộc project không upload/download được.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `work_issue_comment` | Table |
| `issue-attachments` | Storage bucket (private) |

### Ước lượng: 2–3 giờ

---

## 4e. SLA cảnh báo

**Mục tiêu:** Issue quá `due_date` hiển thị badge cảnh báo trên board.

### Việc làm

**Migration `supabase migration new view_issue_sla`:**
```sql
create view work_issue_with_sla as
  select
    i.*,
    case
      when i.status in ('done', 'cancelled') then false
      when i.due_date is null then false
      when i.due_date < current_date then true
      else false
    end as is_overdue,
    case
      when i.status in ('done', 'cancelled') then 'completed'
      when i.due_date is null then 'no_deadline'
      when i.due_date < current_date then 'overdue'
      when i.due_date <= current_date + 3 then 'at_risk'
      else 'on_track'
    end as sla_status
  from work_issue i;
```

**Frontend:**
- [ ] Board: badge đỏ "Overdue" trên issue card nếu `is_overdue = true`.
- [ ] Badge cam "At Risk" nếu `sla_status = 'at_risk'`.
- [ ] Backlog: filter "Overdue only".

### Definition of Done

- [ ] Issue có `due_date` hôm qua → `is_overdue = true`, badge đỏ xuất hiện.

### Bảng / RPC liên quan

| Tên | Loại |
|---|---|
| `work_issue_with_sla` | View |

### Ước lượng: 1–2 giờ

---

## Kết quả Phase 4

Sau khi hoàn thành phase này:
- Issue management đầy đủ với parent/child, sprint, board.
- Workflow có kiểm soát: chỉ QA/PM mới `done` được issue.
- Comment, attachment với private bucket và signed URL.
- SLA cảnh báo trực quan trên board.
- Sẵn sàng nhận worklog từ Phase 5.
