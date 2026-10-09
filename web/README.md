# Hezb ERP — Frontend

Giao diện Next.js theo `../Hezb ERP — Giao diện.html`. Yêu cầu Node 24 và pnpm; thư mục này có `.nvmrc`.

Hướng dẫn dành cho người dùng: [Hướng dẫn sử dụng Hezb ERP](../docs/huong-dan-su-dung.md).

## Chạy ứng dụng với Supabase

Tạo `.env.local` trong `web/`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
SUPABASE_SECRET_KEY=sb_secret_your-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Code ưu tiên `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` theo cấu hình hiện tại của Supabase. Tên cũ `NEXT_PUBLIC_SUPABASE_ANON_KEY` vẫn được hỗ trợ khi chưa khai báo publishable key.

```bash
pnpm dev --webpack
```

Đăng nhập bằng tài khoản đã tạo trong Supabase Auth. Schema, RLS và role cần được triển khai theo `../docs/phases/`; repo chưa có tài khoản mặc định. Các trang đọc dữ liệu từ database theo quyền của tài khoản.

Ứng dụng không có chế độ xem dữ liệu mẫu hoặc đăng nhập thử. Nếu danh sách trống, kiểm tra bộ lọc, dữ liệu trong database và quyền truy cập của tài khoản.

Nếu quên mật khẩu, dùng **Quên mật khẩu?** trên trang đăng nhập. Supabase gửi email khôi phục; `/auth/callback` xác minh cả mã PKCE và session trong fragment của lời mời rồi mở `/reset-password`. Callback thất bại không mở form đổi mật khẩu bằng phiên đăng nhập cũ. Trang đặt mật khẩu hiện email đã được Auth xác minh; kiểm tra đúng tài khoản trước khi lưu. Trong **Authentication → URL Configuration → Redirect URLs**, cho phép callback của từng môi trường (ví dụ `http://localhost:3000/**` và `https://your-domain.example/**`); Supabase chỉ chuyển hướng tới URL trong allowlist. Cần cấu hình email provider/SMTP để nhận thư. Nếu yêu cầu gửi email bị từ chối, giao diện hiện mã lỗi và HTTP status; đối chiếu với Auth Logs thay vì suy luận nguyên nhân từ thông báo chung.

Kiểm tra cấu hình Cloud và các bảng/view mà frontend cần:

```bash
pnpm check:supabase --cloud
```

Lệnh chỉ đọc cấu hình Auth và gửi truy vấn `limit=0`, không lấy dữ liệu nhân sự và không ghi database. Nó phân biệt lỗi kết nối/key, bảng chưa có hoặc chưa expose, và bảng cần đăng nhập để xác minh. Bảng bị từ chối khi chưa đăng nhập có thể đang được bảo vệ đúng. Lệnh chưa kiểm tra các RPC nghiệp vụ hay policy theo từng user.

Migration cho các trang hiện có nằm trong [supabase/migrations](../supabase/migrations/). Để tự động triển khai Cloud, thêm biến **chỉ dùng cho script quản trị** vào `.env.local`:

```dotenv
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.PROJECT_REF.supabase.co:5432/postgres
SUPABASE_DB_PASSWORD=""
```

Copy connection string từ Supabase **Connect → Direct → Connection string**. Script hỗ trợ Direct connection và Session pooler cổng 5432. Giữ `[YOUR-PASSWORD]` trong URI và điền mật khẩu database vào `SUPABASE_DB_PASSWORD` giữa dấu nháy kép. Script truyền mật khẩu riêng cho PostgreSQL, nên không cần URL encode mật khẩu. Nếu giá trị chứa `$`, viết thành `\$` theo quy tắc `.env` của Next.js. Hai biến này chỉ dùng cho script quản trị, không có tiền tố `NEXT_PUBLIC_`.

`SUPABASE_DB_PASSWORD` được ưu tiên; connection string đã chứa mật khẩu URL encode vẫn được hỗ trợ khi biến mật khẩu riêng để trống. Khi Direct connection không truy cập được qua mạng IPv4, chọn Session pooler trong Connect và thay `SUPABASE_DB_URL`, giữ nguyên biến mật khẩu.

Tạo user quản trị trong **Authentication → Users → Add user**, xác nhận email, rồi chạy:

```bash
pnpm setup:supabase --owner-email YOUR_EMAIL
pnpm setup:supabase --apply --owner-email YOUR_EMAIL
pnpm check:supabase --cloud
pnpm dev --webpack
```

Lệnh đầu chỉ kiểm tra. Lệnh có `--apply` triển khai migration và owner đầu tiên trong một transaction; lần sau bỏ qua migration đã áp dụng với cùng checksum. Script kiểm tra DB URL thuộc cùng Cloud project và dừng nếu có bảng ERP chưa được quản lý bằng bộ migration này. Không ghi đè database đang có schema khác.

Sau khi đăng nhập, Owner cấp role cho các user khác tại `/dashboard/admin/roles`. Nhân sự cần được liên kết với UUID Supabase Auth trong `hr_employee.user_id` để gửi nghỉ phép/giờ làm. Thiết lập số dư nghỉ phép và membership dự án bằng Table Editor/SQL Editor khi khởi tạo; UI hiện tại chưa có form cho các phần này. Database mới mở các trang với dữ liệu rỗng; migration không tạo dữ liệu kinh doanh mẫu hoặc mật khẩu mặc định.

Nếu cần dữ liệu giả lập cho một database mới, script riêng `pnpm seed:dashboard-sample` cho xem trước và `pnpm seed:dashboard-sample -- --apply` để ghi. Script dừng nếu đã có dữ liệu nghiệp vụ. Đây là thao tác nạp record vào database, không phải chế độ xem thử của giao diện.

Phạm vi schema, quy trình SQL Editor, kiểm tra RLS và phần phase chưa triển khai: [supabase/README.md](../supabase/README.md).

Owner hoặc HR Admin có thể mời tài khoản mới hoặc liên kết tài khoản Auth đã tồn tại ngay trong hồ sơ nhân sự. Lời mời được gửi qua email provider/SMTP của Supabase; người nhận mở liên kết để đặt mật khẩu. Sau đó Owner cấp vai trò tại trang Phân quyền. Chức năng yêu cầu SUPABASE_SECRET_KEY ở máy chủ (hoặc SUPABASE_SERVICE_ROLE_KEY cũ) và migration 202610060018_employee_account_link.sql. Chỉ giữ khóa này trong biến môi trường server, không dùng tiền tố NEXT_PUBLIC_; cấu hình NEXT_PUBLIC_SITE_URL và cho phép URL /auth/callback trong Supabase Redirect URLs.

## Health check và theo dõi lỗi production

GET /api/health là liveness check, còn GET /api/health/ready kiểm tra cấu hình và khả năng truy cập Supabase Auth. Hai endpoint không yêu cầu đăng nhập, không lưu cache và chỉ trả trạng thái tổng quát; readiness trả HTTP 503 nếu Supabase Auth chưa sẵn sàng.

Để nhận lỗi production, tạo project Sentry rồi đặt cùng DSN vào NEXT_PUBLIC_SENTRY_DSN và SENTRY_DSN trong môi trường ứng dụng. SDK gửi lỗi client, server component và API route; sự kiện được lọc request, user, breadcrumb, dữ liệu bổ sung và nội dung lỗi trước khi gửi. SENTRY_AUTH_TOKEN, SENTRY_ORG và SENTRY_PROJECT chỉ cần ở bước build nếu muốn upload source map để xem stack trace theo mã nguồn; giữ token trong secret của CI/hosting.

Các bước cấu hình hosting, kiểm tra endpoint, xác nhận event staging và xử lý lỗi thường gặp: [hướng dẫn deploy health check và Sentry](../docs/health-monitoring-deploy.md).

## Kiểm tra và build

```bash
pnpm check
pnpm build --webpack
pnpm start
```

Kiểm tra migrations và RLS trên Supabase local (cần Docker và Supabase CLI):

```bash
supabase start
supabase db reset
supabase test db
```

Chi tiết refactor: [docs/ui-refactor.md](../docs/ui-refactor.md).
