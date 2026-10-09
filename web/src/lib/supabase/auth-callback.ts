import type { SupabaseClient, EmailOtpType } from '@supabase/supabase-js'

type CallbackAuth = Pick<
  SupabaseClient['auth'],
  'exchangeCodeForSession' | 'setSession' | 'verifyOtp' | 'getUser'
>

type CallbackResult =
  | { destination: '/reset-password' | '/dashboard'; email: string | null }
  | { error: { code: string; status?: number } }

const emailTypes = new Set(['invite', 'recovery', 'email', 'signup', 'magiclink'])

export async function completeAuthCallback(
  auth: CallbackAuth,
  href: string,
): Promise<CallbackResult> {
  const url = new URL(href)
  const query = url.searchParams
  const fragment = new URLSearchParams(url.hash.slice(1))
  const errorCode = fragment.get('error_code') || query.get('error_code')
  if (errorCode || fragment.has('error') || query.has('error')) {
    return { error: { code: errorCode || 'invalid_link' } }
  }

  const code = query.get('code')
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  const tokenHash = query.get('token_hash')
  const type = query.get('type') || fragment.get('type')
  const destination =
    query.get('next') === '/reset-password' || type === 'invite' || type === 'recovery'
      ? '/reset-password'
      : '/dashboard'

  // Never reuse an existing session when the incoming link has no credentials
  // or verification fails: it may belong to a different account.
  let result
  if (code) {
    result = await auth.exchangeCodeForSession(code)
  } else if (accessToken && refreshToken) {
    result = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
  } else if (tokenHash && type && emailTypes.has(type)) {
    result = await auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
  } else {
    return { error: { code: 'missing_callback_credentials' } }
  }

  if (result.error) {
    return { error: { code: result.error.code || 'invalid_link', status: result.error.status } }
  }
  if (!result.data.session) {
    return { error: { code: 'session_not_found' } }
  }

  const verified = await auth.getUser()
  if (verified.error || !verified.data.user) {
    return { error: { code: verified.error?.code || 'session_not_found', status: verified.error?.status } }
  }
  if (verified.data.user.id !== result.data.session.user.id) {
    return { error: { code: 'callback_user_mismatch' } }
  }

  return { destination, email: verified.data.user.email || null }
}
