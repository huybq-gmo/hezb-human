# Hoàn thiện timesheet và phân trang — 2026-10-06

## Chức năng đã bổ sung

- Worklog journal, lịch sử/duyệt timesheet, đơn nghỉ phép, role assignment và project membership có phân trang 50 bản ghi. Bộ lọc nghỉ phép, role và membership chạy trước phân trang ở database, giữ tham số trên URL. Directory views dùng `security_invoker` để giữ RLS. Các ô chọn dự án/user/ticket vẫn lấy tối đa 1.000 lựa chọn; danh mục loại nghỉ phép tối đa 100.
- Tổng giờ theo ticket/ngày trong tuần lấy từ view tổng hợp toàn bộ giờ có quyền đọc, độc lập với trang nhật ký đang xem. Trang timesheet cá nhân lọc employee ở server trước phân trang, tránh mất bản ghi do lọc sau khi đã lấy trang chung.
- Tab **Điều chỉnh sau khóa** hiển thị yêu cầu và lịch sử quyết định. Nhân viên chọn giờ mới cho 1–200 worklog đã có trong timesheet locked, nhập lý do, gửi PM/Owner độc lập duyệt. Dialog phân trang các dòng và giữ giờ đã chọn khi chuyển trang. PM/Owner nhận notification yêu cầu; nhân viên nhận kết quả.
- RPC duyệt cập nhật worklog, timesheet line và tổng giờ trong một transaction, giữ status `approved`/`locked` và khóa kỳ. Lịch sử giữ giờ trước/sau, version worklog lúc đề xuất, người yêu cầu, người xử lý, lý do và thời điểm quyết định. Quyền ghi trực tiếp vẫn bị chặn. Chỉ RPC được phép cấp ngữ cảnh ghi trong bảng `internal` không thể truy cập từ client; không dùng biến cấu hình do client đặt để vượt khóa.
- Chặn tự duyệt, yêu cầu đã xử lý, version cũ, tổng giờ/ngày vượt 24, giờ đã dùng trong snapshot hóa đơn và kỳ lương locked. Việc phát hành hóa đơn khóa cùng project để tránh chạy đồng thời với điều chỉnh. Điều chỉnh giờ đã dùng cho tài chính cần quy trình riêng; không thay đổi snapshot hóa đơn. Yêu cầu cũ chỉ có lý do chưa có giờ đề xuất có thể từ chối rồi tạo lại.
- Edge Function bổ sung reminder chưa nộp timesheet, có dry-run, claim chống trùng và retry như các loại email trước đó. RPC candidate chỉ cấp cho `service_role`; đọc theo trang 500, gộp thành một email/nhân viên/ngày cho các dự án thiếu nộp.

## Chính sách reminder

Mặc định xét **tuần thứ Hai–Chủ nhật đã kết thúc**, tính ngày hiện tại theo Việt Nam. Xét các ngày thứ Hai–thứ Sáu mà membership có hiệu lực và nhân viên đã vào làm, project/employee/profile còn active. Bỏ qua ngày nghỉ approved, ngày thuộc kỳ khóa và ngày đã có timesheet ngoài draft phủ kín. Còn draft hours hoặc chưa có timesheet cho ngày làm việc thì đưa vào reminder, kể cả chưa có worklog. Email dẫn về tuần cần nộp, tổng hợp tên dự án và giờ draft nếu có.

Chính sách tuần là lựa chọn triển khai theo màn hình timesheet hiện có, không phải cấu hình kỳ lương. Nếu công ty dùng kỳ nộp khác hoặc lịch ngày lễ, cần mở rộng cấu hình lịch. Chưa gửi email thật hoặc cài Cron.

## Database và kiểm tra

Migration mới: `supabase/migrations/202610060017_timesheet_followup.sql`; chạy sau 015–016. **Chưa áp dụng lên Supabase local/Cloud của người dùng.**

Đã kiểm tra trong môi trường này:

- TypeScript và production build Webpack đạt.
- 27/27 Node tests cho cấu hình, demo, reporting và nhóm/email reminder đạt.
- 15/15 smoke HTTP trang demo đạt. Đây là kiểm tra render/read, chưa phải browser E2E thao tác ghi.
- Toàn bộ migrations đến 017 chạy thành công trên PostgreSQL WASM (PGlite) mới, trong bộ nhớ; 60 assertion nghiệp vụ/quyền đạt. Auth functions và Storage tables được dựng tối thiểu để kiểm tra SQL/RLS; không thay thế Auth/Storage/Realtime thực của Supabase. Fixture rollback và database bị hủy cuối lượt chạy. Đây không phải kết quả chạy bộ pgTAP Supabase.
- Bộ `supabase/tests/mvp_completion.test.sql` 56 assertion từ đợt trước và bộ pgTAP frontend chưa được chạy lại trên Supabase trong đợt này.

Lệnh kiểm tra từ thư mục `web`:

```powershell
node --test scripts/supabase-db-config.test.mjs scripts/demo-data.test.mjs scripts/reporting.test.mjs scripts/timesheet-followup.test.mjs
.\node_modules\.bin\tsc.cmd --noEmit
node node_modules/next/dist/bin/next build --webpack
node scripts/smoke-demo.mjs
```

Smoke yêu cầu demo đang chạy: `node scripts/dev-demo.mjs --port 3012`.

PostgreSQL cô lập là công cụ kiểm tra tùy chọn, không thêm dependency của app hay lockfile. Cài một lần từ **thư mục gốc repository**, rồi chạy script trong `web`:

```powershell
npm.cmd install --prefix web/node_modules/.cache/hezb-sql-check --no-package-lock --no-save @electric-sql/pglite@0.5.8
node web/scripts/check-timesheet-db.mjs
```

## Còn lại

Payroll 8b/8c cần chốt chính sách tính lương; `/api/health` và production error sink chưa bổ sung. Khi có env: áp dụng migrations 015–017, chạy pgTAP, UAT theo role thật, kiểm thử thao tác đồng thời, Auth/Storage/Realtime, email dry-run/gửi thật và cài Cron.
