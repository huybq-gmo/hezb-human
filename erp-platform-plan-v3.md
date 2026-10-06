# ERP Human Resource & Project Delivery Platform — Kế Hoạch Triển Khai (v3)

> **Thay đổi chính so với v2:** chuyển hoàn toàn sang **Supabase** (Postgres + Auth + Storage + Realtime) + **Next.js/TypeScript**. Không còn Java/Spring Boot, Keycloak, RabbitMQ, Kubernetes hay multi-tenancy. Hệ thống nội bộ một công ty, team 1-2 người, ưu tiên tốc độ delivery.

---

## 1. Tổng Quan

Nền tảng quản lý nhân sự, team và dự án **nội bộ** cho một công ty cung cấp dịch vụ IT. Luồng nghiệp vụ cốt lõi:

```
Nhân sự → Team → Rate → Client/Project → Allocation
  → Issue/Sprint → Worklog/Timesheet → Approval
  → Billing/Invoice → Payroll (approved hours → CSV)
```

### 1.1. Danh Sách Vai Trò

| Role | Mô tả |
|---|---|
| `company_owner` | Toàn quyền; thay đổi policy, approve payroll và invoice |
| `hr_admin` | Quản lý nhân sự, hợp đồng, onboarding/offboarding |
| `finance_admin` | Billing, invoice, payroll run, revenue allocation |
| `director` | Approve proposal, duyệt milestone acceptance |
| `project_manager` | Quản lý project được giao; approve timesheet |
| `team_leader` | Review worklog team scope; review timesheet cấp 1 |
| `developer` | Ghi worklog, submit timesheet; chỉ issue/worklog của mình |
| `qa_reviewer` | Transition issue sang review/accepted; ghi worklog |
| `auditor` | Chỉ đọc audit log và báo cáo được cấp; không mutation |

> Không có role `client` hay `platform_admin` — hệ thống này nội bộ, không có client portal.

### 1.2. Phạm Vi Ngoài v3

- Client portal / marketplace.
- Multi-tenancy.
- Mobile app.
- Payment gateway tích hợp tự động (chỉ ghi nhận thủ công).
- Microservice / tách service.

---

## 2. Kiến Trúc Cốt Lõi

### 2.1. Stack

| Thành phần | v2 (Spring Boot) | v3 (Supabase) |
|---|---|---|
| Backend runtime | Java 21 + Spring Boot 3 | Postgres RPC + Supabase Edge Function (Deno) |
| Auth | Keycloak | Supabase Auth (JWT, email/password, magic link) |
| Database | PostgreSQL (schema-per-module) | Supabase Postgres (prefix-per-group, 1 schema public + schema riêng) |
| Authorization | Spring Security + custom RBAC | Row-Level Security (RLS) + RPC security definer |
| Message bus | RabbitMQ / ApplicationEventPublisher | Postgres triggers + Supabase Realtime |
| File storage | MinIO / S3 | Supabase Storage |
| Email | SMTP bean | Supabase Edge Function → Resend (giai đoạn sau) |
| Frontend | Next.js + REST | Next.js + `supabase-js` (trực tiếp, không backend riêng) |
| Container/Deploy | Docker Compose + Kubernetes | Supabase Cloud (Free) + Vercel/Netlify |
| Observability | Prometheus/Grafana/Jaeger | Supabase Dashboard logs + structured log trong Edge Function |
| Testing | JUnit 5 + Testcontainers | pgTAP (DB logic) + Vitest (frontend) + Playwright (E2E) |
| Migration | Flyway | Supabase CLI (`supabase db push` / `supabase migration`) |

### 2.2. Nguyên Tắc Kiến Trúc

1. **Frontend gọi Supabase trực tiếp** qua `supabase-js`; không có backend API server riêng.
2. **RLS là tuyến phòng thủ chính** — bật và deny-by-default cho mọi bảng. Frontend không thể đọc/ghi dữ liệu ngoài policy.
3. **Nghiệp vụ nhạy cảm đi qua RPC** (`security definer`, `set search_path`) — approval, lock kỳ, invoice, payroll. RPC kiểm tra quyền, state transition và separation of duties (SoD) trong một transaction.
4. **Không đưa `service_role` key xuống frontend.** Edge Function dùng `service_role` khi cần bypass RLS (chỉ cho background job).
5. **Audit log append-only** bằng trigger — không cho UPDATE/DELETE trên bảng `audit_log`.
6. **Dữ liệu nhạy cảm (rate, lương, margin) tách bảng/view riêng** vì RLS không lọc theo cột. Bảng `hr_employee_rate`, `finance_payroll_line`, `finance_revenue_allocation` có RLS riêng.
7. **Edge Function chỉ dùng khi** logic không phù hợp SQL: gửi email, gọi webhook ngoài, tính toán nặng không thể PL/pgSQL.

> **Lưu ý Free Plan:** 500 MB DB, 1 GB storage, 2 GB bandwidth/tháng, 500K Edge Function invocations/tháng, 50K Auth MAU. Theo dõi usage; upgrade Pro khi cần PITR và branching.

### 2.3. Luồng Request Chuẩn

```
Browser (supabase-js)
  → [Supabase Auth] kiểm tra JWT
  → [RLS policy] kiểm tra role/membership
  → [Postgres table / RPC]
     └── nếu nhạy cảm: RPC security definer kiểm tra thêm SoD + state
     └── trigger → audit_log
     └── trigger → notify (Realtime channel)
  ← response JSON
```

---

## 3. Tổ Chức Schema và Module

### 3.1. Nhóm Module (từ 15 → 5 nhóm)

| Nhóm | Prefix bảng | Nội dung |
|---|---|---|
| **hr** | `hr_` | employee, contract, skill, rate, team, attendance, leave |
| **project** | `project_` | client, proposal, project, milestone, allocation, membership |
| **work** | `work_` | issue, sprint, board, worklog, timesheet, approval |
| **finance** | `finance_` | invoice, payment, payroll_period, payroll_line, revenue_allocation |
| **core** | `core_` / `audit_` | user_profile, role_assignment, permission, audit_log, notification |

### 3.2. Tổ Chức Schema Postgres

```
public schema (exposed qua PostgREST / supabase-js):
├── core_user_profile
├── core_role_assignment
├── core_notification
├── hr_employee, hr_contract, hr_skill, hr_rate, hr_team, hr_team_member
├── hr_leave_request, hr_leave_balance
├── project_client, project_proposal, project_project
├── project_milestone, project_allocation, project_membership
├── work_issue, work_sprint, work_worklog, work_timesheet, work_timesheet_line
├── work_approval_step
├── finance_invoice, finance_payment, finance_payroll_period
├── finance_payroll_line, finance_revenue_allocation
└── audit_log (append-only, trigger-fed)

internal schema (KHÔNG expose ra ngoài — chỉ dùng trong RPC/trigger):
└── internal_* (helper function, secret config)
```

> Supabase chỉ expose schema được liệt kê trong `supabase/config.toml`. Mặc định chỉ có `public`; nếu cần schema riêng (ví dụ `internal`), khai báo thêm và **không** thêm vào exposed list.

### 3.3. Convention Bảng

Mọi bảng nghiệp vụ có:
```sql
id          uuid primary key default gen_random_uuid(),
created_at  timestamptz not null default now(),
created_by  uuid references auth.users,
updated_at  timestamptz not null default now(),
updated_by  uuid references auth.users,
version     integer not null default 1  -- optimistic locking
```

- Không có `tenant_id` — hệ thống single-tenant.
- Foreign key xuyên nhóm chỉ dùng ID (UUID), không join trực tiếp — read model nếu cần denormalize.
- Tiền dùng `numeric(18,4)` kèm cột `currency char(3) default 'VND'`.
- Ngày/giờ dùng `timestamptz` (UTC); timezone của tổ chức lưu trong bảng config.

---

## 4. Các Quyết Định Cần Chốt Trước Khi Code

| # | Quyết định | Khuyến nghị | Thời điểm chốt |
|---|---|---|---|
| 1 | **Supabase Auth provider**: email+password hay magic link? | Email+password cho nội bộ; magic link backup | Trước Phase 1 |
| 2 | **Role storage**: lưu role trong `auth.users.raw_app_meta_data` hay bảng riêng `core_role_assignment`? | Bảng riêng — dễ revoke, dễ audit; sync vào JWT claim qua Auth Hook | Trước Phase 1 |
| 3 | **Project membership model**: khi nào dùng `project_membership` vs `core_role_assignment`? | `core_role_assignment` cho system role; `project_membership` cho project-scoped role | Trước Phase 2 |
| 4 | **Timesheet lock strategy**: lock theo kỳ (period) hay theo trạng thái approved? | Lock theo `period` + `status = 'locked'`; RPC `lock_timesheet_period` | Trước Phase 4 |
| 5 | **Payroll scope MVP**: chỉ export CSV approved hours hay tính gross pay luôn? | Giai đoạn 1 chỉ export CSV; tính gross pay sau khi approval flow ổn định | Trước Phase 5 |
| 6 | **Supabase Storage**: bucket public hay private cho attachment? | Private bucket + signed URL (1 giờ) cho mọi file nhạy cảm | Trước Phase 3 |

> Ghi ADR (file markdown trong `docs/adr/`) khi đổi bất kỳ quyết định nào.

---

## 5. Nguyên Tắc Chia Sub-Phase

- Mỗi sub-phase hoàn thành trong **1 phiên vibe coding** (~2-6 giờ thực tế).
- Có **một câu mục tiêu demo** rõ ràng.
- Có danh sách **bảng/RPC liên quan** và **dependency** tường minh.
- Không chuyển sub-phase khi chưa có migration chạy được và DoD pass.

---

## 6. Definition of Done (DoD)

### Core DoD (bắt buộc mọi sub-phase)
- [ ] Migration `supabase/migrations/YYYYMMDDHHMMSS_*.sql` chạy được trên DB mới và DB có dữ liệu cũ.
- [ ] RLS bật và có ít nhất 1 test pgTAP `allow` + 1 test `deny` cho policy mới.
- [ ] RPC nhạy cảm có `security definer`, `set search_path`, kiểm tra role và state transition.
- [ ] Không log secret, token, dữ liệu thanh toán ra console.
- [ ] Demo được đúng 1 câu mục tiêu của sub-phase.

### Conditional DoD
| Điều kiện | Yêu cầu thêm |
|---|---|
| Có state transition | Test pgTAP cho invalid transition bị reject |
| Có approval / lock | Test pgTAP SoD (người tạo ≠ người approve) |
| Có dữ liệu tài chính | Test pgTAP cross-role không đọc được rate/lương |
| Có list API | Có pagination (`range`) và không trả quá 100 dòng mặc định |
| Có file upload | Dùng private bucket, signed URL, kiểm tra RLS storage policy |
| Module khác cần dữ liệu | Có trigger/event hoặc read model; không query cross-prefix trực tiếp |

---

## 7. Lộ Trình — MVP-First

### Thứ tự đúng (sửa dependency ngược của v2)

```
Phase 0: Foundation (project, schema, auth skeleton)
Phase 1: Auth & Phân quyền
Phase 2: HR — Employee, Contract, Rate, Team, Leave  ← leave cần cho Phase 3 capacity
Phase 3: Client, Project, Allocation                  ← dùng leave/rate từ Phase 2
Phase 4: Issue & Sprint
Phase 5: Worklog, Timesheet, Approval + Dashboard tối thiểu
                                        ↑ ranh giới MVP
Phase 6: Notification & Audit UI
Phase 7: Billing & Invoice
Phase 8: Payroll (approved hours → CSV → gross pay)
```

---

### Phase 0: Foundation

**0a. Khởi tạo dự án**
- Mục tiêu: `supabase start` chạy được, Next.js hiển thị trang chủ trắng.
- Bảng/RPC: _(chưa có)_
- Việc làm:
  - Khởi tạo Supabase project (Cloud Free) và local dev với Supabase CLI.
  - Khởi tạo Next.js 15 (App Router, TypeScript, Tailwind CSS, shadcn/ui).
  - Cấu hình `.env.local` với `SUPABASE_URL`, `SUPABASE_ANON_KEY` (không commit).
  - Migration đầu tiên: `create schema if not exists internal;`
  - CI: GitHub Actions chạy `supabase db push --dry-run` + `pnpm build`.
- DoD: `supabase db reset` thành công; Next.js build pass.
- Dependency: không có.
- Ước lượng: 2-3 giờ.

**0b. Schema skeleton và convention**
- Mục tiêu: bảng `audit_log` tồn tại; trigger function ghi audit dùng chung.
- Bảng/RPC: `audit_log`, `core_config`
- Việc làm:
  - `audit_log`: `actor_id uuid`, `table_name text`, `record_id uuid`, `action text`, `before_masked jsonb`, `after_masked jsonb`, `request_id uuid`, `occurred_at timestamptz`.
  - Trigger function `fn_audit_log()` dùng chung, gắn vào bảng cụ thể khi cần.
  - `core_config`: `key text primary key`, `value text` — lưu `org_timezone`, `org_locale`, `org_currency`, `week_start_day`.
  - RLS: `audit_log` — chỉ `auditor` và `company_owner` được SELECT; không ai UPDATE/DELETE.
- DoD: pgTAP confirm `developer` không SELECT được `audit_log`.
- Dependency: 0a.
- Ước lượng: 2-3 giờ.

**0c. Observability tối thiểu**
- Mục tiêu: mọi request Next.js có `request_id`; error log ra structured JSON.
- Việc làm:
  - Middleware Next.js sinh `request_id` (UUID) trên mọi request, ghi vào response header.
  - Error boundary + error logging helper (không log token/PII).
  - Format lỗi chuẩn: `{ code, message, request_id }`.
- DoD: gọi API lỗi → log có `request_id`, không chứa token.
- Dependency: 0a.
- Ước lượng: 1-2 giờ.

---

### Phase 1: Auth & Phân Quyền

**1a. Supabase Auth cơ bản**
- Mục tiêu: đăng nhập email+password, nhận session, refresh, logout.
- Bảng/RPC: `auth.users` (Supabase managed), `core_user_profile`
- Việc làm:
  - Bật email provider trong Supabase Dashboard.
  - Bảng `core_user_profile`: `id uuid references auth.users`, `full_name`, `avatar_url`, `is_active`.
  - Trigger `on_auth_user_created` tạo `core_user_profile` khi user mới.
  - Trang đăng nhập Next.js; route guard middleware cho mọi page không public.
- DoD: đăng nhập qua UI, profile tạo tự động, route guard redirect về login khi chưa xác thực.
- Dependency: 0a, 0b.
- Ước lượng: 3-4 giờ.

**1b. Role assignment và JWT claim**
- Mục tiêu: gán role cho user; JWT chứa role để RLS dùng.
- Bảng/RPC: `core_role_assignment`
- Việc làm:
  - `core_role_assignment`: `user_id`, `role` (enum), `granted_by`, `granted_at`, `expires_at`, `revoked_at`.
  - Auth Hook (`custom_access_token_hook`): đọc role từ `core_role_assignment`, ghi vào `app_metadata.roles` trong JWT.
  - Helper SQL function `auth.user_has_role(role text) → boolean` dùng trong RLS policy.
  - Seed: 1 user `company_owner` và 1 user `developer` để test.
- DoD: pgTAP confirm JWT claim chứa đúng role; `company_owner` SELECT được config; `developer` không được.
- Dependency: 1a.
- Ước lượng: 3-4 giờ.

**1c. Project membership model**
- Mục tiêu: user có project-scoped role (PM, Developer, QA) khác với system role.
- Bảng/RPC: `project_membership`
- Việc làm:
  - `project_membership`: `project_id`, `user_id`, `project_role` (enum: `pm`, `team_leader`, `developer`, `qa_reviewer`), `granted_by`, `start_date`, `end_date`, `status`, `revoked_at`.
  - Helper SQL function `auth.user_project_role(project_id uuid) → text`.
  - RLS: chỉ `company_owner`, `hr_admin`, `pm` mới có thể INSERT/UPDATE membership.
  - Test: user membership hết hạn (`end_date < now()`) không được truy cập project.
- DoD: pgTAP test allow/deny/expired-membership cho project resource.
- Dependency: 1b.
- Ước lượng: 3-4 giờ.

**1d. UI quản lý role**
- Mục tiêu: `company_owner` gán/thu hồi role qua UI; lịch sử ghi vào audit log.
- Bảng/RPC: RPC `assign_role(target_user_id, role, expires_at)`, RPC `revoke_role(target_user_id, role)`
- RPC `assign_role`: kiểm tra caller là `company_owner`; INSERT `core_role_assignment`; ghi audit.
- RPC `revoke_role`: ghi `revoked_at`; trigger ghi audit log.
- UI: trang `/admin/users` liệt kê users + roles; form gán/thu hồi.
- DoD: thu hồi role → JWT claim lỗi thời, sau refresh bị 403; audit log có bản ghi.
- Dependency: 1b, 0b.
- Ước lượng: 3-4 giờ.

---

### Phase 2: HR — Nhân Sự, Team, Rate, Leave

**2a. Employee profile**
- Mục tiêu: tạo, sửa, xem danh sách nhân sự qua UI.
- Bảng/RPC: `hr_employee`
- Bảng: `hr_employee` (`user_id uuid FK auth.users`, `employee_code`, `full_name`, `type` enum(`full_time`, `part_time`, `freelancer`, `contractor`), `department`, `status` enum(`onboarding`, `active`, `offboarding`, `terminated`), `hire_date`, `terminate_date`).
- RLS: `hr_admin`, `company_owner` có INSERT/UPDATE; mọi authenticated user có SELECT (không thấy lương).
- DoD: tạo 2 nhân sự qua UI; pgTAP confirm `developer` không UPDATE được hồ sơ người khác.
- Dependency: 1b.
- Ước lượng: 2-3 giờ.

**2b. Contract và skill**
- Mục tiêu: một nhân sự có lịch sử hợp đồng và danh sách skill.
- Bảng/RPC: `hr_contract`, `hr_skill`
- Bảng:
  - `hr_contract`: `employee_id`, `contract_type`, `start_date`, `end_date`, `notes` — không UPDATE, chỉ INSERT bản mới.
  - `hr_skill`: `employee_id`, `skill_name`, `level`, `certified_at`.
- DoD: một nhân sự có 2 hợp đồng kế tiếp; xem được lịch sử hợp đồng.
- Dependency: 2a.
- Ước lượng: 2-3 giờ.

**2c. Rate effective-dated**
- Mục tiêu: đổi rate không làm mất rate cũ; truy vấn rate tại thời điểm quá khứ đúng.
- Bảng/RPC: `hr_employee_rate`, RPC `get_rate_at(employee_id, at_date)`
- Bảng: `hr_employee_rate` (`employee_id`, `rate_type` enum(`hourly`, `monthly`, `daily`), `amount numeric(18,4)`, `currency`, `effective_from date`, `effective_to date`).
- Ràng buộc: unique `(employee_id, rate_type, effective_from)`; trigger chặn range chồng lấn cùng loại.
- RLS: chỉ `hr_admin`, `finance_admin`, `company_owner` SELECT được.
- DoD: pgTAP confirm `developer` không SELECT được rate; truy vấn rate quá khứ đúng; chồng lấn range bị reject.
- Dependency: 2a.
- Ước lượng: 3-4 giờ.

**2d. Team và leader**
- Mục tiêu: tạo team, gán leader, thêm/xóa thành viên.
- Bảng/RPC: `hr_team`, `hr_team_member`
- Bảng:
  - `hr_team`: `name`, `leader_employee_id`, `description`.
  - `hr_team_member`: `team_id`, `employee_id`, `role`, `joined_at`, `left_at`.
- DoD: tạo team 3 người, đổi 1 người, lịch sử tham gia team đúng.
- Dependency: 2a.
- Ước lượng: 2-3 giờ.

**2e. Leave request và balance — cần cho capacity Phase 3**
- Mục tiêu: nhân sự request nghỉ phép; HR duyệt; balance cập nhật.
- Bảng/RPC: `hr_leave_type`, `hr_leave_balance`, `hr_leave_request`, RPC `approve_leave(request_id)`, RPC `reject_leave(request_id, reason)`
- Bảng:
  - `hr_leave_type`: `code`, `name`, `default_days_per_year`.
  - `hr_leave_balance`: `employee_id`, `leave_type_id`, `year`, `total_days`, `used_days`, `remaining_days`.
  - `hr_leave_request`: `employee_id`, `leave_type_id`, `start_date`, `end_date`, `days_requested`, `reason`, `status` enum(`pending`, `approved`, `rejected`, `cancelled`), `approved_by`, `approved_at`.
- RPC `approve_leave`: caller là `hr_admin` hoặc `company_owner`; kiểm tra balance đủ; UPDATE status, trừ balance, ghi audit.
- RLS: nhân sự chỉ SELECT request của mình; `hr_admin` SELECT mọi request.
- DoD: request → approve → balance giảm đúng; pgTAP SoD (người request không tự approve).
- Dependency: 2a.
- Ước lượng: 3-4 giờ.

**2f. Onboarding/offboarding lifecycle**
- Mục tiêu: chuyển trạng thái nhân sự qua đủ vòng đời với audit log.
- Bảng/RPC: RPC `transition_employee_status(employee_id, new_status, reason)`
- State machine: `onboarding → active`, `active → offboarding`, `offboarding → terminated`.
- DoD: `developer` không gọi được RPC; `hr_admin` transition qua đủ state; audit log đủ actor/reason.
- Dependency: 2a, 0b.
- Ước lượng: 2-3 giờ.

---

### Phase 3: Client, Project, Allocation

**3a. Client và contact**
- Mục tiêu: tạo client, gắn contact.
- Bảng/RPC: `project_client`, `project_client_contact`
- RLS: `company_owner`, `director`, `project_manager`, `finance_admin` có INSERT/UPDATE; mọi auth user SELECT.
- DoD: tạo client với 2 contact qua UI.
- Dependency: 1b.
- Ước lượng: 1-2 giờ.

**3b. Proposal và approval**
- Mục tiêu: tạo proposal, director approve → tự động tạo project.
- Bảng/RPC: `project_proposal`, RPC `approve_proposal(proposal_id)`, RPC `reject_proposal(proposal_id, reason)`
- Bảng: `project_proposal` (`client_id`, `title`, `scope jsonb`, `estimated_budget numeric`, `currency`, `status` enum(`draft`, `sent`, `approved`, `rejected`), `revision_of uuid`, `sent_at`, `expires_at`, `decided_by`, `decided_at`).
- RPC `approve_proposal`: chỉ `director`, `company_owner`; status = `sent`; INSERT `project_project` với snapshot scope/budget; ghi audit.
- DoD: approved → project tồn tại với snapshot dữ liệu; reject không tạo project.
- Dependency: 3a, 1c.
- Ước lượng: 3-4 giờ.

**3c. Project milestone và budget**
- Mục tiêu: project có milestone, budget tracking.
- Bảng/RPC: `project_milestone`, `project_project` (bổ sung `budget_amount`, `budget_currency`)
- DoD: project có 2 milestone với ngày, budget riêng.
- Dependency: 3b.
- Ước lượng: 2-3 giờ.

**3d. Resource capacity và availability**
- Mục tiêu: xem lịch rảnh nhân sự (trừ leave); cảnh báo over-allocation.
- Bảng/RPC: RPC `employee_availability(employee_id, from_date, to_date)`
- RPC trả: total capacity (giờ theo contract) − leave approved − allocation hiện hữu = available hours.
- DoD: nhân sự có leave 2 ngày trong tuần → availability giảm đúng.
- Dependency: 2c, 2e.
- Ước lượng: 3-4 giờ.

**3e. Team allocation vào project**
- Mục tiêu: request → approve allocation; join trái phép bị chặn.
- Bảng/RPC: `project_allocation`, RPC `approve_allocation(allocation_id)`
- Bảng: `project_allocation` (`project_id`, `employee_id`, `role`, `allocation_percent`, `start_date`, `end_date`, `rate_snapshot jsonb`, `status` enum(`pending`, `approved`, `rejected`, `released`), `approved_by`).
- Khi approve: snapshot rate hiện tại vào `rate_snapshot`; INSERT `project_membership`.
- RLS: không INSERT `project_membership` trực tiếp; chỉ qua RPC `approve_allocation`.
- DoD: approve allocation → membership tồn tại với rate snapshot; INSERT membership trực tiếp bị RLS chặn.
- Dependency: 3b, 3d, 2c.
- Ước lượng: 3-4 giờ.

**3.7. Ma Trận Quyền Project**

| Nghiệp vụ | company_owner | director | pm | team_leader | developer | qa_reviewer | finance_admin | auditor |
|---|---|---|---|---|---|---|---|---|
| Xem project, milestone | ✓ | ✓ | Own project | Assigned | Assigned | Assigned | ✓ | ✓ read |
| Sửa scope, milestone | ✓ | ✓ | Own, trước lock | Đề xuất | ✗ | ✗ | ✗ | ✗ |
| Approve proposal | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage allocation | ✓ | ✓ | Own project | ✗ | ✗ | ✗ | ✗ | ✗ |
| Tạo/sửa issue | ✓ | ✗ | ✓ | ✓ | Assigned project | ✓ defect | ✗ | ✗ |
| Ghi worklog | ✓ | ✗ | ✓ | ✓ | Self only | Self only | ✗ | ✗ |
| Approve timesheet | ✓ | ✗ | PM step | Leader step | ✗ | ✗ | ✗ | ✗ |
| Xem rate/cost/margin | ✓ | ✓ | Own project cost | ✗ | ✗ | ✗ | ✓ | ✗ |
| Invoice/payment | ✓ | ✓ read | Read | ✗ | ✗ | ✗ | Create/reconcile | ✓ read |
| Payroll | ✓ | Approve | ✗ | ✗ | ✗ | ✗ | Create/submit | ✓ read |
| Audit log | ✓ | ✗ | Project scope | ✗ | ✗ | ✗ | Finance scope | ✓ |

---

### Phase 4: Issue & Sprint

**4a. Issue CRUD**
- Mục tiêu: tạo Epic, Story, Task, Bug với parent/child.
- Bảng/RPC: `work_issue`
- Bảng: `work_issue` (`project_id`, `type` enum(`epic`, `story`, `task`, `subtask`, `bug`), `parent_id`, `title`, `description`, `status`, `priority`, `assignee_id`, `reporter_id`, `story_points`, `due_date`).
- RLS: chỉ member của project (qua `project_membership`) được INSERT/SELECT.
- DoD: tạo epic với 2 story con; `developer` không thuộc project không SELECT được.
- Dependency: 3e.
- Ước lượng: 2-3 giờ.

**4b. Sprint và board**
- Mục tiêu: tạo sprint, gán issue, kéo thả đổi status trên Kanban board.
- Bảng/RPC: `work_sprint`, `work_issue` (bổ sung `sprint_id`, `board_order`)
- DoD: issue kéo qua 3 cột; sprint hiển thị đúng issue đã gán.
- Dependency: 4a.
- Ước lượng: 3-4 giờ.

**4c. Workflow transition có kiểm soát**
- Mục tiêu: chỉ transition hợp lệ được phép; permission theo role.
- Bảng/RPC: `work_issue_workflow` (config), RPC `transition_issue(issue_id, new_status, reason)`
- Workflow mặc định: `backlog → todo → in_progress → in_review → done`; bug thêm `reopen`.
- RPC: kiểm tra membership, valid transition, role được phép (QA mới transition sang `in_review`/`done`).
- DoD: `developer` transition sang `done` bị reject nếu chưa qua `in_review`; pgTAP test 3 invalid transition.
- Dependency: 4a, 1c.
- Ước lượng: 3-4 giờ.

**4d. Comment và attachment**
- Mục tiêu: comment và file đính kèm trên issue.
- Bảng/RPC: `work_issue_comment`, Supabase Storage bucket `issue-attachments` (private)
- Storage RLS: chỉ member của project được upload/download; signed URL 1 giờ khi download.
- DoD: gán issue, comment, upload file; member khác project không lấy được signed URL.
- Dependency: 4a.
- Ước lượng: 2-3 giờ.

**4e. SLA cảnh báo**
- Mục tiêu: issue quá `due_date` hiển thị badge cảnh báo.
- Việc làm: view `work_issue_with_sla` trả `is_overdue boolean`; UI hiển thị badge.
- DoD: issue quá hạn hiện cảnh báo trên board.
- Dependency: 4a.
- Ước lượng: 1-2 giờ.

---

### Phase 5: Worklog, Timesheet, Approval + Dashboard

**5a. Worklog theo issue**
- Mục tiêu: ghi nhận thời lượng, billable/non-billable trên issue.
- Bảng/RPC: `work_worklog`
- Bảng: `work_worklog` (`issue_id`, `project_id`, `employee_id`, `logged_date date`, `hours numeric(6,2)`, `description`, `is_billable boolean`, `status` enum(`draft`, `submitted`, `approved`, `rejected`)).
- RLS: `employee_id = auth.uid()` mới INSERT; chủ sở hữu hoặc `team_leader`/`pm` SELECT.
- DoD: log work trên issue; không log được cho issue không thuộc project mình.
- Dependency: 4a, 3e.
- Ước lượng: 2-3 giờ.

**5b. Timesheet tổng hợp**
- Mục tiêu: tổng hợp worklog thành timesheet tuần/tháng, submit.
- Bảng/RPC: `work_timesheet`, `work_timesheet_line`, RPC `submit_timesheet(timesheet_id)`
- Bảng:
  - `work_timesheet`: `employee_id`, `period_start date`, `period_end date`, `total_hours`, `status` enum(`draft`, `submitted`, `leader_approved`, `pm_approved`, `locked`).
  - `work_timesheet_line`: `timesheet_id`, `worklog_id`, `hours`, `is_billable`.
- RPC `submit_timesheet`: chủ sở hữu; status = `draft`; aggregate worklog → tạo lines; ghi audit.
- DoD: submit → status `submitted`; submit lần 2 bị reject (idempotent).
- Dependency: 5a.
- Ước lượng: 2-3 giờ.

**5c. Approval flow (leader → PM)**
- Mục tiêu: leader review → PM approve; reject/resubmit được.
- Bảng/RPC: `work_approval_step`, RPC `approve_timesheet_step(timesheet_id, step)`, RPC `reject_timesheet(timesheet_id, reason)`
- RPC `approve_timesheet_step`:
  - Step `leader`: caller là `team_leader` của employee; status → `leader_approved`.
  - Step `pm`: caller là `pm` của project; status → `pm_approved`.
  - SoD: caller không phải chủ sở hữu timesheet.
- RPC `reject_timesheet`: status → `draft`; lý do lưu vào `work_approval_step`; ghi audit.
- DoD: pgTAP SoD test; reject → resubmit → approve đúng luồng; audit log 2 bước.
- Dependency: 5b, 1c.
- Ước lượng: 3-4 giờ.

**5d. Lock timesheet và điều chỉnh**
- Mục tiêu: PM lock kỳ; sửa sau khi lock phải qua RPC riêng.
- Bảng/RPC: RPC `lock_timesheet_period(period_start, period_end)`, RPC `request_timesheet_adjustment(timesheet_id, reason)`
- RPC `lock_timesheet_period`: chỉ `pm` hoặc `company_owner`; bulk update `pm_approved` → `locked`; ghi audit.
- Trigger: sau khi `locked`, mọi UPDATE trực tiếp trên `work_timesheet` bị reject.
- DoD: UPDATE timesheet đã lock bị trigger reject; `request_timesheet_adjustment` tạo bản ghi điều chỉnh.
- Dependency: 5c.
- Ước lượng: 2-3 giờ.

**5e. Dashboard MVP**
- Mục tiêu: `pm`/`company_owner` xem utilization team, issue health, timesheet status trong kỳ.
- Bảng/RPC: View `dashboard_project_health`, View `dashboard_team_utilization`
- View `dashboard_project_health`: issue open/in_progress/done per project; milestone on-track/overdue.
- View `dashboard_team_utilization`: employee, approved hours vs capacity trong kỳ.
- DoD: dashboard hiển thị đúng số liệu với dữ liệu thật.
- Dependency: 5c, 3d.
- Ước lượng: 3-4 giờ.

> **Đây là ranh giới MVP.** Sau Phase 5, hệ thống có thể vận hành thật cho một team.

---

### Phase 6: Notification & Audit UI

**6a. Notification center in-app**
- Mục tiêu: approval/deadline sinh notification cho đúng người nhận; xem trong UI real-time.
- Bảng/RPC: `core_notification`
- Bảng: `core_notification` (`recipient_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at`, `dedupe_key unique`).
- Trigger: sau khi RPC thay đổi status → INSERT notification (dedupe_key chống trùng).
- Realtime: subscribe `core_notification` filtered by `recipient_id`.
- DoD: submit timesheet → notification xuất hiện cho leader; submit 2 lần không tạo duplicate.
- Dependency: 5b, 0b.
- Ước lượng: 3-4 giờ.

**6b. Audit log UI**
- Mục tiêu: `auditor`, `company_owner` tra cứu audit log theo actor, resource, thời gian.
- Việc làm: trang `/admin/audit` với filter và pagination; gọi `audit_log` qua RLS.
- DoD: tra cứu được audit log của một thay đổi timesheet; `developer` bị 403.
- Dependency: 0b, 1b.
- Ước lượng: 2-3 giờ.

**6c. Email reminder (Edge Function)**
- Mục tiêu: Edge Function gửi email nhắc issue quá hạn, timesheet chưa submit.
- Việc làm: Supabase Edge Function dùng Resend API; trigger theo schedule — cần kiểm tra tài liệu Supabase hiện tại về Scheduled Functions (pg_cron vs cron job trong Edge Function).
- DoD: chạy function → log "would send email to X"; không gửi PII trong log.
- Dependency: 6a, 5b.
- Ước lượng: 2-3 giờ.

---

### Phase 7: Billing & Invoice

**7a. Budget tracking thực tế**
- Mục tiêu: project hiển thị budget vs actual cost từ worklog billable đã lock.
- Bảng/RPC: View `finance_project_cost_summary`
- View: aggregate `work_worklog` (billable=true, approved) × `rate_snapshot` từ `project_allocation`.
- RLS: chỉ `pm`, `finance_admin`, `company_owner` SELECT.
- DoD: actual cost cập nhật sau worklog approved; `developer` không SELECT được.
- Dependency: 5d, 3e.
- Ước lượng: 2-3 giờ.

**7b. Milestone acceptance**
- Mục tiêu: PM gửi nghiệm thu → director accept/reject.
- Bảng/RPC: `project_milestone` (bổ sung status fields), RPC `submit_milestone_acceptance(milestone_id)`, RPC `accept_milestone(milestone_id)`, RPC `reject_milestone(milestone_id, reason)`
- DoD: milestone qua đủ luồng gửi → accept; audit log.
- Dependency: 3c, 1b.
- Ước lượng: 2-3 giờ.

**7c. Invoice**
- Mục tiêu: sinh invoice từ milestone accepted hoặc worklog billable; không sửa trực tiếp sau phát hành.
- Bảng/RPC: `finance_invoice`, `finance_invoice_line`, RPC `issue_invoice(project_id, ...)`
- Bảng: `finance_invoice` (`invoice_number`, `project_id`, `client_id`, `status` enum(`draft`, `issued`, `partially_paid`, `paid`, `overdue`, `voided`), `amount`, `currency`, `tax_amount`, `due_date`, `issued_at`, `source_snapshot jsonb`).
- RPC `issue_invoice`: chỉ `finance_admin`; kiểm tra milestone accepted hoặc approved worklog; snapshot nguồn; generate invoice number theo sequence; ghi audit.
- Trigger: sau khi status = `issued`, chặn UPDATE trực tiếp.
- DoD: invoice đúng số tiền; trigger chặn UPDATE trực tiếp; pgTAP SoD (người tạo ≠ người reconcile).
- Dependency: 7a, 7b.
- Ước lượng: 3-4 giờ.

**7d. Payment và reconciliation**
- Mục tiêu: ghi nhận payment; đối soát invoice.
- Bảng/RPC: `finance_payment`, RPC `record_payment(invoice_id, amount, external_ref, fee)`, RPC `reconcile_invoice(invoice_id)`
- Idempotency: `external_ref` unique constraint.
- SoD: không tự reconcile invoice mình tạo.
- DoD: payment ghi nhận → invoice status cập nhật; ghi 2 lần cùng `external_ref` bị reject; SoD test pass.
- Dependency: 7c.
- Ước lượng: 3-4 giờ.

---

### Phase 8: Payroll

**8a. Payroll period và export CSV**
- Mục tiêu: mở kỳ lương, xuất approved hours ra CSV.
- Bảng/RPC: `finance_payroll_period`, RPC `open_payroll_period(month, year)`, RPC `export_payroll_hours(period_id)`
- Bảng: `finance_payroll_period` (`month int`, `year int`, `status` enum(`open`, `locked`), `opened_by`, `locked_by`, `locked_at`).
- RPC `export_payroll_hours`: trả `employee_id`, `employee_name`, `period`, `total_approved_hours`, `rate_snapshot`; chỉ `finance_admin`, `company_owner`.
- DoD: mở kỳ; export CSV đúng giờ đã lock; `developer` không gọi được RPC.
- Dependency: 5d, 2c.
- Ước lượng: 2-3 giờ.

**8b. Rule engine tính gross pay**
- Mục tiêu: cấu hình công thức tính lương theo loại nhân sự; đổi tham số không cần deploy lại.
- Bảng/RPC: `finance_payroll_rule`, `finance_payroll_line`, RPC `calculate_payroll(period_id)`
- Bảng:
  - `finance_payroll_rule`: `rule_type`, `employee_type`, `config jsonb`, `effective_from date`, `version int` — immutable sau khi đã dùng.
  - `finance_payroll_line`: `period_id`, `employee_id`, `gross_pay`, `allowances jsonb`, `deductions jsonb`, `net_pay`, `rule_snapshot jsonb`, `input_snapshot jsonb`.
- RPC `calculate_payroll`: chỉ `finance_admin`; approved hours × rate_snapshot × rule_snapshot; ghi payroll_line với đầy đủ snapshot.
- DoD: đổi tham số rule → kỳ cũ không thay đổi; kỳ mới tính đúng.
- Dependency: 8a.
- Ước lượng: 4-6 giờ.

**8c. Approval kỳ lương và payslip**
- Mục tiêu: HR review → director approve → lock kỳ → xem payslip.
- Bảng/RPC: RPC `approve_payroll_period(period_id, step)`, RPC `lock_payroll_period(period_id)`
- SoD: người tính (`finance_admin`) không tự approve; người approve là `director` hoặc `company_owner`.
- Trigger: sau khi locked, chặn UPDATE trực tiếp `finance_payroll_line`.
- Payslip: view `payslip_view` filtered by `employee_id = auth.uid()`.
- DoD: SoD test pass; payslip hiển thị đúng; `developer` chỉ xem payslip của mình.
- Dependency: 8b.
- Ước lượng: 3-4 giờ.

---

## 8. Công Nghệ

### Frontend
- Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui.
- Data fetching: `supabase-js` + TanStack Query.
- State: Zustand (client-only), Supabase Realtime (notification, live update).
- Form/validation: React Hook Form + Zod.
- Biểu đồ: Recharts hoặc ECharts.
- Testing: Vitest (unit), Playwright (E2E).
- Cần chốt: SSR/CSR boundary; component nào là Server Component vs Client Component.

### Backend (Supabase)
- PostgreSQL 15+ managed, RLS + RPC security definer.
- Supabase Auth + `custom_access_token_hook` (role → JWT).
- Migration: Supabase CLI (`supabase migration new`, `supabase db push`).
- Testing DB: pgTAP (`supabase db test`).
- Edge Function: Deno — chỉ cho email/webhook/schedule. Giữ tối thiểu.
- Realtime: Postgres Changes publication với RLS filter.
- Storage: private bucket + signed URL.

### Tooling và Deploy
- Local dev: Supabase CLI + Docker, Node.js 20+.
- Deploy DB: `supabase db push` → Supabase Cloud.
- Deploy frontend: Vercel (Next.js).
- CI: GitHub Actions — dry-run migration, pgTAP, `pnpm build`, Playwright E2E trên staging.
- Secrets: Supabase Dashboard > Secrets; không commit `service_role` key.

> **Free Plan:** theo dõi DB size, bandwidth, Edge Function invocations hàng tuần. Upgrade Pro trước khi production để có PITR. Cần kiểm tra tài liệu Supabase hiện tại về giới hạn cụ thể.

---

## 9. Quy Tắc Database

- Mọi bảng nghiệp vụ có `id uuid`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`.
- Foreign key xuyên nhóm chỉ dùng ID — denormalize qua read model nếu cần.
- Tiền dùng `numeric(18,4)` + `currency char(3)`; không dùng `float`.
- Optimistic locking: `WHERE id = $1 AND version = $2` trong RPC.
- Idempotency key (`dedupe_key unique`) cho notification, payment, payroll.
- Không xóa vật lý `finance_payroll_line`, `finance_invoice`, `work_worklog` đã approved.
- Mọi query list có `LIMIT` mặc định (max 100); pagination bằng `range` header.
- Index tối thiểu: `(employee_id)`, `(project_id)`, `(status)` trên bảng lớn.
- Migration forward-only; xóa cột dùng expand/contract pattern.

---

## 10. Luồng Nghiệp Vụ Chuẩn

Mỗi luồng cần state diagram và sequence diagram trước khi implementation:

1. **Employee lifecycle**: `onboarding → active → offboarding → terminated`.
2. **Proposal flow**: `draft → sent → approved/rejected → [project active] → closed`.
3. **Issue flow**: `backlog → todo → in_progress → in_review → done`; bao gồm `reopen`, `blocked`.
4. **Timesheet flow**: `draft → submitted → leader_approved → pm_approved → locked`; bao gồm `reject → draft → resubmit`.
5. **Milestone acceptance**: `open → submitted → accepted/rejected`.
6. **Invoice flow**: `draft → issued → partially_paid/paid/overdue/voided`.
7. **Payroll flow**: `open → calculated → reviewed → approved → locked`.

Mỗi transition phải định nghĩa: actor, điều kiện, side effect (notification, audit), idempotency behavior, cách rollback khi side effect thất bại.

---

## 11. Bảo Mật và Dữ Liệu Nhạy Cảm

- **Phân loại**: `public` (profile), `internal` (issue, project), `confidential` (rate, margin), `payroll` (lương, payslip), `audit` (audit log).
- **RLS deny-by-default** trên mọi bảng; không `GRANT SELECT ON ALL TABLES`.
- **Bảng nhạy cảm** (`hr_employee_rate`, `finance_*`): không UPDATE trực tiếp; chỉ qua RPC.
- **`service_role` key**: chỉ trong Edge Function server-side; không expose ra frontend.
- **File**: private bucket; signed URL 1 giờ; RLS Storage policy kiểm tra membership.
- **Audit**: `before_masked`/`after_masked` phải mask field nhạy cảm (lương, CCCD, số TK).
- **Threat model tối thiểu**: IDOR (RLS), privilege escalation (RPC kiểm tra role + scope), SoD (RPC kiểm tra `caller ≠ owner`), mass assignment (không INSERT nhạy cảm trực tiếp).

---

## 12. Release và Vận Hành

- **Branching**: `main` → production; `dev` → staging; feature branch → PR → squash merge.
- **Migration**: mỗi PR có migration file; CI `supabase db push --dry-run`; không merge khi migration lỗi.
- **Staging**: seed data không chứa PII thật; pgTAP toàn bộ trước khi push production.
- **Backup**: Supabase Cloud daily backup (Free plan — cần kiểm tra retention period tài liệu Supabase).
- **Health check**: Supabase Dashboard + Next.js `/api/health`.
- **Feature flag**: `core_config` table hoặc biến môi trường Next.js.

---

## 13. Định Nghĩa MVP và Cổng Nghiệm Thu

**MVP = Phase 0-5 hoàn chỉnh.**

Trước khi chuyển MVP sang dùng thật, phải trả lời được:
- Dữ liệu nào đã có, use case nào chạy end-to-end?
- Permission nào đã kiểm chứng bằng pgTAP (allow/deny/SoD)?
- Migration có thể chạy trên DB mới và DB có dữ liệu cũ không?
- Reject/resubmit timesheet hoạt động đúng không?
- Rollback migration như thế nào?

**Không chuyển phase khi chỉ có CRUD chưa có workflow và test failure case.**

---

## Thay Đổi So Với v2

| Hạng mục | v2 | v3 |
|---|---|---|
| Backend runtime | Java 21 + Spring Boot 3 | Postgres RPC + Edge Function (Deno) |
| Auth | Keycloak | Supabase Auth |
| Authorization | Spring Security + RBAC code | RLS + RPC security definer |
| Message bus | RabbitMQ / ApplicationEventPublisher | Postgres trigger + Supabase Realtime |
| Deploy | Docker Compose + K8s (Phase 9) | Supabase Cloud + Vercel |
| Testing | JUnit 5 + Testcontainers | pgTAP + Vitest + Playwright |
| Multi-tenancy | Có (row-level filter) | Bỏ hoàn toàn |
| Client portal | Có | Bỏ |
| Microservice split | Phase 9 | Bỏ |
| Quyết định cần chốt | 18 | 6 |
| DoD | 17 mục flat | Core (5) + Conditional (6 điều kiện) |
| Dependency ngược | Leave/audit quá muộn | Leave ở Phase 2, audit UI Phase 6 |
| Payroll trong MVP | Mâu thuẫn | Rõ ràng: Phase 8, sau MVP |
| Observability | Mâu thuẫn | Cơ bản từ Phase 0 |
| Phụ lục A "giữ nguyên v1" | Tự tham chiếu, không đủ | Liệt kê đầy đủ ngay trong file (mục 1) |

---

## Rủi Ro Còn Lại

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| **RLS phức tạp khó debug** | Cao | Test pgTAP từng policy; không trộn security invoker/definer lộn xộn |
| **Free plan giới hạn** (500MB DB, 2GB bandwidth) | Trung bình | Theo dõi usage hàng tuần; upgrade Pro trước khi production |
| **pgTAP test coverage thấp** do vibe coding | Cao | Bắt buộc allow/deny/SoD cho mọi RPC nhạy cảm; không merge khi thiếu |
| **Schema migration không backward-compatible** | Trung bình | Expand/contract pattern; staging test trước production |
| **Auth Hook latency** (role trong JWT có thể stale 1 giờ) | Thấp | Revoke → user phải re-login hoặc refresh token; document rõ |
| **Realtime concurrent connections** (Free plan có giới hạn) | Thấp ban đầu | Cần kiểm tra tài liệu Supabase hiện tại về giới hạn theo plan |
| **Payroll rule engine phức tạp trong PL/pgSQL** | Cao | POC trước Phase 8b; nếu quá phức tạp, chuyển sang Edge Function |
| **Edge Function cold start** (~300-500ms) | Thấp | Chỉ dùng cho async job, không dùng trong luồng đồng bộ UI |
