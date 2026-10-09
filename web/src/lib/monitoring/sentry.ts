type SentryEventLike = {
  request?: unknown
  user?: unknown
  extra?: unknown
  message?: unknown
  logentry?: unknown
  breadcrumbs?: unknown
  contexts?: Record<string, unknown>
  exception?: { values?: Array<{ value?: string | null }> }
}

/**
 * Keep stack traces and route transaction names, but remove request/user data
 * and arbitrary exception text before sending production events.
 */
export function redactSentryEvent<T extends object>(event: T): T {
  const safeEvent = event as T & SentryEventLike
  delete safeEvent.request
  delete safeEvent.user
  delete safeEvent.extra
  delete safeEvent.message
  delete safeEvent.logentry
  delete safeEvent.breadcrumbs
  if (safeEvent.contexts) delete safeEvent.contexts.nextjs
  for (const exception of safeEvent.exception?.values ?? []) {
    exception.value = '[redacted]'
  }
  return event
}
