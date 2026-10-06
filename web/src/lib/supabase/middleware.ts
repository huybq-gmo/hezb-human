import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig } from './config'
import { DEMO_COOKIE, isDemoAvailable } from '../demo'
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  if (isDemoAvailable) {
    if (request.nextUrl.pathname === '/auth/demo') return supabaseResponse
    if (request.cookies.get(DEMO_COOKIE)?.value === '1') {
      if (request.nextUrl.pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      return supabaseResponse
    }
  }
  const { url, key } = getSupabaseConfig()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }
  // Add request-id header
  const requestId = crypto.randomUUID()
  supabaseResponse.headers.set('X-Request-ID', requestId)
  return supabaseResponse
}
