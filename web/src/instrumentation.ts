import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  Sentry.withScope((scope) => {
    const requestId = request.headers['x-request-id']
    if (typeof requestId === 'string') {
      scope.setTag('request_id', requestId)
    } else if (Array.isArray(requestId) && requestId[0]) {
      scope.setTag('request_id', requestId[0])
    }
    scope.setTag('route', context.routePath)
    scope.setTag('route_type', context.routeType)
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      typeof error.digest === 'string'
    ) {
      scope.setTag('error_digest', error.digest)
    }
    Sentry.captureRequestError(error, request, context)
  })
}
