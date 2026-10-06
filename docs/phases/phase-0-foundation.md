# Phase 0: Foundation

> **Mục tiêu phase:** Dựng môi trường phát triển, skeleton project, schema cơ bản và observability tối thiểu — không có nghiệp vụ, chỉ là nền tảng để mọi phase sau chạy được.

**Dependency:** Không có — đây là phase đầu tiên.  
**Ước lượng tổng:** 5–8 giờ.

---

## Checklist tổng quan

- [ ] 0a. Khởi tạo dự án
- [ ] 0b. Schema skeleton và convention
- [ ] 0c. Observability tối thiểu

---

## 0a. Khởi tạo dự án

**Mục tiêu:** `supabase start` chạy được, Next.js hiển thị trang chủ trắng.

### Việc làm

- [ ] Tạo Supabase project trên Cloud (Free plan), ghi lại `Project URL` và `anon key`.
- [ ] Cài Supabase CLI, chạy `supabase init` trong thư mục repo.
- [ ] Khởi tạo Next.js 15 (App Router, TypeScript, Tailwind CSS, shadcn/ui):
  ```bash
  pnpm create next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
  npx shadcn@latest init
  ```
- [ ] Tạo `.env.local` với `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` (không commit).
- [ ] Thêm `.env.local` vào `.gitignore`; commit `.env.example` với placeholder.
- [ ] Migration đầu tiên: `supabase migration new init_schema`:
  ```sql
  -- 20240101000000_init_schema.sql
  create schema if not exists internal;
  ```
- [ ] Cấu hình CI GitHub Actions:
  - Job `db-check`: `supabase db push --dry-run`
  - Job `build`: `pnpm build`
- [ ] Cài `@supabase/supabase-js`, tạo `src/lib/supabase/client.ts` và `server.ts`.

### Definition of Done

- [ ] `supabase db reset` thành công (không lỗi migration).
- [ ] `pnpm dev` — Next.js khởi động, trang `/` trả 200.
- [ ] `pnpm build` pass không lỗi.
- [ ] CI pipeline pass trên nhánh `main`.

### Bảng / RPC liên quan

_Chưa có bảng nghiệp vụ — chỉ schema `internal`._

### Dependency

Không có.

### Ước lượng: 2–3 giờ

---

## 0b. Schema skeleton và convention

**Mục tiêu:** Bảng `audit_log` tồn tại, trigger function audit dùng chung; `core_config` lưu cài đặt tổ chức.

### Convention bảng (áp dụng cho mọi bảng sau này)

```sql
id          uuid primary key default gen_random_uuid(),
created_at  timestamptz not null default now(),
created_by  uuid references auth.users,
updated_at  timestamptz not null default now(),
updated_by  uuid references auth.users,
version     integer not null default 1
```

- Tiền: `numeric(18,4)` + `currency char(3) default 'VND'`
- Ngày/giờ: `timestamptz` (UTC trong DB)
- FK xuyên nhóm: chỉ dùng UUID, không join trực tiếp

### Việc làm

- [ ] Migration `supabase migration new audit_and_config`:
  ```sql
  -- Bảng audit_log (append-only)
  create table audit_log (
    id           uuid primary key default gen_random_uuid(),
    actor_id     uuid references auth.users,
    table_name   text not null,
    record_id    uuid,
    action       text not null, -- INSERT | UPDATE | DELETE | RPC
    before_masked jsonb,
    after_masked  jsonb,
    request_id   uuid,
    occurred_at  timestamptz not null default now()
  );

  -- Chặn UPDATE và DELETE trên audit_log
  create rule audit_log_no_update as on update to audit_log do instead nothing;
  create rule audit_log_no_delete as on delete to audit_log do instead nothing;

  -- RLS
  alter table audit_log enable row level security;
  create policy "auditor_read" on audit_log for select
    using (auth.jwt() ->> 'role' in ('auditor', 'company_owner'));

  -- Trigger function dùng chung
  create or replace function fn_audit_log()
  returns trigger language plpgsql security definer set search_path = public as $$
  begin
    insert into audit_log(actor_id, table_name, record_id, action, before_masked, after_masked)
    values (auth.uid(), tg_table_name, coalesce(new.id, old.id), tg_op,
            case when tg_op != 'INSERT' then to_jsonb(old) end,
            case when tg_op != 'DELETE' then to_jsonb(new) end);
    return new;
  end;
  $$;

  -- core_config
  create table core_config (
    key   text primary key,
    value text not null
  );
  insert into core_config values
    ('org_timezone', 'Asia/Ho_Chi_Minh'),
    ('org_locale', 'vi-VN'),
    ('org_currency', 'VND'),
    ('week_start_day', '1');
  ```
- [ ] Viết pgTAP test `tests/audit_log_rls.sql`:
  - Test `developer` không SELECT được `audit_log` → expect 0 rows.
  - Test `auditor` SELECT được `audit_log` → expect rows.

### Definition of Done

- [ ] Migration chạy được trên DB mới (`supabase db reset`).
- [ ] pgTAP test pass: `developer` không SELECT được `audit_log`.
- [ ] `auditor` SELECT được `audit_log`.
- [ ] `core_config` có 4 dòng default.

### Bảng / RPC liên quan

| Tên | Loại | Mô tả |
|---|---|---|
| `audit_log` | Table | Append-only audit trail |
| `core_config` | Table | Config tổ chức (timezone, locale...) |
| `fn_audit_log()` | Trigger function | Dùng chung cho mọi bảng |

### Dependency

0a.

### Ước lượng: 2–3 giờ

---

## 0c. Observability tối thiểu

**Mục tiêu:** Mọi request Next.js có `request_id`; error log ra structured JSON, không chứa token/PII.

### Việc làm

- [ ] Tạo `src/middleware.ts`: sinh `request_id` (UUID), ghi vào header `X-Request-ID`.
- [ ] Tạo `src/lib/logger.ts`: helper log JSON `{ level, message, request_id, timestamp }` — không log token, password, PII.
- [ ] Tạo `src/lib/errors.ts`: format lỗi chuẩn `{ code: string, message: string, request_id: string }`.
- [ ] Bắt unhandled error trong `src/app/error.tsx` (Next.js error boundary), log qua `logger`.

### Definition of Done

- [ ] Gọi route bất kỳ → response có header `X-Request-ID`.
- [ ] Gọi route lỗi → log JSON có `request_id`, không chứa token.
- [ ] `pnpm build` pass.

### Bảng / RPC liên quan

_Không có bảng DB._

### Dependency

0a.

### Ước lượng: 1–2 giờ

---

## Kết quả Phase 0

Sau khi hoàn thành phase này, team có thể:
- Chạy `supabase db reset` để dựng DB từ đầu.
- Chạy `pnpm dev` để phát triển local.
- Mọi request có `request_id` truy vết được.
- Audit log sẵn sàng nhận dữ liệu từ các phase sau.
