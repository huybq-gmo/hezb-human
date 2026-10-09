import * as Sentry from '@sentry/nextjs'
import { redactSentryEvent } from './lib/monitoring/sentry'

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    stackFrameVariables: false,
    databaseQueryData: false,
  },
  beforeSend(event) {
    return redactSentryEvent(event)
  },
})
