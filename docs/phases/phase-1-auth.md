# Phase 1: Auth & Phân Quyền

> **Mục tiêu phase:** Có hệ thống đăng nhập, JWT chứa role, RLS policy cơ bản hoạt động, project membership model sẵn sàng. Sau phase này mọi API đã có auth guard.

**Dependency:** Phase 0 hoàn chỉnh.  
**Ước lượng tổng:** 12–16 giờ.

---

## Checklist tổng quan

- [ ] 1a. Supabase Auth cơ bản
- [ ] 1b. Role assignment và JWT claim
- [ ] 1c. Project membership model
- [ ] 1d. UI quản lý role

---

## 1a. Supabase Auth cơ bản

**Mục tiêu:** Đăng nhập email+password, nhận session, refresh, logout — profile tạo tự động khi user mới.

### Việc làm

**Supabase Dashboard:**
- [ ] Vào `Authentication > Providers` → bật Email provider.
- [ ] Tắt `Confirm email` (môi trường internal — bật lại khi staging).

**Migration `supabase migration new core_user_profile`:**
```sql
create table core_user_profile (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table core_user_profile enable row level security;

-- Mọi authenticated user đọc được profile
create policy "auth_read_profile" on core_user_profile for select
  using (auth.uid() is not null);

-- Chỉ chủ sở hữu hoặc admin cập nhật
create policy "owner_update_profile" on core_user_profile for update
  using (auth.uid() = id or auth.jwt() ->> 'role' in ('company_owner', 'hr_admin'));

-- Trigger tạo profile khi user mới
create or replace function fn_on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into core_user_profile(id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function fn_on_auth_user_created();
```

**Frontend:**
- [ ] Tạo trang `/login` với form email + password, dùng `supabase.auth.signInWithPassword()`.
- [ ] Tạo `src/middleware.ts` guard: redirect về `/login` nếu không có session.
- [ ] Tạo `src/app/(auth)/layout.tsx` và `src/app/(dashboard)/layout.tsx` để phân vùng route.
- [ ] Trang `/profile` xem `core_user_profile` của user hiện tại.

**pgTAP test `tests/user_profile_rls.sql`:**
- [ ] Authenticated user SELECT được profile của mình → expect 1 row.
- [ ] Unauthenticated request SELECT → expect 0 rows.

### Definition of Done

- [ ] Đăng nhập qua UI → nhận session JWT.
- [ ] `core_user_profile` tạo tự động khi register/insert user mới.
- [ ] Route `/dashboard` redirect về `/login` khi chưa xác thực.
- [ ] pgTAP test pass.

### Bảng / RPC liên quan

| Tên | Loại | Mô tả |
|---|---|---|
| `core_user_profile` | Table | Profile nội bộ liên kết auth.users |
| `fn_on_auth_user_created()` | Trigger function | Tạo profile khi user mới |

### Dependency

Phase 0 (0a, 0b).

### Ước lượng: 3–4 giờ

---

## 1b. Role assignment và JWT claim

**Mục tiêu:** Gán role cho user; JWT chứa role để RLS dùng trong mọi policy sau này.

### Việc làm

**Migration `supabase migration new core_role_assignment`:**
```sql
create type app_role as enum (
  'company_owner', 'hr_admin', 'finance_admin', 'director',
  'project_manager', 'team_leader', 'developer', 'qa_reviewer', 'auditor'
);

create table core_role_assignment (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  role        app_role not null,
  granted_by  uuid references auth.users,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint uq_user_role unique (user_id, role)
);

alter table core_role_assignment enable row level security;

-- Chỉ company_owner và hr_admin xem được
create policy "admin_read_roles" on core_role_assignment for select
  using (auth.jwt() ->> 'role' in ('company_owner', 'hr_admin'));

-- Helper function đọc role từ JWT
create or replace function auth.user_has_role(required_role text)
returns boolean language sql stable security definer as $$
  select (auth.jwt() ->> 'role') = required_role
     or  required_role = any(
           array(select jsonb_array_elements_text(auth.jwt() -> 'roles'))
         );
$$;

-- Ghi audit khi thay đổi role
create trigger trg_role_assignment_audit
  after insert or update on core_role_assignment
  for each row execute function fn_audit_log();
```

**Auth Hook — Custom Access Token Hook:**
- [ ] Trong Supabase Dashboard → `Authentication > Hooks` → thêm hook `custom_access_token_hook`.
- [ ] Tạo function `auth.custom_access_token_hook`:
```sql
create or replace function auth.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer as $$
declare
  claims jsonb;
  user_role text;
begin
  claims := event -> 'claims';
  select role::text into user_role
  from core_role_assignment
  where user_id = (event ->> 'user_id')::uuid
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by granted_at desc
  limit 1;
  
  if user_role is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
  end if;
  
  return jsonb_set(event, '{claims}', claims);
end;
$$;
```

**Seed data:**
```sql
-- Tạo 2 user mẫu (chạy local dev)
-- Sau khi tạo user qua Auth, insert role:
insert into core_role_assignment(user_id, role, granted_by)
values ('<company_owner_uid>', 'company_owner', '<company_owner_uid>');

insert into core_role_assignment(user_id, role, granted_by)
values ('<developer_uid>', 'developer', '<company_owner_uid>');
```

**pgTAP test `tests/role_assignment_rls.sql`:**
- [ ] `company_owner` SELECT được `core_role_assignment` → expect rows.
- [ ] `developer` SELECT `core_role_assignment` → expect 0 rows.
- [ ] JWT claim của `company_owner` chứa `role = 'company_owner'`.

### Definition of Done

- [ ] Gán role → JWT claim cập nhật sau khi refresh token.
- [ ] RLS policy dùng `auth.jwt() ->> 'role'` hoạt động đúng.
- [ ] pgTAP test pass (allow/deny theo role).

### Bảng / RPC liên quan

| Tên | Loại | Mô tả |
|---|---|---|
| `core_role_assignment` | Table | System role của user |
| `app_role` | Enum | Danh sách role hệ thống |
| `auth.user_has_role(role)` | SQL Function | Helper dùng trong RLS policy |
| `auth.custom_access_token_hook()` | Auth Hook | Ghi role vào JWT claim |

### Dependency

1a.

### Ước lượng: 3–4 giờ

---

## 1c. Project membership model

**Mục tiêu:** User có project-scoped role (PM, Developer, QA) độc lập với system role; membership hết hạn bị chặn.

### Việc làm

**Migration `supabase migration new project_membership`:**
```sql
create type project_role as enum (
  'pm', 'team_leader', 'developer', 'qa_reviewer'
);

create type membership_status as enum ('active', 'revoked', 'expired');

create table project_membership (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null, -- FK sang project_project (Phase 3)
  user_id      uuid not null references auth.users on delete cascade,
  project_role project_role not null,
  granted_by   uuid references auth.users,
  start_date   date not null default current_date,
  end_date     date,
  status       membership_status not null default 'active',
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  constraint uq_project_user_role unique (project_id, user_id, project_role)
);

alter table project_membership enable row level security;

-- Đọc: member active của project, hoặc admin/pm
create policy "member_read_own_membership" on project_membership for select
  using (
    user_id = auth.uid()
    or auth.jwt() ->> 'role' in ('company_owner', 'hr_admin', 'project_manager')
  );

-- INSERT: chỉ qua RPC (policy deny INSERT trực tiếp)
create policy "no_direct_insert_membership" on project_membership for insert
  with check (false); -- chỉ RPC security definer được insert

-- Helper function
create or replace function auth.user_project_role(p_project_id uuid)
returns text language sql stable security definer as $$
  select project_role::text
  from project_membership
  where project_id = p_project_id
    and user_id = auth.uid()
    and status = 'active'
    and (end_date is null or end_date >= current_date)
  limit 1;
$$;

-- Trigger audit
create trigger trg_project_membership_audit
  after insert or update on project_membership
  for each row execute function fn_audit_log();
```

**pgTAP test `tests/project_membership_rls.sql`:**
- [ ] User active membership → `auth.user_project_role(project_id)` trả đúng role.
- [ ] User membership `end_date < today` → `auth.user_project_role` trả null.
- [ ] INSERT trực tiếp vào `project_membership` → bị RLS chặn.
- [ ] `company_owner` SELECT được tất cả membership.

### Definition of Done

- [ ] Migration chạy được.
- [ ] pgTAP test pass (expired membership bị chặn, INSERT trực tiếp bị chặn).
- [ ] `auth.user_project_role()` trả đúng role cho membership active.

### Bảng / RPC liên quan

| Tên | Loại | Mô tả |
|---|---|---|
| `project_membership` | Table | Project-scoped role |
| `project_role` | Enum | PM, team_leader, developer, qa_reviewer |
| `auth.user_project_role(uuid)` | SQL Function | Helper dùng trong RLS policy phase sau |

### Dependency

1b.

### Ước lượng: 3–4 giờ

---

## 1d. UI quản lý role

**Mục tiêu:** `company_owner` gán/thu hồi role qua UI; mọi thay đổi ghi audit log.

### Việc làm

**Migration `supabase migration new rpc_role_management`:**
```sql
-- RPC gán role
create or replace function assign_role(
  p_target_user_id uuid,
  p_role           app_role,
  p_expires_at     timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Kiểm tra caller là company_owner
  if auth.jwt() ->> 'role' != 'company_owner' then
    raise exception 'FORBIDDEN' using hint = 'Chỉ company_owner được gán role.';
  end if;

  insert into core_role_assignment(user_id, role, granted_by, expires_at)
  values (p_target_user_id, p_role, auth.uid(), p_expires_at)
  on conflict (user_id, role) do update
    set revoked_at = null, expires_at = p_expires_at, granted_by = auth.uid();

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'core_role_assignment', p_target_user_id, 'RPC:assign_role',
          jsonb_build_object('user_id', p_target_user_id, 'role', p_role));
end;
$$;

-- RPC thu hồi role
create or replace function revoke_role(
  p_target_user_id uuid,
  p_role           app_role
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() ->> 'role' != 'company_owner' then
    raise exception 'FORBIDDEN' using hint = 'Chỉ company_owner được thu hồi role.';
  end if;

  update core_role_assignment
  set revoked_at = now()
  where user_id = p_target_user_id and role = p_role and revoked_at is null;

  insert into audit_log(actor_id, table_name, record_id, action, after_masked)
  values (auth.uid(), 'core_role_assignment', p_target_user_id, 'RPC:revoke_role',
          jsonb_build_object('user_id', p_target_user_id, 'role', p_role));
end;
$$;
```

**Frontend trang `/admin/users`:**
- [ ] Danh sách users + role hiện tại (chỉ hiển thị với `company_owner`).
- [ ] Form gán role: chọn user → chọn role → optional expires_at → submit gọi `supabase.rpc('assign_role', {...})`.
- [ ] Nút thu hồi role → gọi `supabase.rpc('revoke_role', {...})`.
- [ ] Sau khi gán/thu hồi: hiển thị toast thông báo; yêu cầu user bị đổi role phải refresh session.

**pgTAP test `tests/rpc_role_management.sql`:**
- [ ] `developer` gọi `assign_role` → raise exception `FORBIDDEN`.
- [ ] `company_owner` gọi `assign_role` → role được gán; audit log có bản ghi.
- [ ] `company_owner` gọi `revoke_role` → `revoked_at` được set.

### Definition of Done

- [ ] UI `/admin/users` chỉ hiển thị với `company_owner`; `developer` thấy 403.
- [ ] Gán role → audit log ghi đúng actor/action.
- [ ] Thu hồi role → `revoked_at` được set; JWT claim lỗi thời sau khi refresh.
- [ ] pgTAP test pass (SoD: `developer` không gọi được RPC).

### Bảng / RPC liên quan

| Tên | Loại | Mô tả |
|---|---|---|
| `assign_role()` | RPC | Gán role cho user |
| `revoke_role()` | RPC | Thu hồi role |

### Dependency

1b, 0b (audit log).

### Ước lượng: 3–4 giờ

---

## Kết quả Phase 1

Sau khi hoàn thành phase này:
- Hệ thống có auth đầy đủ: login, session, refresh, logout.
- JWT chứa role dùng được trong mọi RLS policy.
- Project membership model sẵn sàng cho Phase 3.
- `company_owner` quản lý role qua UI, mọi thay đổi có audit trail.
