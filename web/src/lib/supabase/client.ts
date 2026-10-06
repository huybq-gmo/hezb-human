import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfig } from './config'
import { isDemoMode } from '../demo'
import { createDemoClient } from '../demo/client'

export function createClient() {
  if (isDemoMode()) return createDemoClient()
  const { url, key } = getSupabaseConfig()
  return createBrowserClient(url, key)
}
