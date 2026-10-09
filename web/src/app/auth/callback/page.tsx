'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createCallbackClient } from '@/lib/supabase/client'
import { completeAuthCallback } from '@/lib/supabase/auth-callback'
import { HezbLogo, HezbMark } from '@/components/HezbLogo'

export default function AuthCallbackPage() {
  const verification = useRef<ReturnType<typeof completeAuthCallback> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!verification.current) {
      const href = window.location.href
      // Remove one-use credentials from the address bar; keep them only in memory.
      window.history.replaceState(null, '', window.location.pathname)
      verification.current = Promise.resolve().then(() =>
        completeAuthCallback(createCallbackClient().auth, href),
      )
    }
    void verification.current
      .then((result) => {
        if (!active) return
        if ('error' in result) {
          const code = /^[a-z0-9_]{1,80}$/i.test(result.error.code)
            ? result.error.code
            : 'invalid_link'
          setError(`Không xác minh được liên kết (${code}). Hãy dùng email mới nhất hoặc gửi yêu cầu khôi phục mới.`)
          return
        }
        // Reload so every browser client uses the newly verified account.
        window.location.replace(result.destination)
      })
      .catch(() => {
        if (active) setError('Không kết nối được để xác minh liên kết. Vui lòng thử lại từ email.')
      })
    return () => { active = false }
  }, [])

  return (
    <div className="login">
      <div className="login-brand">
        <HezbLogo textClassName="text-2xl font-bold text-white" />
        <div><h1>Xác minh tài khoản</h1><p>Hoàn tất đăng nhập hoặc thiết lập mật khẩu cho tài khoản của bạn.</p></div>
        <div className="h-10" aria-hidden="true" />
        <HezbMark className="login-watermark" />
      </div>
      <div className="login-form">
        <div className="stack">
          <h2>Xác minh liên kết</h2>
          {error ? (
            <>
              <div className="notice error" role="alert">{error}</div>
              <Link className="btn" href="/login">Quay lại đăng nhập</Link>
            </>
          ) : <p className="muted" role="status">Đang xác minh tài khoản…</p>}
        </div>
      </div>
    </div>
  )
}
