'use client'

import { useEffect } from 'react'
import { logClientError } from '@/lib/logger'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => logClientError(error), [error])

  return (
    <html lang="vi">
      <body>
        <main style={{ margin: '4rem auto', maxWidth: 560, padding: '0 1.5rem' }}>
          <h1>Đã xảy ra lỗi</h1>
          <p>Không thể tải ứng dụng. Vui lòng thử lại.</p>
          {error.digest && <small>Mã lỗi: {error.digest}</small>}
          <div><button onClick={reset}>Thử lại</button></div>
        </main>
      </body>
    </html>
  )
}
