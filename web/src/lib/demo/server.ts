import 'server-only'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, isDemoAvailable } from '../demo'

export async function isDemoRequest() {
  return isDemoAvailable && (await cookies()).get(DEMO_COOKIE)?.value === '1'
}
