import test from 'node:test'
import assert from 'node:assert/strict'
import { getDatabaseEnv } from './supabase-db-config.mjs'

const directUrl =
  'postgresql://postgres:[YOUR-PASSWORD]@db.testref.supabase.co:5432/postgres'
const base = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://testref.supabase.co',
  SUPABASE_DB_URL: directUrl,
}

test('Direct connection preserves special characters in the separate password', () => {
  const password = 'fixture@#%:$ /\\"\'end'
  const env = getDatabaseEnv({ ...base, SUPABASE_DB_PASSWORD: password })
  assert.equal(env.PGHOST, 'db.testref.supabase.co')
  assert.equal(env.PGUSER, 'postgres')
  assert.equal(env.PGPASSWORD, password)
  assert.equal(env.PGSSLMODE, 'require')
})

test('Session pooler supports the same separate password', () => {
  const env = getDatabaseEnv({
    ...base,
    SUPABASE_DB_URL:
      'postgresql://postgres.testref:[YOUR-PASSWORD]@aws-0-test.pooler.supabase.com:5432/postgres',
    SUPABASE_DB_PASSWORD: 'fixture@#password',
  })
  assert.equal(env.PGUSER, 'postgres.testref')
  assert.equal(env.PGPASSWORD, 'fixture@#password')
})

test('Separate password takes precedence over the inline password', () => {
  const env = getDatabaseEnv({
    ...base,
    SUPABASE_DB_URL: directUrl.replace('[YOUR-PASSWORD]', 'old_fixture'),
    SUPABASE_DB_PASSWORD: 'new_fixture',
  })
  assert.equal(env.PGPASSWORD, 'new_fixture')
})

test('Existing percent-encoded inline passwords remain supported', () => {
  const password = 'fixture@#%password'
  const env = getDatabaseEnv({
    ...base,
    SUPABASE_DB_URL: directUrl.replace(
      '[YOUR-PASSWORD]',
      encodeURIComponent(password),
    ),
  })
  assert.equal(env.PGPASSWORD, password)
})

test('Missing password and placeholders stop before any connection', () => {
  for (const url of [directUrl, directUrl.replace(':[YOUR-PASSWORD]', '')]) {
    assert.throws(
      () =>
        getDatabaseEnv({
          ...base,
          SUPABASE_DB_URL: url,
          SUPABASE_DB_PASSWORD: '',
        }),
      /Điền SUPABASE_DB_PASSWORD/,
    )
  }
})

test('A password does not allow connecting to a different project', () => {
  assert.throws(
    () =>
      getDatabaseEnv({
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: 'https://otherref.supabase.co',
        SUPABASE_DB_PASSWORD: 'fixture_password',
      }),
    /cùng Supabase Cloud project/,
  )
})

test('Transaction pooler is rejected', () => {
  assert.throws(
    () =>
      getDatabaseEnv({
        ...base,
        SUPABASE_DB_URL:
          'postgresql://postgres.testref:[YOUR-PASSWORD]@aws-0-test.pooler.supabase.com:6543/postgres',
        SUPABASE_DB_PASSWORD: 'fixture_password',
      }),
    /Session pooler/,
  )
})

test('Inherited libpq service settings cannot override the configured target', () => {
  const env = getDatabaseEnv({
    ...base,
    SUPABASE_DB_PASSWORD: 'fixture_password',
    PGSERVICE: 'unrelated_service',
    PGSERVICEFILE: '/fixture',
    PGHOSTADDR: '192.0.2.1',
  })
  assert(!('PGSERVICE' in env))
  assert(!('PGSERVICEFILE' in env))
  assert(!('PGHOSTADDR' in env))
})

test('Cloud connection always requires SSL', () => {
  assert.throws(
    () =>
      getDatabaseEnv({
        ...base,
        SUPABASE_DB_URL: `${directUrl}?sslmode=disable`,
        SUPABASE_DB_PASSWORD: 'fixture_password',
      }),
    /cần SSL/,
  )
})
