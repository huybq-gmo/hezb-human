import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const isPasswordReset = url.searchParams.get('next') === '/reset-password'
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const destination = isPasswordReset ? '/reset-password' : '/dashboard'
      return NextResponse.redirect(new URL(destination, url.origin))
    }
  }
  const destination = isPasswordReset ? '/reset-password' : '/login'
  return NextResponse.redirect(new URL(destination, url.origin))
}
