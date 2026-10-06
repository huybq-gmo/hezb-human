import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DEMO_COOKIE } from '@/lib/demo'
import { isDemoRequest } from '@/lib/demo/server'

export async function GET(request: Request) {
  if (await isDemoRequest()) {
    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: '/login' },
    })
    response.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 })
    return response
  }
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = new URL('/login', request.url)
  return NextResponse.redirect(url)
}
