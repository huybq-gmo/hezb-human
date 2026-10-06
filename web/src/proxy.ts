import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID()
  request.headers.set('x-request-id', requestId)
  const response = await updateSession(request)
  response.headers.set('X-Request-ID', requestId)
  return response
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
