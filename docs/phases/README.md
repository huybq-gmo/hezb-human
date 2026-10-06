# ERP Platform — Phase Index

> Tổng quan lộ trình triển khai v3 (Supabase + Next.js). Xem [erp-platform-plan-v3.md](../../erp-platform-plan-v3.md) để biết context đầy đủ.

---

## Lộ trình tổng quan

```
Phase 0: Foundation          (5-8h)   — Schema, Auth skeleton, Observability
Phase 1: Auth & Phân quyền  (12-16h) — Login, JWT role, Project membership
Phase 2: HR                 (14-22h) — Employee, Contract, Rate, Team, Leave ⬅ Leave cần trước Phase 3
Phase 3: Client/Project     (13-20h) — Proposal, Allocation, Capacity
Phase 4: Issue & Sprint     (11-16h) — Kanban, Workflow, Comment, SLA
Phase 5: Worklog/Timesheet  (12-19h) — Submit, Approval, Lock, Dashboard 🏁 MVP
─────────────────────────────────────────────────────────────────────────────
Phase 6: Notification       (7-11h)  — In-app, Audit UI, Email reminder
Phase 7: Billing            (10-15h) — Invoice, Payment, Reconciliation
Phase 8: Payroll            (9-13h)  — Rule engine, Approval, Payslip
─────────────────────────────────────────────────────────────────────────────
Total MVP (Phase 0-5):   67-101 giờ
Total Full (Phase 0-8): 93-140 giờ (ước lượng range, thực tế phụ thuộc complexity)
```

---

## Danh sách file

| Phase | File | Ước lượng | Dependency |
|---|---|---|---|
| 0 | [phase-0-foundation.md](./phase-0-foundation.md) | 5-8h | Không có |
| 1 | [phase-1-auth.md](./phase-1-auth.md) | 12-16h | Phase 0 |
| 2 | [phase-2-hr.md](./phase-2-hr.md) | 14-22h | Phase 1 |
| 3 | [phase-3-project.md](./phase-3-project.md) | 13-20h | Phase 1, 2c, 2e |
| 4 | [phase-4-issue.md](./phase-4-issue.md) | 11-16h | Phase 3 |
| 5 | [phase-5-worklog-mvp.md](./phase-5-worklog-mvp.md) | 12-19h | Phase 3e, 4 |
| 6 | [phase-6-notification.md](./phase-6-notification.md) | 7-11h | Phase 5 |
| 7 | [phase-7-billing.md](./phase-7-billing.md) | 10-15h | Phase 5d, 3c, 3e |
| 8 | [phase-8-payroll.md](./phase-8-payroll.md) | 9-13h | Phase 5d, 2c |

---

## Dependency graph

```
0 → 1 → 2a → 2b
              2c ──────────────────────────────────→ 3e → 5a
              2d                                           ↓
              2e ──────────────→ 3d ──────────────→ 5e  5b
                                                          ↓
    1 ──────→ 3a → 3b → 3c ───→ 7b                     5c
              1c ──────→ 3e ───────────────────→ 7a     ↓
                                                       5d → 7a
                                                         → 8a
    3e → 4a → 4b
              4c
              4d                                  5 → 6a
              4e                                    → 6b
                                                    → 6c
                                               5d → 7c → 7d
                                               2c → 8b → 8c
```

---

## Quy tắc làm việc

1. **Không skip DoD.** Mỗi sub-phase phải có migration chạy được + ít nhất 1 pgTAP allow + 1 deny test.
2. **Không merge khi thiếu pgTAP test cho RPC nhạy cảm** (approval, lock, role management).
3. **Tạo ADR** khi thay đổi quyết định kiến trúc (xem `docs/adr/`).
4. **Migration forward-only** — không rollback có dữ liệu. Dùng expand/contract khi xóa cột.
5. **Không commit `.env` chứa `service_role` key** hoặc bất kỳ secret nào.

---

## Checklist per sub-phase (Core DoD)

```
[ ] Migration chạy được trên DB mới (supabase db reset)
[ ] RLS bật + ít nhất 1 pgTAP allow + 1 pgTAP deny
[ ] RPC nhạy cảm: security definer, set search_path, check role + state
[ ] Không log secret/token/PII
[ ] Demo được 1 câu mục tiêu của sub-phase
```

**Conditional DoD:**
```
[ ] Có state transition → test invalid transition bị reject
[ ] Có approval/lock   → test SoD (creator ≠ approver)
[ ] Có dữ liệu tài chính → cross-role không đọc được rate/lương
[ ] Có list API        → pagination, max 100 rows
[ ] Có file upload     → private bucket, signed URL
```
