# Hướng dẫn health check và theo dõi lỗi production

Tài liệu này hướng dẫn cấu hình hai health endpoint và gửi lỗi của web app lên Sentry. Phần code tích hợp đã có sẵn; cần tạo Sentry project và khai báo biến môi trường trên hosting/CI của từng môi trường.

## Các endpoint

| Endpoint | Mục đích | Kết quả thành công | Khi lỗi |
|---|---|---|---|
| `GET /api/health` | Liveness: xác nhận app đang phục vụ request | HTTP `200`, `status: "ok"` | Nếu app không phản hồi, kiểm tra process/hosting và log deploy |
| `GET /api/health/ready` | Readiness: xác nhận cấu hình và Supabase Auth truy cập được | HTTP `200`, `status: "ready"`, `supabaseAuth: "ok"` | HTTP `503` nếu thiếu cấu hình, Supabase Auth lỗi hoặc probe quá 2,5 giây |

Hai endpoint không yêu cầu đăng nhập, không lưu cache và không trả URL, API key hay nội dung lỗi bên thứ ba. Middleware của app cho phép probe đi qua mà không chuyển hướng sang `/login`.

Readiness hiện chỉ gọi Supabase Auth `GET /auth/v1/health`; nó không kiểm tra Postgres/Data API, Storage, Realtime, email hoặc các truy vấn nghiệp vụ. Dùng liveness để kiểm tra tiến trình web; dùng readiness khi cần biết thêm Auth có sẵn sàng hay không. Tài liệu Supabase về endpoint Auth health: [Check the GoTrue API version](https://supabase.com/docs/guides/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR).

## Cấu hình Sentry

### 1. Tạo project và lấy DSN

Trong Sentry, tạo project cho Next.js và lấy DSN trong phần cài đặt project/client key. Có thể dùng cùng một DSN cho client và server; nếu tổ chức tách project theo môi trường thì dùng DSN tương ứng cho từng deployment.

### 2. Khai báo biến môi trường

Đặt các biến sau trong hosting của ứng dụng. Không commit giá trị DSN/token thật vào Git.

| Biến | Nơi cần có | Bắt buộc | Ghi chú |
|---|---|---:|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Build web client | Có để gửi lỗi trình duyệt | DSN là public; giá trị được đóng vào bundle nên phải build lại khi thay đổi |
| `SENTRY_DSN` | Runtime Node/Edge | Có để gửi lỗi server | Thường đặt cùng DSN với client; nếu trống, server config dùng `NEXT_PUBLIC_SENTRY_DSN` làm fallback |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Build web client | Không | Ví dụ `staging` hoặc `production`; mặc định theo `NODE_ENV` |
| `SENTRY_ENVIRONMENT` | Runtime Node/Edge | Không | Nên đặt cùng tên environment với client để lọc event nhất quán |
| `SENTRY_AUTH_TOKEN` | CI/build | Không | Chỉ cần nếu muốn upload source map; đây là secret, không dùng tiền tố `NEXT_PUBLIC_` |
| `SENTRY_ORG` | CI/build | Khi upload source map | Organization slug trong Sentry |
| `SENTRY_PROJECT` | CI/build | Khi upload source map | Project slug trong Sentry |

Ví dụ cho production:

```dotenv
NEXT_PUBLIC_SENTRY_DSN=PASTE_THE_PROJECT_DSN_HERE
SENTRY_DSN=PASTE_THE_PROJECT_DSN_HERE
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_ENVIRONMENT=production
```

Thay cả hai giá trị bằng DSN được cấp trong Sentry; không giữ nguyên chuỗi placeholder.

`NEXT_PUBLIC_SENTRY_DSN` phải có lúc build frontend. Sau khi thêm hoặc đổi giá trị này, tạo deployment mới; chỉ cập nhật runtime environment mà không rebuild có thể để client tiếp tục dùng DSN cũ.

### 3. Upload source map (tùy chọn)

Nếu muốn Sentry hiển thị stack trace theo file TypeScript/TSX gốc, thêm `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` và `SENTRY_PROJECT` vào **môi trường build của CI/hosting**, rồi build production bằng cấu hình hiện có:

```bash
cd web
pnpm build --webpack
```

`next.config.ts` đã gọi `withSentryConfig`; không cần chạy Sentry Wizard hoặc sửa lại các file instrumentation. Token chỉ phục vụ bước build/upload và phải lưu trong secret store. Không đưa token vào bundle trình duyệt, repository hoặc log build. Nếu không cấu hình token, SDK vẫn có thể gửi event nhưng stack trace có thể chỉ trỏ tới bundle/chunk đã biên dịch. Xem [Sentry Next.js SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/) và [hướng dẫn source map cho Next.js](https://sentry-blog.sentry.dev/setting-up-next-js-source-maps-sentry/).

## Kiểm tra sau deploy

Thay `https://erp.example.com` bằng domain của deployment:

```bash
curl -i https://erp.example.com/api/health
curl -i https://erp.example.com/api/health/ready
```

Kỳ vọng liveness trả HTTP `200` và JSON có `"status":"ok"`. Readiness trả HTTP `200` cùng `"status":"ready"` khi Supabase Auth phản hồi. Nếu cấu hình thiếu hoặc Auth không truy cập được, readiness trả HTTP `503` với trạng thái tổng quát như `unconfigured` hoặc `unavailable`; body không chứa lỗi hay secret từ upstream.

Trong Sentry, chọn đúng project và environment rồi kiểm tra Issues sau khi có event. Để xác nhận trước khi đưa traffic thật, dùng một deployment staging. Có thể tạm thêm nút client:

```tsx
'use client'

import * as Sentry from '@sentry/nextjs'

export function SentrySmokeButton() {
  return (
    <button
      onClick={() =>
        Sentry.captureException(new Error('Sentry staging smoke test'))
      }
    >
      Send staging event
    </button>
  )
}
```

Để kiểm tra server hook, tạo tạm một API route staging có `GET()` ném `new Error('Sentry staging smoke test')`. Xác nhận hai event xuất hiện trong đúng project/environment, rồi xóa nút và route thử; không tạo lỗi thử trên production.

SDK chỉ gửi event, không tự tạo người nhận hay lịch trực. Nếu cần thông báo chủ động, cấu hình issue alert/workflow trong Sentry và chọn email hoặc integration/kênh theo quy trình trực ca của nhóm. Xem [các loại alert của Sentry](https://docs.sentry.io/product/alerts/alert-types/).

### Dữ liệu trong event

SDK đặt `sendDefaultPii: false`. Bộ lọc trước khi gửi xóa request, user, extra data, breadcrumbs và nội dung exception; stack trace được giữ. Event server có tag route; request ID và error digest được thêm khi có. Vì nội dung lỗi bị che, hãy tìm event theo route, environment, request ID hoặc error digest thay vì dựa vào message chi tiết.

## Xử lý lỗi thường gặp

| Triệu chứng | Kiểm tra |
|---|---|
| Probe nhận `302` hoặc HTML trang login | Đảm bảo deployment mới nhất đã chạy và proxy/WAF của hosting không yêu cầu đăng nhập cho `/api/health` và `/api/health/ready`. |
| `/api/health` trả `404` | Kiểm tra domain/base path và phiên bản deployment; endpoint phải được build cùng Next.js app. |
| Readiness trả `503` với `unconfigured` | Kiểm tra `NEXT_PUBLIC_SUPABASE_URL` và publishable/anon key trong runtime environment. Dùng key public của đúng project; không cần service-role key cho probe này. |
| Readiness trả `503` với `unavailable` | Kiểm tra Supabase Auth/Project URL, outbound network/DNS từ hosting và timeout; endpoint chủ động dừng chờ sau 2,5 giây. |
| Không thấy event Sentry | Xác nhận DSN đúng project; client cần `NEXT_PUBLIC_SENTRY_DSN` lúc build, server cần `SENTRY_DSN` ở runtime; sau khi đổi biến public phải rebuild. Kiểm tra outbound requests/CSP và bộ lọc environment trong Sentry. |
| Event có stack trace từ chunk đã minify | Đặt `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` trong môi trường build rồi build lại cùng release/deployment. Kiểm tra project/org slug và quyền token upload. |
| Message event hiển thị đã che | Đây là bộ lọc dữ liệu cá nhân trong app; dùng stack, route, environment và tags để phân loại. |

## Tài liệu liên quan

- [Hướng dẫn chạy frontend](../web/README.md#health-check-và-theo-dõi-lỗi-production)
- [Trạng thái triển khai các phase](implementation-plan-remaining.md)
- [Next.js instrumentation](https://nextjs.org/docs/app/guides/instrumentation)
