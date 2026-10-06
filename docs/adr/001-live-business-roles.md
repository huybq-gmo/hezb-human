# ADR 001 — Phân quyền nghiệp vụ từ assignment đang có hiệu lực

## Quyết định

Giữ claim JWT `role=authenticated` để Supabase Data API chọn đúng PostgreSQL role. RLS và RPC đọc quyền nghiệp vụ từ `core_role_assignment`, `core_role_permission` và `project_membership` bằng helper `security definer` trong schema `internal`, với `search_path=''` và tên bảng đầy đủ. Không ghi đè JWT role bằng `company_owner`, `developer`, v.v.

User phải có profile active và ít nhất một assignment hoặc membership còn hiệu lực để truy cập dữ liệu ERP. Tài khoản Auth tự đăng ký chưa được cấp quyền không đọc được danh sách nhân sự. Membership kiểm tra cả ngày bắt đầu, ngày kết thúc và thu hồi; assignment kiểm tra thu hồi và hết hạn. Views dùng `security_invoker=true` để giữ RLS của người gọi.

Owner quản lý các capability bundle đã được định nghĩa sẵn cho system roles qua `core_role_permission`. Company Owner luôn được bảo vệ; capability Finance chỉ phát sinh từ assignment Finance Admin. Ma trận không tạo permission code tùy ý và chỉ Owner được sửa.

Frontend dùng RPC `get_my_roles()` làm nguồn capability hiệu lực; danh sách trả về có thể khác role assignment khi Owner cấu hình ma trận. Kết quả rỗng có nghĩa là không còn capability, không lấy quyền cũ từ JWT. Fallback JWT chỉ dành cho database cũ chưa có RPC này. Các RPC ghi, helper thông báo và trigger có grant tường minh; client không được gọi helper ghi nội bộ.

## Lý do và hệ quả

Ví dụ SQL trong Phase 1 dùng claim `role` cho quyền nghiệp vụ, xung đột với vai trò PostgreSQL của Supabase và giữ quyền cũ đến lúc refresh token. Kiểm tra assignment trực tiếp làm thu hồi quyền có hiệu lực ở request tiếp theo và hỗ trợ nhiều role/membership cho một người.

Owner đầu tiên được cấp qua connection quản trị database sau khi tạo và xác nhận tài khoản Supabase Auth. Sau đó sử dụng UI quản lý role. Bootstrap dừng khi đã có owner khác; không tạo mật khẩu hoặc tài khoản Auth bằng SQL. Role nghiệp vụ phải được cấp trước khi người mới đọc dữ liệu ERP.

Migration hiện tại triển khai contract của các trang đã có; trạng thái và phần còn lại theo từng phase nằm trong [implementation plan](../implementation-plan-remaining.md).

Tham khảo: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database functions](https://supabase.com/docs/guides/database/functions).
