# Hoàn thiện chức năng MVP — 2026-10-06

Đã triển khai nhóm chức năng ưu tiên sau đợt rà soát. Đợt này chỉ sửa source, thêm migration/test và kiểm tra local; không áp dụng migration hoặc deploy lên Cloud.

## Chức năng đã bổ sung

| Nhóm | Hành vi mới |
| --- | --- |
| Worklog | Sửa ngày, giờ, loại công việc, mô tả và billable của worklog draft; xóa có xác nhận. Query kiểm tra employee/status/version và xác minh có bản ghi bị thay đổi. DB tiếp tục chặn dữ liệu đã submit/duyệt/khóa, tổng giờ vượt giới hạn và sửa ngày nguồn trong kỳ đã khóa. Không đổi danh tính employee/project/issue. |
| Sprint | Ticket dưới mỗi Sprint được lọc đúng `sprint_id`, người có quyền đọc được xem; backlog riêng có thao tác gán Sprint. Board hiện có thêm lọc Sprint/backlog, tìm kiếm phía server và phân trang. |
| Khách hàng | Trang `/dashboard/clients` quản lý hồ sơ, nhiều contact và một contact chính. Có thêm/sửa/xóa contact, kiểm tra email và version, khóa theo client để tránh hai contact chính đồng thời; write chỉ qua RPC. |
| Epic/story | Chọn parent khi tạo ticket; xem/đổi parent và danh sách ticket con ở trang chi tiết. Picker tìm epic/story trong cùng dự án. DB chặn parent khác dự án, self-parent, parent không phải epic/story, vòng lặp, sửa ticket đóng và dữ liệu đã đổi version. |
| HR | Skill Matrix nhân sự × kỹ năng theo team, gồm cả người chưa khai báo skill; lọc thành viên đang hiệu lực và phân trang. View dùng RLS của bảng nguồn, chỉ HR/Owner được xem team. |
| Dashboard | Lọc dự án và khoảng ngày, đếm timesheet có kỳ giao với khoảng đã chọn. Utilization lấy approved worklog trong kỳ chia capacity: 8h/ngày thứ Hai–thứ Sáu, loại nghỉ phép approved và áp dụng allocation approved khi lọc dự án. Capacity bằng 0 hiển thị “—”. Health/issue đang mở vẫn là trạng thái hiện tại và được ghi rõ trên UI. |
| Phân trang | Danh sách project/proposal, issue, client/contact, invoice/payment/line, ticket con, Skill Matrix và báo cáo utilization. Bộ lọc được giữ trong URL. Tổng thanh toán hóa đơn được lấy từ view aggregate, không cộng riêng trang payment đang hiển thị. |
| Demo | Bổ sung fixtures contact, Sprint, parent/child, team/skill, allocation và báo cáo theo kỳ. Demo vẫn chỉ đọc dữ liệu, không mô phỏng thao tác ghi thành công. |

Các danh sách chính có 50 bản ghi mỗi trang. Dropdown project/client/sprint dùng tập lựa chọn có giới hạn 1.000 bản ghi; nếu dữ liệu vượt ngưỡng này cần mở rộng picker tìm kiếm phía server. Trang chi tiết project hiển thị tối đa 100 ticket, có link sang board phân trang để xem đầy đủ.

## Database chưa triển khai

Hai migration forward-only:

- `supabase/migrations/202610060015_worklog_contacts_issue_hierarchy.sql`
- `supabase/migrations/202610060016_team_dashboard_reporting.sql`

Không sửa các migration đã áp dụng trước đó. Cần áp dụng 015 rồi 016 vào database local/test trước khi kiểm thử thao tác ghi bằng tài khoản thật. Nếu chỉ cập nhật frontend trên DB cũ, các chức năng mới sẽ báo lỗi truy vấn hoặc không lưu được.

`supabase/tests/mvp_completion.test.sql` bổ sung 56 assertion pgTAP cho allow/deny, version, worklog draft/submitted/locked, parent cross-project/cycle, contact chính, Skill Matrix, scope/capacity báo cáo và tổng payment vượt trang 50 bản ghi. Fixture nằm trong transaction rollback, chỉ chạy trên DB test cô lập. Bộ SQL này chưa được thực thi trong môi trường hiện tại do không có PostgreSQL/Supabase local đang hoạt động; không coi việc có test là đã đạt nghiệm thu database.

## Kiểm tra local

- TypeScript đạt.
- 22/22 test cấu hình, demo và reporting đạt.
- Smoke HTTP qua 10 trang demo đạt: dashboard/lọc kỳ, clients, projects/detail, board Sprint, issue detail, HR teams, worklogs và invoices; không có thông báo lỗi truy vấn.
- Production build Webpack đạt. Demo dev server dùng font fallback khi sandbox chặn Google Fonts; đây không phải lỗi kết nối Supabase.

Từ thư mục `web/`:

```powershell
node --test scripts/supabase-db-config.test.mjs scripts/demo-data.test.mjs scripts/reporting.test.mjs
.\node_modules\.bin\tsc.cmd --noEmit
node node_modules/next/dist/bin/next build --webpack
```

Xem UI mà không cần Supabase env:

```powershell
node scripts/dev-demo.mjs --port 3012
```

Mở `http://127.0.0.1:3012/login`, chọn **Xem dữ liệu mẫu**. Ở terminal khác, trong `web/`, chạy `node scripts/smoke-demo.mjs` để kiểm tra các trang qua HTTP. Smoke này không thay thế kiểm thử tương tác browser hoặc nghiệp vụ ghi dữ liệu thật.

## Phần tiếp theo

Khi có database local/Cloud: chạy migrations và hai bộ pgTAP, thử đủ thao tác ghi theo role thật, kiểm tra submit/reject/resubmit/lock và phiên bản thay đổi đồng thời. Sau đó mới nghiệm thu Auth, Storage, Realtime và email.

Reminder chưa submit, phân trang các danh sách còn lại và xử lý điều chỉnh sau khóa đã được bổ sung trong [đợt tiếp theo](timesheet-followup-2026-10-06.md), với migration 017 và kiểm tra PostgreSQL cô lập. Payroll gross/net, approval/lock/payslip và cấu hình email/Cron vẫn còn lại. **Cập nhật 2026-10-08:** health check và Sentry instrumentation đã được thêm trong source; cấu hình DSN và xác nhận event production vẫn chờ triển khai môi trường. Payroll cần chính sách HR/kế toán đã được chốt trước khi triển khai công thức.
