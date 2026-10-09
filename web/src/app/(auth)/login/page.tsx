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
  email: z.email('Email công ty không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
})
type LoginForm = z.infer<typeof schema>

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
        setErrorMessage('Không thể gửi liên kết đăng nhập. Vui lòng thử lại.')
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
        setErrorMessage('Không thể gửi email khôi phục. Vui lòng thử lại sau.')
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
