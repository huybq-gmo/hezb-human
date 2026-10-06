export function getDatabaseEnv(sourceEnv) {
  let db, project
  try {
    db = new URL(sourceEnv.SUPABASE_DB_URL)
    project = new URL(sourceEnv.NEXT_PUBLIC_SUPABASE_URL)
  } catch {
    throw new Error(
      'Cần SUPABASE_DB_URL từ Connect và NEXT_PUBLIC_SUPABASE_URL trong web/.env.local.',
    )
  }
  const ref = project.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
  const username = decodeURIComponent(db.username)
  const direct =
    db.hostname === `db.${ref}.supabase.co` && username === 'postgres'
  const pooler =
    db.hostname.endsWith('.pooler.supabase.com') &&
    username === `postgres.${ref}`
  if (
    !ref ||
    !['postgres:', 'postgresql:'].includes(db.protocol) ||
    !(direct || pooler)
  ) {
    throw new Error(
      'Database URL phải thuộc cùng Supabase Cloud project với NEXT_PUBLIC_SUPABASE_URL; dùng user postgres từ Connect.',
    )
  }
  if (pooler && db.port && db.port !== '5432')
    throw new Error(
      'Dùng Session pooler cổng 5432, không dùng Transaction pooler cổng 6543 cho migration.',
    )
  // Pass the separate password directly to libpq. Do not interpolate it into
  // the URI: characters such as @, #, %, and / must remain literal.
  const password =
    sourceEnv.SUPABASE_DB_PASSWORD || decodeURIComponent(db.password)
  if (!password || password === '[YOUR-PASSWORD]')
    throw new Error('Điền SUPABASE_DB_PASSWORD trong web/.env.local.')
  const ssl = db.searchParams.get('sslmode') || 'require'
  if (!['require', 'verify-ca', 'verify-full'].includes(ssl))
    throw new Error('Database Cloud cần SSL: sslmode=require hoặc verify-full.')
  const env = { ...sourceEnv }
  delete env.PGSERVICE
  delete env.PGSERVICEFILE
  delete env.PGHOSTADDR
  return {
    ...env,
    PGHOST: db.hostname,
    PGPORT: db.port || '5432',
    PGUSER: username,
    PGDATABASE: decodeURIComponent(db.pathname.slice(1)) || 'postgres',
    PGPASSWORD: password,
    PGSSLMODE: ssl,
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'hezb-schema-setup',
  }
}
