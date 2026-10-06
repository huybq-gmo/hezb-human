import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

if (process.env.NODE_ENV === 'production') {
  throw new Error('Chế độ xem thử chỉ chạy bằng development server.')
}
const require = createRequire(import.meta.url)
console.log(
  'Mở /login và chọn “Xem dữ liệu mẫu”. Dữ liệu đã có sẵn trong mã web.',
)
const next = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'dev',
    '--webpack',
    '--hostname',
    '127.0.0.1',
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_PUBLIC_HEZB_DEMO: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://hezb-preview.invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-preview-key',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-preview-key',
    },
  },
)
process.on('SIGINT', () => next.kill('SIGINT'))
process.on('SIGTERM', () => next.kill('SIGTERM'))
next.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
next.on('exit', (code) => {
  process.exitCode = code ?? 0
})
