type ErrorWithDigest = Error & { digest?: string }

/** Log only non-sensitive error metadata; error messages may contain user data. */
export function logClientError(error: ErrorWithDigest) {
  const requestId =
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLMetaElement>('meta[name="request-id"]')
          ?.content || null
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unhandled_application_error',
      request_id: requestId,
      error_name: error.name || 'Error',
      error_digest: error.digest || null,
      timestamp: new Date().toISOString(),
    }),
  )
}
