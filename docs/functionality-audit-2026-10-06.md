# Rà soát chức năng ngày 2026-10-06

Đây là trạng thái trước đợt triển khai tiếp theo. Các phần đã được bổ sung sau rà soát nằm trong [báo cáo hoàn thiện MVP](mvp-completion-2026-10-06.md); không dùng danh sách thiếu bên dưới để suy ra trạng thái source mới nhất.

## Kết luận

**Chưa thực hiện hết chức năng trong plan v3 và checklist các phase.** Source đã có phần lớn luồng nghiệp vụ Phase 0–7 và phần mở kỳ/xuất CSV của Phase 8. Tuy nhiên, còn các chức năng chưa được lập trình, các phần UI chưa đủ yêu cầu, và các cổng nghiệm thu chưa được xác minh trên môi trường thật.

Rà soát này đối chiếu `erp-platform-plan-v3.md`, `docs/phases/`, `docs/implementation-plan-remaining.md`, frontend, migrations và Edge Function. Không lấy checkbox trống hoặc sự tồn tại của fixture test làm bằng chứng một chức năng chưa/đã hoàn thành. Live role và việc bỏ phòng ban là các thay đổi thiết kế đã được ghi nhận, không tính là thiếu chức năng.

## Trạng thái từng nhóm

| Nhóm | Đã có trong source | Còn thiếu hoặc cần nghiệm thu |
| --- | --- | --- |
| 0 — Foundation | Next.js, Supabase clients, migrations, CI, logging/request ID, error boundaries | Chưa có `/api/health` theo phần vận hành của plan; chưa nối production error sink. Chưa xác minh CI thực sự chạy đạt trên remote trong lần rà soát này. |
| 1 — Auth và phân quyền | Login mật khẩu/magic link, guard, profile, live roles, membership, cấp/thu hồi role, capability/custom alias, bảo vệ Owner cuối cùng | Cần kiểm thử đăng nhập và ma trận quyền với tài khoản thật. Kiến trúc live role thay JWT business role theo ADR 001. |
| 2 — HR | Nhân sự, hợp đồng, skill cá nhân, rate theo ngày hiệu lực, nghỉ phép/số dư, lifecycle, team/thành viên/leader | Chưa có tab Skill Matrix hoặc view `hr_team_skill_matrix` theo Phase 2d; cần UAT HR. |
| 3 — Client/Project | Khách hàng cơ bản, project, proposal gửi/duyệt/từ chối, membership, milestone, allocation, capacity | Chưa có quản lý contact khách hàng: không có bảng `project_client_contact` hoặc UI tạo nhiều contact như Phase 3a. |
| 4 — Issue/Sprint | Tạo/sửa ticket, phân công, workflow, Kanban kéo thả toàn bộ issue/lọc dự án, comment, attachment, SLA, tạo/sửa sprint và gán issue | Chưa có board lọc sprint/backlog theo Phase 4b; chưa có UI gán parent epic/story theo Phase 4a. Trang sprint hiển thị toàn bộ issue lặp lại dưới mỗi sprint. Cần UAT Storage/signed URL. |
| 5 — Worklog/Timesheet | Ghi giờ, work type, check-in/out, submit, duyệt Leader/PM, reject, lock, yêu cầu adjustment, dashboard tổng hợp | Chưa có UI sửa/xóa worklog draft theo Phase 5a. Dashboard chưa có filter dự án/kỳ; utilization hiện là tổng giờ, chưa tính tỷ lệ theo capacity trong kỳ như mục tiêu Phase 5e. |
| 6 — Notification/Audit | Notification in-app/Realtime subscription, audit filter/phân trang/mask, Edge Function nhắc issue quá hạn và timesheet chờ duyệt, dedupe/retry/dry-run | Chưa có luồng nhắc nhân viên chưa submit timesheet cuối kỳ theo Phase 6c. Tài liệu ghi chưa deploy function/cấu hình secrets và Cron; chưa xác minh trạng thái Cloud hiện tại. |
| 7 — Billing | Actual cost, nghiệm thu milestone, phát hành invoice/snapshot, payment, reconcile và SoD; có UI/RPC/test SQL | Chưa nghiệm thu bằng dữ liệu và tài khoản thật; chưa kiểm chứng mẫu hóa đơn/quy trình kế toán vận hành. |
| 8 — Payroll | Mở kỳ lương, export giờ approved và rate hiệu lực ra CSV | Chưa có rule engine gross/net, thuế/khấu trừ, approval kỳ lương, lock qua nghiệp vụ hoặc payslip (8b/8c). |

## Các khoảng trống xác nhận từ source

1. **Payroll 8b/8c chưa triển khai.** `PayrollClient.tsx` chỉ gọi `open_payroll_period` và `export_payroll_hours`. Không có `finance_payroll_rule`, `finance_payroll_line`, `calculate_payroll`, `approve_payroll_period`, `lock_payroll_period` hoặc payslip trong migrations/frontend. Trường status `locked` và nhãn UI chưa tạo thành một luồng khóa kỳ. Export hiện đọc worklog `approved` và chỉ lấy nhân sự `active`; chưa phải snapshot bảng lương đã khóa.
2. **Contact khách hàng chưa triển khai.** `ProjectListClient.tsx` và `save_project_client` chỉ lưu tên, mã, địa chỉ, website, ghi chú và trạng thái. Yêu cầu tạo client với hai contact của Phase 3a chưa được đáp ứng.
3. **Worklog draft chưa sửa/xóa được qua UI.** `WorklogTimesheetClient.tsx` chỉ insert worklog và hiển thị lịch sử. Có policy database cho update/delete draft, nhưng chưa có thao tác tương ứng ở frontend. RPC adjustment dành cho timesheet đã khóa không thay thế chức năng này.
4. **Sprint chưa có board riêng.** `IssueListClient.tsx` có kéo thả, nhưng không có trường/filter sprint. `ProjectSprintClient.tsx` dùng `sprints.map(...)` rồi `issues.map(...)` mà không lọc `issue.sprint_id === sprint.id`, nên mọi issue xuất hiện dưới mọi sprint với người có quyền gán; người không có quyền gán không thấy danh sách issue trong phần này.
5. **Quan hệ epic/story chưa được đưa lên UI.** Schema có `work_issue.parent_id`, nhưng frontend tạo/sửa ticket không chọn parent hoặc hiển thị cây issue con.
6. **Skill Matrix theo team chưa có.** Trang team chỉ đọc team, membership và employee; skill cá nhân đã có, nhưng chưa có bảng employee × skill theo Phase 2d.
7. **Dashboard chưa đủ bộ lọc và utilization trong kỳ.** Trang dashboard không nhận filter project/period; view `dashboard_team_utilization` tổng hợp giờ PM-approved/locked trên toàn bộ dữ liệu và đếm project, không chia cho capacity theo kỳ.
8. **Email reminder khác một phần yêu cầu gốc.** Function query timesheet `submitted`/`leader_approved` để nhắc người duyệt; chưa tìm nhân viên chưa submit cuối kỳ. Theo tài liệu vận hành, deploy/secrets/schedule còn lại; lần rà soát này không xác nhận được remote.
9. **Phân trang chưa đồng đều.** Danh sách project/issue/invoice lấy tối đa 100 record, chưa có điều khiển tải trang tiếp theo. Đây là giới hạn cần xử lý trước khi dữ liệu vượt ngưỡng, dù một số trang như nhân sự/audit đã có pagination.

## Kiểm tra thực thi trong lần rà soát này

| Kiểm tra | Kết quả |
| --- | --- |
| `web/node_modules/.bin/tsc.cmd --noEmit` | Đạt. |
| `node --test scripts/supabase-db-config.test.mjs scripts/demo-data.test.mjs` trong `web/` | 16/16 test đạt. Đây là test cấu hình và demo, không phải kiểm thử end-to-end nghiệp vụ thật. |
| `node node_modules/next/dist/bin/next build --webpack` trong `web/` | Đạt, build 24 trang tĩnh và các route ứng dụng. Lần đầu sandbox chặn tải Google Fonts; chạy lại với quyền được cấp thành công. |
| `node scripts/check-supabase.mjs --cloud` trong `web/` | Dừng trước khi kết nối: yêu cầu điền Project URL hợp lệ vào `NEXT_PUBLIC_SUPABASE_URL` trong `.env.local`. Chưa xác minh Auth/Data API/Cloud. |
| Database pgTAP | Chưa chạy lại: Docker daemon không hoạt động; Supabase CLI không có trong PATH. |
| Deno check | Chưa chạy lại: Deno không có trong PATH. |
| UAT/Realtime/Storage/role matrix bằng user thật | Chưa thực hiện. |

`docs/implementation-plan-remaining.md` và `supabase/README.md` ghi lần kiểm tra trước đạt 215 assertion database và đã áp dụng migration đến 014 trên Cloud. Đây là lịch sử được tài liệu ghi nhận, không phải kết quả được tái xác minh trong lần này. `tests/README.md` vẫn ghi 96 assertion ở phần mở đầu nên chưa đồng bộ với tài liệu mới. Các file `tests/phase*.sql` là fixture tham khảo; việc có file cho Payroll 8b/8c không chứng minh các chức năng đó đã được triển khai.

## Thứ tự hoàn thiện đề xuất

1. Hoàn thiện các phần thuộc MVP: sửa/xóa worklog draft, contact, board sprint/danh sách issue đúng sprint, parent epic/story, Skill Matrix và dashboard filter/capacity.
2. Bổ sung phân trang các danh sách bị giới hạn và endpoint health check nếu giữ yêu cầu vận hành của plan.
3. Cấu hình môi trường kiểm thử, chạy database suite và UAT trọn luồng với các role thật; kiểm tra upload/download/xóa file và notification Realtime.
4. Bổ sung reminder chưa submit nếu giữ phạm vi Phase 6c, rồi nghiệm thu deploy/secrets/Cron và email thật.
5. Chốt chính sách HR/kế toán trước khi triển khai Payroll 8b/8c; không dùng các công thức ví dụ trong plan làm chính sách production.

Rà soát không thay đổi mã nguồn nghiệp vụ, migrations hoặc các chỉnh sửa sẵn có của người dùng.
