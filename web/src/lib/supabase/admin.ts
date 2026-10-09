import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './config'

export function createAdminClient() {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY')
  }

  const { url } = getSupabaseConfig()
  return createSupabaseClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
