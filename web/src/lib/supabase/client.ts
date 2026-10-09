import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfig } from './config'

export function createClient() {
  const { url, key } = getSupabaseConfig()
  return createBrowserClient(url, key)
}

export function createCallbackClient() {
  const { url, key } = getSupabaseConfig()
  // The callback explicitly handles both PKCE codes and invitation fragments.
  // Prevent the PKCE client from consuming an implicit invitation on startup.
  return createBrowserClient(url, key, {
    isSingleton: false,
    auth: { detectSessionInUrl: false },
  })
}
