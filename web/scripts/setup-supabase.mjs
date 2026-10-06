import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { getDatabaseEnv } from './supabase-db-config.mjs'

const require = createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(
  fileURLToPath(new URL('../', import.meta.url)),
  true,
)
const migrationDir = new URL('../../supabase/migrations/', import.meta.url)
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const emailIndex = args.indexOf('--owner-email')
const ownerEmail =
  emailIndex < 0 ? process.env.SUPABASE_OWNER_EMAIL : args[emailIndex + 1]
const literal = (value) => `'${value.replaceAll("'", "''")}'`

function psql(sql, env) {
  return new Promise((resolve, reject) => {
    // Credentials stay in the environment, never argv, shell strings, or logs.
    const child = spawn(
      'psql',
      ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
      { env, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let out = '',
      err = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    child.stderr.on('data', (chunk) => {
      err += chunk
    })
    child.on('error', () =>
      reject(
        new Error('Không chạy được psql. Cần PostgreSQL client trong PATH.'),
      ),
    )
    child.on('close', (code) => {
      if (code === 0) return resolve(out.trim())
      // Do not print connection strings, SQL literals, response rows, or credentials.
      const category = /password authentication failed/i.test(err)
        ? 'mật khẩu database không hợp lệ'
        : /Network is unreachable/i.test(err)
          ? 'không có đường mạng tới database. Chọn Session pooler trong Connect và thay SUPABASE_DB_URL; giữ nguyên SUPABASE_DB_PASSWORD'
          : /could not translate host|Network is unreachable|timeout expired|Connection refused/i.test(
                err,
              )
            ? 'không kết nối được database'
            : /permission denied/i.test(err)
              ? 'user database thiếu quyền'
              : 'SQL thất bại; transaction hiện tại đã được rollback'
      reject(
        new Error(
          `psql: ${category}. Kiểm tra cấu hình hoặc log trong Supabase Dashboard.`,
        ),
      )
    })
    child.stdin.on('error', () => {})
    child.stdin.end(sql)
  })
}

async function main() {
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
    throw new Error('Email quản trị không hợp lệ.')
  const filenames = (await readdir(migrationDir))
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort()
  const migrations = await Promise.all(
    filenames.map(async (file) => {
      const sql = await readFile(new URL(file, migrationDir), 'utf8')
      return {
        file,
        version: file.split('_')[0],
        checksum: createHash('sha256').update(sql).digest('hex'),
        sql,
      }
    }),
  )
  const env = getDatabaseEnv(process.env)
  const metadata = JSON.parse(
    await psql(
      `select jsonb_build_object(
    'tables', (select coalesce(jsonb_agg(tablename), '[]'::jsonb) from pg_tables where schemaname = 'public'
      and (tablename like 'core_%' or tablename like 'hr_%' or tablename like 'project_%' or tablename like 'work_%' or tablename = 'audit_log')),
    'tracking', to_regclass('internal.hezb_schema_migrations') is not null,
    'users', (select count(*) from auth.users));`,
      env,
    ),
  )
  const tracked = metadata.tracking
    ? JSON.parse(
        await psql(
          "select coalesce(jsonb_agg(jsonb_build_object('version',version,'checksum',checksum)), '[]'::jsonb) from internal.hezb_schema_migrations;",
          env,
        ),
      )
    : []
  if (!tracked.length && metadata.tables.length)
    throw new Error(
      'Đã có bảng ERP nhưng chưa có lịch sử migration của bộ bootstrap này. Dừng để đối chiếu schema; không ghi đè bảng hiện có.',
    )
  for (const migration of migrations) {
    const old = tracked.find((row) => row.version === migration.version)
    if (old && old.checksum !== migration.checksum)
      throw new Error(
        `Migration ${migration.file} đã áp dụng nhưng nội dung thay đổi. Cần migration mới theo quy tắc forward-only.`,
      )
  }
  const pending = migrations.filter(
    (m) => !tracked.some((r) => r.version === m.version),
  )
  console.log(
    `Database đúng Cloud project. Có ${metadata.tables.length} bảng ERP, ${metadata.users} tài khoản Auth; ${pending.length} migration chờ áp dụng.`,
  )
  pending.forEach((m) => console.log(`  ${m.file}`))
  let ownerId
  if (ownerEmail) {
    ownerId = await psql(
      `select id from auth.users where lower(email) = lower(${literal(ownerEmail)}) and email_confirmed_at is not null;`,
      env,
    )
    if (!ownerId)
      throw new Error(
        'Chưa có tài khoản quản trị đã xác nhận email trong Supabase Auth. Tạo user trong Authentication → Users trước; không tạo password bằng SQL.',
      )
    if (!/^[0-9a-f-]{36}$/.test(ownerId))
      throw new Error('Email quản trị cần khớp đúng một tài khoản Auth.')
    if (metadata.tables.includes('core_role_assignment')) {
      const anotherOwner = await psql(
        `select count(*) from public.core_role_assignment where role='company_owner' and revoked_at is null and user_id <> ${literal(ownerId)}::uuid;`,
        env,
      )
      if (Number(anotherOwner))
        throw new Error(
          'Đã có company_owner khác. Dùng UI quản lý role để cấp thêm owner; bootstrap chỉ dành cho owner đầu tiên.',
        )
    }
    console.log('Đã tìm thấy tài khoản Auth cho owner đầu tiên.')
  }
  if (!apply) {
    console.log(
      'Chỉ kiểm tra; chưa ghi database. Thêm --apply để triển khai và --owner-email EMAIL để cấp owner đầu tiên.',
    )
    return
  }
  if (pending.length || ownerId) {
    const statements = [
      'begin;',
      "select pg_advisory_xact_lock(hashtextextended('hezb-schema-setup',0));",
      'create schema if not exists internal;',
      'create table if not exists internal.hezb_schema_migrations (version text primary key, checksum text not null, applied_at timestamptz not null default now());',
      'revoke all on internal.hezb_schema_migrations from public, anon, authenticated;',
    ]
    for (const migration of pending) {
      statements.push(migration.sql.replace(/^\s*(begin|commit);\s*$/gim, ''))
      statements.push(
        `insert into internal.hezb_schema_migrations(version, checksum) values (${literal(migration.version)}, ${literal(migration.checksum)});`,
      )
    }
    if (ownerId) {
      // Recheck inside the transaction to prevent two concurrent bootstrap owners.
      statements.push(
        `do $$ begin if exists (select 1 from public.core_role_assignment where role='company_owner' and revoked_at is null and user_id <> ${literal(ownerId)}::uuid) then raise exception 'OWNER_ALREADY_EXISTS'; end if; end $$;`,
      )
      statements.push(
        `update public.core_user_profile set is_active = true where id = ${literal(ownerId)}::uuid;`,
      )
      statements.push(
        `insert into public.core_role_assignment(user_id,role,granted_by) values (${literal(ownerId)}::uuid,'company_owner',${literal(ownerId)}::uuid) on conflict (user_id,role) do update set revoked_at=null,expires_at=null,granted_by=excluded.granted_by;`,
      )
    }
    statements.push("notify pgrst, 'reload schema';", 'commit;')
    await psql(statements.join('\n'), env)
    console.log(
      `Đã áp dụng ${pending.length} migration${ownerId ? ' và cấp company_owner đầu tiên' : ''}.`,
    )
  } else console.log('Database đã có đầy đủ các migration hiện tại.')
  if (!ownerId)
    console.log(
      'Chưa bootstrap tài khoản quản trị trong lần chạy này. Dùng --apply --owner-email EMAIL sau khi tạo user Auth.',
    )
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
