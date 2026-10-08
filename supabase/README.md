# Database cho frontend Hezb ERP

Bộ migration này triển khai contract của **các trang hiện có**: profile, role, membership, nhân sự/hợp đồng/skill/rate/nghỉ phép, dự án/proposal/milestone, issue/comment/attachment, worklog/timesheet, dashboard và thông báo trong ứng dụng. Không đánh dấu các phase hoàn thành toàn bộ.

Migration 017 bổ sung directory/weekly aggregate views, điều chỉnh giờ sau khóa có duyệt độc lập và candidate reminder chưa nộp. Chưa lên Cloud; toàn bộ migration đến 017 và 60 assertion đã chạy trên PostgreSQL WASM cô lập với Auth/Storage shims. Xem [báo cáo và lệnh kiểm tra](../docs/timesheet-followup-2026-10-06.md).

## Triển khai Cloud tự động

Xem [web/README.md](../web/README.md). `web/scripts/setup-supabase.mjs` dùng `psql`, `SUPABASE_DB_URL` (Direct connection hoặc Session pooler) và `NEXT_PUBLIC_SUPABASE_URL` để xác minh cùng project. Điền mật khẩu riêng trong `SUPABASE_DB_PASSWORD`, giữ `[YOUR-PASSWORD]` trong connection string. Mặc định chỉ kiểm tra; `--apply` mới ghi. Secret dùng qua environment của process, không nằm trong argv hoặc output.

Migration được ghi nhận bằng version/checksum trong `internal.hezb_schema_migrations`. Không sửa file đã áp dụng: tạo migration mới. Nếu database có sẵn bảng ERP nhưng chưa có lịch sử tương ứng, script dừng để đối chiếu. Bootstrap Owner dành cho tài khoản Supabase Auth đã xác nhận email và chỉ dùng khi chưa có Owner khác.

Không có tài khoản hoặc password mặc định. Không có nhân sự/dự án/giờ làm mẫu được đưa lên Cloud. Sau khi cấp Owner, quản lý role và capability, liên kết employee–Auth, HR team, leave balance, project membership, khách hàng/proposal qua UI tương ứng. Secrets và lịch Cron được cấu hình riêng theo hướng dẫn vận hành.

## Chạy bằng SQL Editor

Với namespace ERP mới, chạy các file trong `migrations/` theo thứ tự tên. Mỗi file có transaction; migration sau này chỉ mở rộng hoặc siết contract và không sửa lịch sử đã áp dụng. Tài khoản Auth có trước migration được backfill profile tự động.

Sau đó cấp Owner đầu tiên cho **UUID của tài khoản đã tạo trong Authentication → Users**:

```sql
-- Thay UUID bằng user thật; thao tác quản trị trong SQL Editor, không phải public RPC.
insert into public.core_role_assignment(user_id, role, granted_by)
values ('YOUR_AUTH_USER_UUID', 'company_owner', 'YOUR_AUTH_USER_UUID');
```

Nếu chuyển sang script tự động sau khi chạy bằng SQL Editor, cần đối chiếu và ghi nhận các migration đã áp dụng trước; script sẽ dừng thay vì giả định lịch sử.

## Phân quyền và nghiệp vụ

- Claim JWT `role` giữ giá trị `authenticated`; quyền nghiệp vụ lấy từ assignment/membership đang hiệu lực. Xem [ADR 001](../docs/adr/001-live-business-roles.md).
- Owner có thể cấu hình capability cho từng system role và tạo mã permission tùy chỉnh làm alias cho capability nghiệp vụ đã có; mã mới không thể tự tạo quyền SQL/RLS. Capability Owner không thể cấp qua ma trận; capability Finance chỉ có hiệu lực từ role Finance Admin. Thay đổi được audit và có pgTAP allow/deny.
- User Auth chưa được cấp role/membership không đọc được ERP. Profile inactive, role hết hạn/thu hồi và membership chưa bắt đầu/hết hạn bị từ chối ở database.
- State nhạy cảm chỉ đổi qua RPC; column grants ngăn client sửa trực tiếp status, owner, recipient hoặc identity. Sửa issue chỉ qua RPC theo role/trạng thái; reporter chỉ sửa title/description ở backlog/todo, PM/Leader/Owner sửa đến trước trạng thái đóng. RPC dùng `security definer`, tên bảng đầy đủ và `search_path=''`.
- Duyệt proposal, nghỉ phép, timesheet kiểm tra người tạo/chủ sở hữu khác người duyệt, kể cả Owner. Worklog trong kỳ submit/locked không sửa được. Period lock ngăn thêm giờ làm hoặc submit muộn sau khi khóa.
- Rate dùng khoảng ngày inclusive và exclusion constraint chống chồng lấn. Rate/hợp đồng chỉ dành cho HR/Finance/Owner; audit chỉ chứa metadata đã mask. View dùng `security_invoker=true`, dashboard tổng hợp issue và milestone riêng để đếm đúng.
- Bucket `issue-attachments` private, giới hạn 10 MiB/tệp. Policy đối chiếu project UUID, issue UUID và membership; signed URL do frontend tạo. PM/Leader/Owner được thay thế hoặc xóa file; RPC cập nhật đường dẫn trong comment để không tạo link hỏng. Các lần cập nhật ticket khác đi qua RPC kiểm tra trạng thái/vai trò, không có UPDATE trực tiếp.
- `core_notification` được thêm vào publication Realtime nếu publication đã tồn tại. Client chỉ đọc và đánh dấu thông báo của mình.
- Phòng ban đã được loại khỏi UI, API và schema `hr_employee`; cột bị xóa sau khi đã gỡ các phụ thuộc view và truy vấn.
- HR có UI quản lý team, thành viên và trưởng nhóm. Mỗi team có tối đa một leader hoạt động; team lưu trữ không nhận thành viên mới; kết thúc nhân sự tự thu hồi thành viên team.
- Invoice/payments và payroll đều chỉ lộ qua role/RPC phù hợp. Payroll hiện chỉ mở kỳ và xuất giờ đã duyệt cùng các rate hiệu lực giao với kỳ; chưa tính gross/net.
- Edge Function `email-reminders` gửi issue quá hạn và timesheet đang chờ duyệt; secret xác thực cron, Resend API key và URL ERP chỉ cấu hình bằng Edge Function secrets. Log gửi giữ metadata nội bộ, chống trùng theo người nhận/nghiệp vụ/ngày và cho phép retry lỗi.

## Kiểm tra

`tests/frontend_security.test.sql` có 215 pgTAP assertions trên fixture UUID hợp lệ và PostgreSQL role `authenticated`, bao gồm allow/deny, state machine, SoD, role capability/custom code config, HR team, rate, audit, Storage metadata, khóa kỳ, billing, payroll và chống gửi reminder trùng. Tất cả fixture nằm trong transaction rollback.

Trên Supabase local/test project, bật extension pgTAP trong schema `extensions`, áp dụng migration rồi chạy file test bằng `psql -v ON_ERROR_STOP=1 -f ...` hoặc `supabase test db` khi đã cấu hình Supabase CLI. Không dùng fixture trên Cloud đang có dữ liệu kinh doanh.

Đã kiểm tra migration trên PostgreSQL 16 riêng với các schema Auth/Storage được mô phỏng và pgTAP 1.3.2. Điều này xác minh SQL/RLS/RPC, chưa thay thế kiểm tra Auth thật, Data API, upload tệp và Realtime trên Cloud. `pnpm check:supabase --cloud` kiểm tra kết nối/schema Data API; tiếp tục kiểm tra UI bằng user thật sau triển khai.

## Phần còn lại của plan v3

Đợt hoàn thiện MVP có migrations 015–016 cho worklog/contact/parent issue, Skill Matrix, dashboard utilization và tổng payment. Test mới ở `tests/mvp_completion.test.sql` có 56 assertion, chưa chạy trong môi trường phát triển hiện tại. Áp dụng migration trên DB test và chạy lại toàn bộ SQL suite trước khi deploy; xem [báo cáo chức năng local](../docs/mvp-completion-2026-10-06.md).

Schedule, Vault secrets và Resend chưa được cấu hình trên Supabase đích; xem [hướng dẫn deploy email reminders](../docs/email-reminders-deploy.md). Observability chưa nối production error sink; payroll gross/net, approval, lock và payslip đang chờ chính sách HR/kế toán. Cần UAT upload/Realtime/attendance trên Supabase đích. Xem [kế hoạch và trạng thái phase](../docs/implementation-plan-remaining.md). `tests/phase*.sql` ở root là fixture tham khảo, không thay thế suite ở đây.
