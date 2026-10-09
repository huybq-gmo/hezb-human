import * as Sentry from '@sentry/nextjs'
import { redactSentryEvent } from './lib/monitoring/sentry'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  sendDefaultPii: false,
  beforeSend(event) {
    return redactSentryEvent(event)
  },
})
