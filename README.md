# Hezb Human

## Cấu hình môi trường

File env của ứng dụng đặt ở **`web/.env.local`**, cùng cấp với `web/package.json`. File env cho Edge Function đặt ở **`supabase/functions/.env`**. Không cần file env ở thư mục gốc. Các file chứa giá trị thật đã được Git bỏ qua; file `.env.example` là mẫu có thể commit.

### Ứng dụng: `web/.env.local`

| Biến | Khi nào cần | Giá trị |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Bắt buộc khi dùng Supabase thật | Project URL của Supabase; local: `http://127.0.0.1:54321`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Bắt buộc nếu không dùng anon key | Public publishable key của cùng project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Thay thế publishable key | Legacy anon key; để trống nếu đã dùng publishable key. |
| `SUPABASE_DB_URL` | Chạy `setup:supabase` | Connection string từ Connect, Direct hoặc Session pooler, cổng 5432. |
| `SUPABASE_DB_PASSWORD` | Khi DB URL chưa chứa mật khẩu thật | Mật khẩu database, đặt trong dấu nháy kép; ký tự `$` viết thành `\$`. |
| `SUPABASE_OWNER_EMAIL` | Tùy chọn khi cấp Owner đầu tiên | Email user đã xác nhận trong Supabase Auth; có thể dùng `--owner-email EMAIL` thay thế. |
| `NEXT_PUBLIC_HEZB_DEMO` | Tùy chọn | `0` cho ứng dụng thường, `1` để bật demo trong development; `dev:demo` tự đặt biến này. |

Điền URL và public API key từ Supabase Dashboard của bạn. Không dùng service role/secret key cho các biến `NEXT_PUBLIC_*`. Với database, có thể giữ `[YOUR-PASSWORD]` trong connection string và điền mật khẩu riêng vào `SUPABASE_DB_PASSWORD`. File được Next.js và các script quản trị tự đọc; khởi động lại server sau khi sửa.

Từ thư mục `web/`, sau khi điền cấu hình và cài dependencies:

```sh
pnpm check:supabase --cloud
pnpm dev --webpack
```

Nếu dùng Supabase local, bỏ `--cloud`. Xem [hướng dẫn frontend và migration](web/README.md) để thiết lập database.

### Nhắc việc qua email: `supabase/functions/.env`

Chỉ cần điền nhóm này khi dùng Edge Function `email-reminders`:

| Biến | Giá trị |
| --- | --- |
| `REMINDER_CRON_SECRET` | Chuỗi ngẫu nhiên dài để xác thực cron; dùng cùng giá trị ở caller/Vault. |
| `RESEND_API_KEY` | API key của Resend. |
| `EMAIL_REMINDER_FROM` | Ví dụ `Hezb ERP <reminders@your-verified-domain.com>`, dùng domain đã xác minh trên Resend. |
| `ERP_BASE_URL` | URL ứng dụng ERP; mặc định local là `http://localhost:3000`. |

Runtime Supabase cung cấp `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` (hoặc `SUPABASE_SECRET_KEYS`); không cần thêm chúng vào file env tùy chỉnh.

Khi Supabase local đang chạy, từ thư mục gốc của repo:

```sh
supabase functions serve email-reminders --env-file supabase/functions/.env
```

Trên Cloud, đặt bốn biến tùy chỉnh này trong **Edge Function secrets**; file local không tự cấu hình secrets cho Cloud. Xem [hướng dẫn deploy email reminders](docs/email-reminders-deploy.md).
