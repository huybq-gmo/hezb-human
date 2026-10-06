# Kế hoạch triển khai các phase còn lại

Ngày rà soát: 2026-10-06. Kế hoạch này lấy source và migrations hiện tại làm chuẩn; các checkbox trong `docs/phases/` vẫn là checklist thiết kế, chưa được cập nhật theo mức độ triển khai thực tế.

### Cập nhật triển khai ngày 2026-10-06

- Đã áp dụng migrations `202610060002`–`202610060014` lên Supabase Cloud được cấu hình trong `web/.env.local`. Ngày 2026-10-06, migration 014 được áp dụng bằng `web/scripts/setup-supabase.mjs --apply`; chạy kiểm tra lại xác nhận 0 migration chờ áp dụng.
- Sau migration, `pnpm check:supabase --cloud` xác nhận Project URL/API key và Email provider hoạt động; 23/23 endpoint bảng/view cần user đăng nhập theo RLS. Script triển khai xác nhận 34 bảng ERP và migration history sạch. Chưa thay thế UAT bằng user thật.
- DB local dựng sạch qua toàn bộ migration; `supabase test db` đạt 215/215 assertion. `pnpm check`, `pnpm build --webpack` và `deno check` cũng đạt.
- Chưa deploy Edge Function hoặc cài lịch email: Supabase CLI chưa có access token và chưa cấu hình Resend/cron secrets. Chưa kiểm thử Realtime, Storage, role matrix hay các luồng nghiệp vụ bằng user thật trên Cloud.

## Trạng thái triển khai hiện tại

| Phase | Đã có trong source | Phần cần làm tiếp |
|---|---|---|
| 0 — Foundation | CI, structured error logging, request ID, migration reset, frontend checks và pgTAP chạy được | Bổ sung Sentry/production error sink nếu tổ chức chọn nhà cung cấp; kiểm chứng observability trên môi trường triển khai |
| 1 — Auth/RBAC | Live role grants, project membership, Owner-only capability matrix wired into DB RLS/RPC, protected Owner/Finance capabilities, custom permission codes alias approved capability, UI hides revoke Owner and RPC preserves last Owner | UAT ma trận role trên Supabase thật; custom code chọn trong các capability nghiệp vụ đã được bảo vệ, không tự tạo quyền SQL mới |
| 2 — HR | Hồ sơ/lifecycle, hợp đồng/skill/rate, leave balance/request, team và leader HR UI/RPC; phòng ban đã bị loại khỏi UI/API/schema | UAT HR trên Supabase thật; team hỗ trợ nhiều nhóm mỗi nhân sự và một trưởng nhóm hoạt động cho mỗi team |
| 3 — Project | CRUD project, client/contact cơ bản, proposal, membership/role, milestone, allocation, rate snapshot và capacity UI/RPC | UAT trên Supabase thật; tinh chỉnh luồng theo quy trình vận hành thực tế |
| 4 — Issue/Sprint | Workflow, comment/private attachment, SLA, sprint, gán issue vào sprint; sửa ticket qua RPC theo role/trạng thái; PM/Leader/Owner thay/xóa tệp | UAT upload/signed URL/xóa bằng user thật; kiểm chứng quy tắc sửa issue theo nghiệp vụ thực tế |
| 5 — Worklog/Timesheet | Work type, check-in/out, timesheet approval/lock/adjustment và dashboard; edit bị khóa theo trạng thái | UAT timezone/chấm công và xác nhận chính sách sửa sau duyệt |
| 6 — Notification/Audit | Notification in-app, audit browser có lọc/phân trang/mask; Edge Function nhắc issue quá hạn và timesheet chờ duyệt có dry-run, claim chống trùng và retry | Chưa cài secrets/schedule trên project đích; cần kiểm chứng Realtime và email thật sau khi cấu hình Resend/Vault |
| 7 — Billing | Actual cost, nghiệm thu milestone, phát hành invoice bất biến, payment idempotent và reconcile SoD; có UI/RPC/test | UAT biểu mẫu, quy trình hóa đơn/thuế và phân quyền với dữ liệu thật |
| 8 — Payroll | 8a: mở kỳ, export giờ approved và rate hiệu lực ra CSV; có RLS/RPC/UI/test | 8b gross/net và 8c approval/lock/payslip chờ chính sách HR/kế toán đã được phê duyệt |

`tests/README.md` xác nhận các file `tests/phase*.sql` cũ là fixture tham khảo, không phải bằng chứng phase đã chạy. Bộ kiểm tra duy trì hiện tại là `supabase/tests/frontend_security.test.sql`; lần chạy local gần nhất có 215 assertion.

## Thứ tự triển khai đề xuất

### Gói 0 — Chốt nền tảng và cổng chất lượng

**Phạm vi:** Phase 0 còn thiếu, rà soát bảo mật Phase 1, chuẩn hóa test/migration trước khi mở rộng schema. Không làm lại auth hoặc live-role architecture.

**Đã hoàn thành trong source:** CI chạy build, typecheck, Deno check và DB security suite; structured error logging có request ID; pgTAP allow/deny đã bao phủ RPC mới; ADR 001 mô tả capability mapping và nguyên tắc Owner/Finance được bảo vệ.

**Còn lại:** gắn production error sink nếu chọn nhà cung cấp và kiểm chứng log trên môi trường triển khai.

**Nghiệm thu:** DB dựng được từ migrations hiện hành trên môi trường sạch; CI chạy build và security suite; test có cả allow/deny cho mỗi RPC nhạy cảm; role Owner cuối cùng không thể bị vô hiệu hóa.

**Ước lượng:** 5–9 giờ.

### Gói 1 — Hoàn thiện phân quyền và HR tối thiểu

**Phụ thuộc:** Gói 0. Đây là nền cho CRUD project và gán người.

**Đã hoàn thành trong source:** thu hồi Owner bị ẩn và RPC bảo vệ Owner cuối; Owner cấu hình capability bundle có sẵn, có audit, quyền Owner/Finance được bảo vệ; hồ sơ/lifecycle, leave balance, HR team/leader UI/RPC; phòng ban đã bị loại khỏi schema sau khi gỡ phụ thuộc.

**Còn lại:** UAT role matrix, lifecycle và HR team trên Supabase thật. Ma trận dùng permission bundle đã có, không cho tạo capability code tùy ý.

**Nghiệm thu local:** UI/DB áp dụng capability ngay, Owner/Finance không thể cấp qua matrix, Owner cuối không thể mất quyền; HR tests bao phủ allow/deny và team leader duy nhất. Production UAT vẫn còn.

**Ước lượng:** 8–14 giờ (chưa gồm quyết định hoặc thay đổi nghiệp vụ ngoài capability hiện có).

### Gói 2 — Quản trị vòng đời project và phân công

**Phụ thuộc:** Gói 1; allocation/capacity phụ thuộc dữ liệu leave và rate HR.

**Việc làm:**

- Hoàn chỉnh CRUD project: danh sách, tạo, sửa, xem chi tiết, trạng thái và trường budget/client cần thiết; state nhạy cảm cập nhật qua RPC có audit.
- Hoàn chỉnh client/contact và proposal draft → sent → approve/reject; phê duyệt tạo project với snapshot nhất quán.
- Hoàn chỉnh UI thêm/gỡ thành viên và phân project role, thời hạn membership; bảo đảm gán quyền qua RPC, không insert trực tiếp.
- Hoàn thành milestone/budget UI; sau đó bổ sung capacity theo leave và allocation theo ngày/phần trăm, rate snapshot tại thời điểm duyệt.

**Nghiệm thu:** CRUD bị chặn theo role ở DB; membership hết hạn không truy cập issue/project; proposal reject không sinh project; approve allocation tạo đúng membership và rate snapshot; capacity tính đúng có/không có leave; có allow/deny và invalid-state tests.

**Ước lượng:** 16–26 giờ.

### Gói 3 — Đóng các khoảng trống Issue và Worklog

**Phụ thuộc:** CRUD project và membership ổn định.

**Việc làm:**

- Thêm mô hình Sprint (project, khoảng ngày, trạng thái) và liên kết issue hiện có; UI tạo sprint, đưa issue vào sprint và xem board theo sprint.
- Hoàn thiện sửa issue theo quyền/trạng thái; bảo đảm comment có thể đính kèm file qua bucket private và signed URL, kiểm tra membership cho cả xem metadata lẫn tải file.
- Rà soát edit/delete worklog: chỉ sửa giờ chưa submit/locked, không cho ghi vào kỳ đã khóa; xác định rule chỉnh sửa sau duyệt bằng adjustment/audit thay vì sửa âm thầm.
- Giữ work_type coding/study/test/meeting/review/support/other và attendance check-in/out đã triển khai; bổ sung test timezone, check-in lặp, checkout chưa check-in và checkout lặp.

**Nghiệm thu:** Sprint/issue/worklog flow hoạt động qua UI; file riêng tư không truy cập được bằng URL công khai hoặc user ngoài project; state đã submit/approved/locked không thể bị sửa trái phép; có pgTAP cho allow/deny và state invalid.

**Ước lượng:** 10–17 giờ.

### Gói 4 — Hoàn tất Notification và Audit UI

**Phụ thuộc:** Gói 0 và các luồng timesheet/issue đã ổn định.

**Việc làm:**

- **Đã có:** audit browser phân trang/lọc, dữ liệu đã mask và giới hạn auditor/Owner; Edge Function `email-reminders` cho issue quá hạn/timesheet chờ duyệt, dry-run, secret riêng, dedupe hằng ngày, retry lỗi và log metadata.
- **Còn lại:** cấu hình Resend/Edge secrets, deploy function và tạo lịch Cron/Vault trên project đích theo [hướng dẫn deploy](email-reminders-deploy.md).
- Kiểm tra realtime notification trên Supabase thật: publication, RLS, đánh dấu đã đọc và link điều hướng.

**Nghiệm thu:** Các ranh giới quyền, dry-run, claim dedupe và retry đã được kiểm thử local; nghiệm thu cuối còn phụ thuộc email thật, lịch chạy và realtime trên project Supabase đích.

**Ước lượng:** 7–11 giờ.

### Gói 5 — Billing (Phase 7)

**Phụ thuộc:** Milestone, allocation/rate snapshot và timesheet lock/approval hoàn chỉnh.

**Thứ tự:** 7a tổng hợp actual cost; 7b nghiệm thu milestone; 7c phát hành invoice; 7d ghi nhận/reconcile payment.

**Nghiệm thu:** Chi phí dựa trên worklog đã duyệt và rate snapshot; milestone có state machine/audit; invoice đã phát hành bất biến; payment idempotent theo external reference; reconcile có segregation of duties (SoD); dữ liệu tài chính bị giới hạn theo role. Mỗi phần có RPC allow/deny, invalid transition, migration sạch và UI.

**Ước lượng:** 10–15 giờ theo plan v3, cần hiệu chỉnh sau khi chốt dữ liệu client và quy trình hóa đơn.

### Gói 6 — Payroll (Phase 8)

**Phụ thuộc:** Timesheet lock, rate effective-dated và role Finance/HR hoàn chỉnh; nên triển khai sau Billing để dùng chung quy tắc snapshot/audit.

**Thứ tự:** **8a đã triển khai** mở kỳ và export approved hours cùng rate hiệu lực; 8b version hóa rule và tính gross/net; 8c approval nhiều bước, lock và payslip cá nhân.

**Nghiệm thu:** Re-run idempotent; kỳ locked bất biến; rule đã dùng không thể sửa; người tính không tự duyệt; payslip chỉ nhân viên sở hữu và Finance được xem theo quyền; CSV/snapshot khớp dữ liệu đã duyệt.

**Điều kiện trước khi chốt 8b:** Kế toán/HR xác nhận công thức, khấu trừ, bảo hiểm, thuế và ngày hiệu lực theo quy định hiện hành. Các con số ví dụ trong plan v3 không được dùng làm cấu hình production khi chưa được xác nhận.

**Ước lượng:** 9–13 giờ cho kỹ thuật theo plan v3, chưa tính thời gian xác nhận nghiệp vụ và rà soát quy định.

## Các cổng nghiệm thu bắt buộc

Mỗi gói database phải có migration forward-only, chạy trên DB sạch và DB có dữ liệu; bảng bật RLS; mỗi RPC nhạy cảm có allow/deny và kiểm tra state/SoD phù hợp; UI không được dùng làm ranh giới bảo mật duy nhất. Sau thay đổi chạy security suite, typecheck/lint/build và smoke test bằng user thật trên Supabase. Không chạy fixture `tests/phase*.sql` cũ trên Cloud có dữ liệu.

## Ước lượng và cách chia đợt

Các ước lượng gói 0–6 cộng lại khoảng **65–105 giờ kỹ thuật**, độ bất định cao nhất nằm ở permission configuration, project allocation và quy trình billing/payroll. Nên chia thành các đợt review nhỏ theo gói 0 → 1 → 2 → 3 → 4; chỉ mở Billing/Payroll sau khi dữ liệu nguồn và quy trình được nghiệm thu. Thời lượng chưa gồm nhập dữ liệu, thiết lập secrets/schedule trên Cloud, UAT và phê duyệt chính sách nhân sự/kế toán.
