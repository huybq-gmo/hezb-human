# Hezb ERP — Frontend

Giao diện Next.js theo `../Hezb ERP — Giao diện.html`. Yêu cầu Node 24 và pnpm; thư mục này có `.nvmrc`.

## Xem giao diện mà chưa có tài khoản

Dữ liệu mẫu nằm trực tiếp trong [src/lib/demo/data.mjs](src/lib/demo/data.mjs): 12 nhân sự, 5 dự án, 18 ticket, 5 timesheet, 8 worklog, 6 đơn nghỉ phép; có hợp đồng, kỹ năng, đơn giá, số dư phép, thành viên, milestone, bình luận và thông báo. Ngày của dữ liệu được tính theo tuần hiện tại.

Khi đang chạy `pnpm dev`, bấm **Xem dữ liệu mẫu** tại trang login hoặc bên dưới sidebar. Các trang dùng cùng bộ dữ liệu trong web, không cần chạy thêm API hay nạp dữ liệu vào database. Nhãn **Xem thử · Dữ liệu mẫu · Chỉ xem** giúp nhận biết chế độ này; bấm **Về dữ liệu thật** để trở lại phiên Supabase đang có.

Trong thư mục `web/`:

```bash
source ~/.nvm/nvm.sh
nvm use
pnpm install
pnpm dev:demo
```

Nếu đã có dependencies thì bỏ qua `pnpm install`. Mở http://localhost:3000/login và bấm **Xem dữ liệu mẫu**. Dùng sidebar để mở các trang; bấm tên nhân sự, dự án hoặc ticket để xem chi tiết. Có thể kiểm tra bộ lọc, chuyển tab, theme sáng/tối, mở form và bố cục mobile.

Lệnh `dev:demo` chạy Next.js với cấu hình xem thử và dùng cùng bộ dữ liệu trong web với quyền Owner. Các thao tác lưu, duyệt và upload bị từ chối vì đây là chế độ chỉ xem. Không cần Supabase hoặc `.env.local`; không có email được gửi. Nhấn Ctrl+C để dừng Next.js.

Nếu cổng 3000 đang được dùng:

```bash
pnpm dev:demo --port 3001
```

Lúc này mở http://localhost:3001/login. Demo dùng thư mục `.next-demo` riêng nên có thể chạy cùng server dev thường ở cổng 3000.

Nút xem thử chỉ hiện trong development. Production bỏ qua cookie xem thử và tiếp tục yêu cầu phiên Supabase thật. Phiên mẫu nằm trong bộ nhớ riêng, không thay thế cookie đăng nhập Cloud.

## Chạy với Supabase thật

Tạo `.env.local` trong `web/`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

Code ưu tiên `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` theo cấu hình hiện tại của Supabase. Tên cũ `NEXT_PUBLIC_SUPABASE_ANON_KEY` vẫn được hỗ trợ khi chưa khai báo publishable key.

```bash
pnpm dev --webpack
```

Đăng nhập bằng tài khoản đã tạo trong Supabase Auth. Schema, RLS và role cần được triển khai theo `../docs/phases/`; repo chưa có tài khoản mặc định. Tắt server demo trước khi chuyển sang server thật.

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

Phạm vi schema, quy trình SQL Editor, kiểm tra RLS và phần phase chưa triển khai: [supabase/README.md](../supabase/README.md).

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
