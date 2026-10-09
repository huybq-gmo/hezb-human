import { NextResponse } from 'next/server'
import { getSupabaseConfig } from '@/lib/supabase/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const responseHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  let url: string
  let key: string
  try {
    const config = getSupabaseConfig()
    url = config.url
    key = config.key
  } catch {
    return NextResponse.json(
      {
        status: 'not_ready',
        dependencies: { supabaseAuth: 'unconfigured' },
      },
      { status: 503, headers: responseHeaders },
    )
  }

  try {
    const healthUrl = new URL('/auth/v1/health', url)
    const result = await fetch(healthUrl, {
      method: 'GET',
      headers: { apikey: key },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    await result.arrayBuffer()
    if (!result.ok) {
      return NextResponse.json(
        {
          status: 'not_ready',
          dependencies: { supabaseAuth: 'unavailable' },
        },
        { status: 503, headers: responseHeaders },
      )
    }
  } catch {
    return NextResponse.json(
      {
        status: 'not_ready',
        dependencies: { supabaseAuth: 'unavailable' },
      },
      { status: 503, headers: responseHeaders },
    )
  }

  return NextResponse.json(
    {
      status: 'ready',
      dependencies: { supabaseAuth: 'ok' },
    },
    { headers: responseHeaders },
  )
}
