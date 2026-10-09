'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { HezbLogo, HezbMark } from '@/components/HezbLogo'
import { Button, Field } from '@/components/ui'

const schema = z.object({
  email: z.string().trim().pipe(z.email('Email công ty không hợp lệ')),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})
type LoginForm = z.infer<typeof schema>

function getRecoveryErrorMessage(error: {
  code?: string
  message?: string
  status?: number
}) {
  const code = error.code?.toLowerCase() || ''
  const message = error.message?.toLowerCase() || ''

  if (
    error.status === 429 ||
    code.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return code === 'over_email_send_rate_limit'
      ? 'Dự án đã đạt giới hạn gửi email của Supabase. Cần chờ giới hạn được khôi phục hoặc cấu hình SMTP riêng.'
      : 'Supabase đang giới hạn số yêu cầu khôi phục. Vui lòng chờ trước khi gửi lại.'
  }

  if (
    code === 'email_address_not_authorized' ||
    message.includes('email address not authorized')
  ) {
    return 'Supabase SMTP mặc định chưa cho phép gửi tới email này. Hãy cấu hình SMTP riêng trong Authentication → Emails → SMTP Settings.'
  }

  if (
    code === 'redirect_to_not_allowed' ||
    message.includes('redirect url') ||
    message.includes('redirect_to')
  ) {
    return 'URL khôi phục chưa được cho phép. Thêm URL hiện tại với đường dẫn /auth/callback vào Authentication → URL Configuration → Redirect URLs.'
  }

  if (code === 'captcha_failed') {
    return 'Supabase yêu cầu xác minh CAPTCHA nhưng chưa nhận được xác minh hợp lệ. Vui lòng liên hệ quản trị viên.'
  }

  if (/error sending (recovery )?email|smtp|mailer/.test(message)) {
    return 'Supabase báo lỗi gửi email. Kiểm tra Auth Logs và cấu hình email của dự án.'
  }

  return 'Supabase từ chối yêu cầu gửi email khôi phục. Kiểm tra Authentication → Logs để xem mã lỗi cụ thể.'
}

function getAuthErrorReference(error: { code?: string; status?: number }) {
  const code = error.code && /^[a-z0-9_]{1,80}$/i.test(error.code)
    ? error.code
    : 'auth_error'
  return `Mã lỗi: ${code}${error.status ? ` · HTTP ${error.status}` : ''}`
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  async function login(data: LoginForm) {
    setLoading(true)
    setErrorMessage(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword(data)
      if (error) {
        setErrorMessage(
          error.message === 'Invalid login credentials'
            ? 'Email hoặc mật khẩu không chính xác.'
            : 'Không thể đăng nhập. Vui lòng kiểm tra tài khoản và thử lại.',
        )
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setErrorMessage('Không thể kết nối. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }
  async function magicLink() {
    const email = getValues('email').trim()
    if (!z.email().safeParse(email).success) {
      toast.error('Vui lòng nhập email công ty hợp lệ')
      return
    }
    setMagicLoading(true)
    setErrorMessage(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setErrorMessage(`Không gửi được liên kết đăng nhập. ${getAuthErrorReference(error)}`)
        return
      }
      toast.success('Đã gửi magic link tới email của bạn')
    } catch {
      setErrorMessage('Không thể kết nối. Vui lòng thử lại sau.')
    } finally {
      setMagicLoading(false)
    }
  }
  async function resetPassword() {
    const email = getValues('email').trim()
    if (!z.email().safeParse(email).success) {
      setErrorMessage('Vui lòng nhập email công ty hợp lệ trước.')
      return
    }
    setResetLoading(true)
    setErrorMessage(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })
      if (error) {
        console.error('Password recovery request failed', {
          code: error.code,
          status: error.status,
          message: error.message,
        })
        setErrorMessage(`${getRecoveryErrorMessage(error)} ${getAuthErrorReference(error)}`)
        return
      }
      toast.success(
        'Nếu email này thuộc tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi đến hộp thư.',
      )
    } catch {
      setErrorMessage('Không thể kết nối. Vui lòng thử lại sau.')
    } finally {
      setResetLoading(false)
    }
  }
  return (
    <div className="login">
      <div className="login-brand">
        <HezbLogo textClassName="text-2xl font-bold text-white" />
        <div>
          <h1>Từ giờ làm việc đến bảng lương, một luồng duy nhất.</h1>
          <p>
            Nhân sự, dự án, chấm công và thanh toán của công ty — có phân quyền
            và nhật ký kiểm toán cho mọi bước duyệt.
          </p>
        </div>
        <div className="h-10" aria-hidden="true" />
        <HezbMark className="login-watermark" />
      </div>
      <div className="login-form">
        <div>
          <div className="mobile-brand">
            <HezbLogo />
          </div>
          <h2>Đăng nhập</h2>
          <form onSubmit={handleSubmit(login)}>
            <Field label="Email công ty" error={errors.email?.message}>
              <input
                {...register('email')}
                type="email"
                autoComplete="username"
                placeholder="ban@hezb.vn"
                aria-invalid={!!errors.email}
              />
            </Field>
            <Field label="Mật khẩu" error={errors.password?.message}>
              <input
                {...register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                aria-invalid={!!errors.password}
              />
            </Field>
            {errorMessage && (
              <div className="notice error" role="alert">
                {errorMessage}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading || magicLoading || resetLoading}
            >
              {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
            <button
              type="button"
              className="text-link text-right py-1 login-forgot-password"
              disabled={
                loading ||
                magicLoading ||
                resetLoading
              }
              onClick={() => void resetPassword()}
            >
              {resetLoading ? 'Đang gửi hướng dẫn…' : 'Quên mật khẩu?'}
            </button>
            <button
              type="button"
              className="text-link text-center py-1"
              disabled={
                loading ||
                magicLoading ||
                resetLoading
              }
              onClick={() => void magicLink()}
            >
              {magicLoading ? 'Đang gửi…' : 'Gửi magic link qua email'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
