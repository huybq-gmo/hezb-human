# Refactor giao diện Hezb ERP

Nguồn thiết kế: `Hezb ERP — Giao diện.html`. Luồng nghiệp vụ được đối chiếu với `erp-platform-plan-v3.md` và các tài liệu Phase 0–8 trong `docs/phases/`.

## Giao diện

- Giữ font Be Vietnam Pro, bảng màu indigo/cyan, avatar lục giác, sidebar 232px, card 12px và bảng gọn của thiết kế. Màn hình dưới 860px chuyển điều hướng thành thanh ngang; bảng và board cuộn trong vùng riêng.
- Màu sáng/tối dùng cùng các biến trong `web/src/app/globals.css`. Theme được lưu, áp dụng trước hydration và đồng bộ giữa các tab.
- Button, Card, Badge, Field, Progress, MetricStrip, trạng thái rỗng và lỗi tải dùng các component chung. Modal dùng native dialog, hỗ trợ Escape, giữ focus và trả focus khi đóng.
- Login bỏ thông tin đăng nhập mẫu. Magic link đi qua callback đổi mã lấy session. Logo Hezb được dùng cho biểu tượng trang.

## Các màn hình

| Màn hình | Thay đổi |
| --- | --- |
| Dashboard | Thống kê thực từ Supabase, phân biệt số 0 với lỗi; bỏ số liệu mẫu. Giờ được duyệt hiển thị bằng giờ, không suy diễn thành utilization khi chưa có capacity. |
| Dự án | Bộ lọc, tìm kiếm, đề xuất và nút duyệt theo quyền; bổ sung chi tiết dự án, milestone, thành viên và log gần đây. |
| Board & ticket | Board bốn cột chính, thêm nhóm backlog/blocked/cancelled khi có dữ liệu; kéo thả qua RPC, danh sách, tạo ticket. Trang ticket có mô tả, hoạt động, bình luận/xem trước, log work và tệp đính kèm qua private bucket. |
| Timesheet | Bảng tuần theo ticket từ worklog cá nhân, đổi tuần, nhật ký giờ làm; tách phần duyệt, giữ quy trình Leader → PM → khóa. Form có billable, kiểm tra khoảng ngày và chặn tự duyệt trên UI. |
| Nhân sự | Avatar lục giác, bộ lọc loại/phòng ban/trạng thái, phân trang 50 dòng, form thêm nhân sự; chi tiết gồm thông tin, hợp đồng, kỹ năng, đơn giá và phép. |
| Nghỉ phép | Bộ lọc, modal tạo đơn, duyệt/từ chối theo quyền, kiểm tra ngày và chặn tự duyệt. |
| Phân quyền và hồ sơ | Đồng nhất bảng/form/modal; ẩn mutation không có quyền; hiển thị hiệu lực membership và lịch sử phù hợp quyền. |
| Tìm kiếm và thông báo | Tìm trên dữ liệu được RLS cho phép; thông báo đọc từ bảng, có cập nhật Realtime và đánh dấu đã đọc. |

## Hợp đồng dữ liệu

- Giữ Supabase Auth, RLS và RPC làm nơi kiểm tra quyền cuối cùng. Điều kiện hiển thị trên frontend giúp người dùng thấy thao tác phù hợp.
- Role/membership dùng chung qua `getWorkspaceUser` và `WorkspaceProvider`; membership phải đến ngày hiệu lực và chưa hết hạn.
- Quyền hiện tại lấy từ `get_my_roles()`; chỉ dùng claim đã xác minh làm fallback cho database cũ chưa có RPC. Kết quả rỗng không khôi phục quyền đã thu hồi từ JWT. Xem [ADR 001](adr/001-live-business-roles.md).
- Chuẩn hóa `budget_currency`, `estimated_budget` và `occurred_at` theo tài liệu phase. Tra cứu tên profile bằng ID để tránh yêu cầu một foreign key chưa được định nghĩa từ membership sang profile.
- Hai RPC chuyển trạng thái tiếp tục hỗ trợ tên tham số đang có trong frontend; nếu PostgREST báo không tìm thấy chữ ký (`PGRST202`), thử chữ ký `p_new_status`/`p_reason` trong tài liệu phase. Không thử lại khi nghiệp vụ bị từ chối.
- UI notification cần bảng `core_notification` và publication Realtime; attachment cần bucket private `issue-attachments` và storage policy đã được triển khai. Có trạng thái lỗi khi tài nguyên chưa sẵn sàng.
- Giao diện nối với bộ [migration cho các trang hiện có](../supabase/README.md). Bộ này chưa triển khai toàn bộ phase/backend, billing hoặc payroll và không đánh dấu các phase hoàn thành.

## Chạy và kiểm tra

Trong `web/`, dùng Node 24 qua `nvm use` (có `.nvmrc`), rồi `pnpm dev`. Node mặc định 18 của môi trường hiện tại không đáp ứng yêu cầu của Next.js đã cài.

Để xem dữ liệu mẫu ngay trong web, chạy `pnpm dev` rồi chọn **Xem dữ liệu mẫu** trên `/login` hoặc sidebar. Bộ mẫu tại `web/src/lib/demo/data.mjs` gồm 12 nhân sự, 5 dự án, 18 ticket và dữ liệu liên quan. Transport trong bộ nhớ dùng chung cho các truy vấn server/client, không chạy API riêng. Nhãn dữ liệu mẫu có nút **Về dữ liệu thật**; các thao tác lưu/duyệt/upload bị từ chối và phiên Cloud được giữ nguyên. `pnpm dev:demo` vẫn dùng được khi chưa có cấu hình Supabase. Production không cho vào chế độ mẫu. Hướng dẫn ở `web/README.md`.

Chế độ dữ liệu mẫu tích hợp đã qua 7 kiểm tra SDK/dữ liệu và 26 kiểm tra trình duyệt: mở các trang và chi tiết, bộ lọc, form chỉ xem, theme, thông báo, mobile, trang không tồn tại, không gửi yêu cầu tới Supabase, thoát chế độ mẫu và giữ cookie khác cùng `.env.local`. Sáu kiểm tra bổ sung xác nhận production không hiện nút mẫu, bỏ qua cookie mẫu, từ chối endpoint mẫu và lệnh demo; `dev:demo` vẫn hoạt động không cần `.env.local` hoặc API riêng. Build production và TypeScript đạt.

```sh
pnpm typecheck
pnpm test:demo
pnpm build
```

Trong môi trường sandbox chặn cổng nội bộ của Turbopack, kiểm tra build bằng `pnpm build --webpack` với quyền chạy ngoài sandbox. Không cần đổi bundler mặc định của dự án.

Kiểm tra trình duyệt dùng một máy chủ Supabase giả lập riêng trên localhost, không dùng hoặc ghi dữ liệu thật. Các thao tác thực tế trên Supabase và policy pgTAP vẫn cần được kiểm chứng ở môi trường có schema/migration tương ứng.

Đã kiểm tra TypeScript, build production bằng Webpack và 39 kiểm tra trình duyệt Chromium:

- Đăng nhập, điều hướng, sidebar, thông báo và lưu theme sau khi tải lại.
- Các trang chính và chi tiết dự án/ticket trên desktop 1440px và mobile 390px; kiểm tra vùng nội dung và nút topbar nằm trong màn hình.
- Log work lưu số giờ và lựa chọn billable; duyệt timesheet, kéo ticket, thêm nhân sự, lưu bình luận và kiểm tra ngày nghỉ phép.
- Trạng thái không có dữ liệu, lỗi tải, chống tự duyệt, phân biệt quyền Owner/Developer và không có lỗi JavaScript trong trình duyệt.

Bảng nhân sự phân trang 50 dòng; các bộ lọc phía client trên những màn khác áp dụng cho tập dữ liệu đã tải. Thông báo tải 20 mục gần nhất; lịch sử và danh sách liên quan có giới hạn để tránh tải toàn bộ dữ liệu. Các phase billing/payroll chưa có màn hình trong frontend hiện tại.
