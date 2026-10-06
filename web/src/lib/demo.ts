export const DEMO_COOKIE = 'hezb-preview'
export const isDemoAvailable = process.env.NODE_ENV === 'development'

export function isDemoMode() {
  return (
    isDemoAvailable &&
    (process.env.NEXT_PUBLIC_HEZB_DEMO === '1' ||
      (typeof document !== 'undefined' &&
        document.cookie
          .split(';')
          .some((cookie) => cookie.trim() === `${DEMO_COOKIE}=1`)))
  )
}
