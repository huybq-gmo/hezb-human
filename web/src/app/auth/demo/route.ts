import { NextResponse } from 'next/server'
import { DEMO_COOKIE, isDemoAvailable } from '@/lib/demo'

export async function POST(request: Request) {
  if (!isDemoAvailable) return new NextResponse(null, { status: 404 })
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get('host'))
        return new NextResponse(null, { status: 403 })
    } catch {
      return new NextResponse(null, { status: 403 })
    }
  }
  const data = await request.formData()
  const exit = data.get('action') === 'exit'
  // Relative redirects preserve localhost/127.0.0.1 and the browser's cookie scope.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: '/dashboard', 'Cache-Control': 'no-store' },
  })
  response.cookies.set(DEMO_COOKIE, exit ? '' : '1', {
    path: '/',
    sameSite: 'lax',
    secure: origin
      ? new URL(origin).protocol === 'https:'
      : new URL(request.url).protocol === 'https:',
    maxAge: exit ? 0 : 60 * 60 * 8,
  })
  return response
}
