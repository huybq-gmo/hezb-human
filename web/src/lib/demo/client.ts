import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isDemoAvailable } from '../demo'
import {
  createDemoFetch,
  createDemoSession,
  DEMO_URL,
  DEMO_KEY,
  DEMO_STORAGE_KEY,
} from './transport.mjs'

let browserClient: SupabaseClient | undefined

export function createDemoClient() {
  if (!isDemoAvailable) throw new Error('Dữ liệu mẫu chỉ có trong development.')
  if (typeof window !== 'undefined' && browserClient) return browserClient
  const storage = new Map([
    [DEMO_STORAGE_KEY, JSON.stringify(createDemoSession())],
  ])
  const client = createClient(DEMO_URL, DEMO_KEY, {
    global: { fetch: createDemoFetch() },
    auth: {
      storageKey: DEMO_STORAGE_KEY,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value)
        },
        removeItem: (key) => {
          storage.delete(key)
        },
      },
    },
  })
  if (typeof window !== 'undefined') browserClient = client
  return client
}
