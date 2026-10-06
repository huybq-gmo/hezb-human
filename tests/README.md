# Tests — pgTAP Test Suite

Bộ test thực thi cho migration frontend hiện tại nằm ở [supabase/tests/frontend_security.test.sql](../supabase/tests/frontend_security.test.sql), gồm 96 assertions đã kiểm tra trên PostgreSQL 16 riêng. Xem [hướng dẫn database](../supabase/README.md). Các file `phase*.sql` dưới đây là fixture tham khảo từ plan v3, có ID/JWT role cần điều chỉnh trước khi chạy và bao gồm các phase chưa triển khai.

Tập hợp test pgTAP cho toàn bộ hệ thống ERP Human Resource & Project Delivery Platform (v3).  
Mỗi file tương ứng với một sub-phase trong kế hoạch triển khai.

---

## Cấu trúc

```
tests/
│
│  ── Phase 0: Foundation
├── phase0_audit_log_rls.sql           # Audit log RLS, core_config defaults
│
│  ── Phase 1: Auth & Phân Quyền
├── phase1a_user_profile_rls.sql       # core_user_profile RLS
├── phase1b_role_assignment_rls.sql    # core_role_assignment RLS + helpers
├── phase1c_project_membership_rls.sql # project_membership RLS + expired check
├── phase1d_rpc_role_management.sql    # assign_role / revoke_role RPC
│
│  ── Phase 2: HR
├── phase2a_hr_employee_rls.sql        # hr_employee RLS (read all, write restricted)
├── phase2b_hr_contract_skill_rls.sql  # hr_contract immutable history
├── phase2c_hr_rate_rls.sql            # hr_employee_rate RLS + overlap trigger + get_rate_at()
├── phase2e_hr_leave.sql               # Leave request, approve, SoD, INSUFFICIENT_BALANCE
├── phase2f_rpc_employee_lifecycle.sql # State machine transition_employee_status
│
│  ── Phase 3: Client, Project, Allocation
├── phase3b_project_proposal.sql       # approve_proposal flow
├── phase3d_rpc_availability.sql       # employee_availability() với/không leave
├── phase3e_project_allocation.sql     # approve_allocation + membership auto-create
│
│  ── Phase 4: Issue & Sprint
├── phase4a_work_issue_rls.sql         # Issue RLS (membership required, expired blocked)
├── phase4c_rpc_transition_issue.sql   # Workflow transition (role-based, invalid transition)
├── phase4e_work_issue_sla.sql         # work_issue_with_sla view (is_overdue, sla_status)
│
│  ── Phase 5: Worklog, Timesheet, Approval (MVP)
├── phase5a_work_worklog_rls.sql       # Worklog RLS (own-only insert, TL read, delete blocked)
├── phase5b_work_timesheet.sql         # submit_timesheet RPC
├── phase5c_timesheet_approval.sql     # Approval flow (SoD, role check, 2-step)
├── phase5d_timesheet_lock.sql         # Lock timesheet period
│
│  ── Phase 6: Notification & Audit UI
├── phase6a_notification.sql           # core_notification RLS + fn_notify() dedupe
│
│  ── Phase 7: Billing & Invoice
├── phase7a_finance_project_cost.sql   # finance_project_cost_summary view
├── phase7b_milestone_acceptance.sql   # submit/accept/reject milestone
├── phase7c_finance_invoice.sql        # issue_invoice RPC + trigger lock
├── phase7d_finance_payment.sql        # record_payment + reconcile_invoice SoD
│
│  ── Phase 8: Payroll
├── phase8a_payroll_period.sql         # open_payroll_period + idempotent + lock trigger
├── phase8b_payroll_rule.sql           # calculate_payroll + gross_pay + RULE_IN_USE
└── phase8c_payroll_approval.sql       # Approval flow + payslip visibility
```

---

## Chạy Tests

### Yêu cầu

- PostgreSQL với extension **pgTAP** đã cài:
  ```sql
  create extension if not exists pgtap;
  ```
- Supabase local dev (hoặc DB đã chạy migrations đầy đủ):
  ```bash
  supabase db reset
  ```

### Chạy toàn bộ

```bash
# Chạy tất cả test files
pg_prove -U postgres -d postgres tests/phase*.sql

# Hoặc dùng psql
psql -U postgres -d postgres -f tests/phase0_audit_log_rls.sql
```

### Chạy theo phase

```bash
# Phase 0
pg_prove -U postgres tests/phase0_*.sql

# Phase 1
pg_prove -U postgres tests/phase1*.sql

# Phase 5 (MVP)
pg_prove -U postgres tests/phase5*.sql

# Tất cả Phase (0 → 8)
pg_prove -U postgres tests/phase*.sql --verbose
```

### Với Supabase local

```bash
# Reset DB trước khi test
supabase db reset

# Chạy pgTAP tests
psql $(supabase db url) -f tests/phase0_audit_log_rls.sql
```

---

## Quy ước Test

Mỗi file test:
1. Bắt đầu bằng `BEGIN` và kết thúc bằng `ROLLBACK` — **không có side effect** trên DB.
2. Dùng `SELECT plan(N)` để khai báo số assertions.
3. Setup dữ liệu bằng `SET LOCAL ROLE TO postgres` (bypass RLS).
4. Mô phỏng user với `SET LOCAL ROLE TO authenticator` + `SET LOCAL request.jwt.claims`.
5. Dọn sạch tự động khi rollback.

### Các hàm pgTAP dùng phổ biến

| Hàm | Ý nghĩa |
|---|---|
| `ok(condition, description)` | Assert condition = true |
| `is(got, expected, description)` | Assert got = expected |
| `throws_ok(sql, description)` | Assert SQL raise exception (bất kỳ) |
| `throws_like(sql, pattern, description)` | Assert message chứa pattern |
| `lives_ok(sql, description)` | Assert SQL không throw exception |

---

## Coverage Map

| Phase | Số test | Điểm kiểm tra chính |
|---|---|---|
| 0 | 4 | Audit log RLS, core_config defaults |
| 1a | 3 | User profile RLS, trigger existence |
| 1b | 5 | Role assignment RLS, helper functions |
| 1c | 5 | Membership RLS, expired check, direct insert blocked |
| 1d | 6 | assign_role/revoke_role FORBIDDEN + success + audit |
| 2a | 4 | Employee RLS (all-read, write-restricted, no-delete) |
| 2b | 4 | Contract immutability |
| 2c | 6 | Rate RLS, overlap trigger, get_rate_at() correctness |
| 2e | 6 | Leave flow, SoD, INSUFFICIENT_BALANCE |
| 2f | 4 | State machine, INVALID_TRANSITION, audit log |
| 3b | 5 | Proposal FORBIDDEN, INVALID_STATE, approve creates project |
| 3d | 3 | Availability: 24h with leave, 40h no leave |
| 3e | 5 | Allocation: direct membership blocked, FORBIDDEN, approve auto-creates membership |
| 4a | 4 | Issue RLS by membership status |
| 4c | 5 | Workflow: FORBIDDEN, valid transition, INVALID_TRANSITION |
| 4e | 4 | SLA view: is_overdue, sla_status |
| 5a | 5 | Worklog: own-only insert, TL read, submitted not deletable |
| 5b | 5 | submit_timesheet: FORBIDDEN, NO_WORKLOG, success, ALREADY_SUBMITTED |
| 5c | 6 | Approval: SOD, FORBIDDEN, 2-step, INVALID_STATE |
| 5d | 5 | Lock: trigger, FORBIDDEN, HAS_UNAPPROVED, success |
| 6a | 5 | Notification: no direct insert, dedupe, cross-user blocked |
| 7a | 3 | Cost summary: RLS, actual_cost calculation, non-billable excluded |
| 7b | 5 | Milestone acceptance: FORBIDDEN, submit, accept |
| 7c | 5 | Invoice: FORBIDDEN, ZERO_AMOUNT, success, trigger |
| 7d | 6 | Payment: FORBIDDEN, partial/full, DUPLICATE, SOD reconcile |
| 8a | 6 | Payroll period: FORBIDDEN, open, idempotent, lock trigger |
| 8b | 6 | Calculate payroll: FORBIDDEN, gross_pay, upsert, RULE_IN_USE |
| 8c | 8 | Approval: FORBIDDEN, SOD, 2-step, lock, payslip visibility |
| **Tổng** | **~141** | **Toàn bộ Phase 0–8** |
