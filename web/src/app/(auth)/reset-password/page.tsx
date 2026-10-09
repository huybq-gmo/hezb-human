'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { HezbLogo, HezbMark } from '@/components/HezbLogo'
import { Button, Field } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

const schema = z
  .object({
    password: z.string().min(8, 'Mật khẩu cần có ít nhất 8 ký tự.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận chưa khớp.',
  })

type ResetPasswordForm = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({ resolver: zodResolver(schema) })

  useEffect(() => {
    let active = true
    void createClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        setHasSession(!error && !!data.session)
        setCheckingSession(false)
      })
      .catch(() => {
        if (!active) return
        setHasSession(false)
        setCheckingSession(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function updatePassword(data: ResetPasswordForm) {
    setErrorMessage(null)
    try {
      const { error } = await createClient().auth.updateUser({
        password: data.password,
      })
      if (error) {
        setErrorMessage(
          'Không thể cập nhật mật khẩu. Liên kết có thể đã hết hạn; hãy gửi yêu cầu mới.',
        )
        return
      }
      toast.success('Đã cập nhật mật khẩu.')
      router.replace('/dashboard')
      router.refresh()
    } catch {
      setErrorMessage('Không thể kết nối. Vui lòng thử lại sau.')
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <HezbLogo textClassName="text-2xl font-bold text-white" />
        <div>
          <h1>Đặt lại mật khẩu</h1>
          <p>Tạo mật khẩu mới để tiếp tục sử dụng Hezb ERP.</p>
        </div>
        <div className="h-10" aria-hidden="true" />
        <HezbMark className="login-watermark" />
      </div>
      <div className="login-form">
        <div>
          <div className="mobile-brand">
            <HezbLogo />
          </div>
          <h2>Đặt mật khẩu mới</h2>
          {checkingSession ? (
            <p className="muted" role="status">Đang xác minh liên kết…</p>
          ) : !hasSession ? (
            <div className="stack">
              <div className="notice warning" role="status">
                Liên kết khôi phục không hợp lệ hoặc đã hết hạn. Hãy quay lại
                trang đăng nhập và gửi yêu cầu mới.
              </div>
              <Link className="btn" href="/login">Quay lại đăng nhập</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(updatePassword)}>
              <Field label="Mật khẩu mới" error={errors.password?.message}>
                <input
                  {...register('password')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ít nhất 8 ký tự"
                  aria-invalid={!!errors.password}
                />
              </Field>
              <Field
                label="Xác nhận mật khẩu mới"
                error={errors.confirmPassword?.message}
              >
                <input
                  {...register('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu mới"
                  aria-invalid={!!errors.confirmPassword}
                />
              </Field>
              {errorMessage && (
                <div className="notice error" role="alert">
                  {errorMessage}
                </div>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Đang cập nhật…' : 'Lưu mật khẩu mới'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
