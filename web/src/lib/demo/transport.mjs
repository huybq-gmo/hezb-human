import { createDemoData, DEMO_EMAIL, DEMO_PASSWORD, OWNER_ID } from './data.mjs'
import { demoUtilization } from './reporting.mjs'

export const DEMO_URL = 'https://hezb-preview.invalid'
export const DEMO_KEY = 'local-preview-key'
export const DEMO_STORAGE_KEY = 'hezb-preview-session'

export function createDemoSession() {
  const seconds = Math.floor(Date.now() / 1000)
  const user = {
    id: OWNER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: DEMO_EMAIL,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'email', roles: ['company_owner'] },
    user_metadata: {},
  }
  const encode = (value) =>
    btoa(JSON.stringify(value))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
  // This synthetic token only works with the in-memory preview transport.
  const access_token = [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      sub: OWNER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: DEMO_EMAIL,
      app_metadata: user.app_metadata,
      exp: seconds + 3600,
      iat: seconds,
    }),
    'local-preview-signature',
  ].join('.')
  return {
    access_token,
    refresh_token: 'local-preview-refresh',
    expires_in: 3600,
    expires_at: seconds + 3600,
    token_type: 'bearer',
    user,
  }
}

function validToken(token) {
  try {
    const parts = token.split('.')
    const claims = JSON.parse(
      atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')),
    )
    return (
      parts.length === 3 &&
      parts[2] === 'local-preview-signature' &&
      claims.sub === OWNER_ID &&
      claims.exp > Date.now() / 1000
    )
  } catch {
    return false
  }
}

function matches(row, column, expression) {
  const [operator, ...parts] = expression.split('.')
  const expected = parts.join('.')
  const value = row[column]
  if (operator === 'eq') return String(value) === expected
  if (operator === 'neq') return String(value) !== expected
  if (operator === 'gte') return value >= expected
  if (operator === 'gt') return value > expected
  if (operator === 'lte') return value <= expected
  if (operator === 'lt') return value < expected
  if (operator === 'is')
    return expected === 'null' ? value == null : String(value) === expected
  if (operator === 'in')
    return expected.slice(1, -1).split(',').includes(String(value))
  if (operator === 'not') return !matches(row, column, expected)
  if (operator === 'ilike')
    return String(value ?? '')
      .toLocaleLowerCase('vi')
      .includes(
        expected
          .replace(/^%|%$/g, '')
          .replace(/\\([\\%_])/g, '$1')
          .toLocaleLowerCase('vi'),
      )
  return false
}

export function createDemoFetch(rows = createDemoData()) {
  const reply = (status, data, headers = {}) =>
    new Response(data === undefined ? null : JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...headers,
      },
    })
  /** @type {typeof fetch} */
  const demoFetch = async (input, init) => {
    try {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.origin !== DEMO_URL)
        return reply(403, {
          message: 'Preview chỉ đọc dữ liệu có sẵn trong web.',
        })
      if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
        const data = await request.json()
        const allowed =
          url.searchParams.get('grant_type') === 'refresh_token'
            ? data.refresh_token === 'local-preview-refresh'
            : data.email === DEMO_EMAIL && data.password === DEMO_PASSWORD
        return allowed
          ? reply(200, createDemoSession())
          : reply(400, { message: 'Phiên mẫu không hợp lệ.' })
      }
      const token = request.headers
        .get('authorization')
        ?.replace(/^Bearer /i, '')
      if (!validToken(token))
        return reply(401, {
          message: 'Phiên mẫu không hợp lệ.',
          code: 'DEMO_AUTH',
        })
      if (url.pathname === '/auth/v1/user' && request.method === 'GET')
        return reply(200, createDemoSession().user)
      if (url.pathname === '/auth/v1/logout' && request.method === 'POST')
        return reply(204)
      if (
        url.pathname === '/rest/v1/rpc/get_my_roles' &&
        request.method === 'POST'
      )
        return reply(200, [{ role: 'company_owner' }])
      if (url.pathname === '/rest/v1/rpc/get_dashboard_utilization' && request.method === 'POST') {
        try { return reply(200,demoUtilization(rows,await request.json())) }
        catch { return reply(400,{ code: 'INVALID_REPORT_RANGE',message: 'Khoảng báo cáo không hợp lệ.' }) }
      }
      if (
        url.pathname.startsWith('/storage/v1/object/list/') &&
        request.method === 'POST'
      )
        return reply(200, [])
      if (!['GET', 'HEAD'].includes(request.method))
        return reply(403, {
          message:
            'Dữ liệu mẫu chỉ để xem. Chuyển về dữ liệu thật để lưu thay đổi.',
          code: 'DEMO_READ_ONLY',
        })
      const table = url.pathname.replace(/^\/rest\/v1\//, '')
      if (!url.pathname.startsWith('/rest/v1/') || !Object.hasOwn(rows, table))
        return reply(404, { message: 'Không có dữ liệu mẫu này.' })
      let result = [...rows[table]]
      for (const [column, expression] of url.searchParams) {
        if (['select', 'order', 'limit', 'offset'].includes(column)) continue
        if (column === 'or')
          result = result.filter((row) =>
            expression
              .slice(1, -1)
              .split(',')
              .some((clause) => {
                const dot = clause.indexOf('.')
                return matches(row, clause.slice(0, dot), clause.slice(dot + 1))
              }),
          )
        else result = result.filter((row) => matches(row, column, expression))
      }
      const orders = url.searchParams.get('order')?.split(',') ?? []
      if (orders.length)
        result.sort((a, b) => {
          for (const order of orders) {
            const [column, direction] = order.split('.')
            const compared = String(a[column] ?? '').localeCompare(
              String(b[column] ?? ''),
              'vi',
              { numeric: true },
            )
            if (compared) return direction === 'desc' ? -compared : compared
          }
          return 0
        })
      const count = result.length
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
      const limit = Math.max(0, Number(url.searchParams.get('limit') ?? 1000))
      result = result.slice(offset, offset + limit)
      const headers = {
        'content-range': result.length
          ? `${offset}-${offset + result.length - 1}/${count}`
          : `*/${count}`,
      }
      const single = request.headers
        .get('accept')
        ?.includes('application/vnd.pgrst.object+json')
      if (single && result.length !== 1)
        return reply(
          406,
          {
            code: 'PGRST116',
            message: 'Không có đúng một bản ghi.',
            details: `The result contains ${result.length} rows`,
          },
          headers,
        )
      return reply(
        200,
        request.method === 'HEAD' ? undefined : single ? result[0] : result,
        headers,
      )
    } catch {
      return reply(400, { message: 'Yêu cầu dữ liệu mẫu không hợp lệ.' })
    }
  }
  return demoFetch
}
