import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/supabase/auth-callback.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { completeAuthCallback } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function client({ error = null, verifiedId = 'member' } = {}) {
  const calls = []
  const session = { user: { id: 'member', email: 'member@example.test' } }
  const response = () => ({ data: { session: error ? null : session }, error })
  const auth = {
    exchangeCodeForSession: async (code) => { calls.push(['code', code]); return response() },
    setSession: async (tokens) => { calls.push(['session', tokens]); return response() },
    verifyOtp: async (otp) => { calls.push(['otp', otp]); return response() },
    getUser: async () => { calls.push(['user']); return { data: { user: { id: verifiedId, email: 'member@example.test' } }, error: null } },
    getSession: async () => { throw new Error('An old session must never be used as a fallback') },
  }
  return { auth, calls }
}

test('Invitation fragments establish and verify the invited account before opening password form', async () => {
  const { auth, calls } = client()
  const result = await completeAuthCallback(auth, 'https://erp.example.test/auth/callback?next=/reset-password#access_token=invite-access&refresh_token=invite-refresh&type=invite')
  assert.deepEqual(result, { destination: '/reset-password', email: 'member@example.test' })
  assert.deepEqual(calls, [['session', { access_token: 'invite-access', refresh_token: 'invite-refresh' }], ['user']])
})

test('PKCE recovery codes are exchanged and verified', async () => {
  const { auth, calls } = client()
  assert.equal((await completeAuthCallback(auth, 'https://erp.example.test/auth/callback?code=recovery-code&next=/reset-password')).destination, '/reset-password')
  assert.deepEqual(calls, [['code', 'recovery-code'], ['user']])
})

test('Token hash email templates can verify recovery without a browser PKCE verifier', async () => {
  const { auth, calls } = client()
  assert.equal((await completeAuthCallback(auth, 'https://erp.example.test/auth/callback?token_hash=recovery-hash&type=recovery')).destination, '/reset-password')
  assert.deepEqual(calls, [['otp', { token_hash: 'recovery-hash', type: 'recovery' }], ['user']])
})

test('Failed code exchange never falls back to an existing owner session', async () => {
  const { auth, calls } = client({ error: { code: 'bad_code_verifier', status: 400, message: 'internal detail' } })
  assert.deepEqual(await completeAuthCallback(auth, 'https://erp.example.test/auth/callback?code=bad&next=/reset-password'), { error: { code: 'bad_code_verifier', status: 400 } })
  assert.deepEqual(calls, [['code', 'bad']])
})

test('Expired links, missing credentials and incomplete fragments cannot open password form', async () => {
  for (const suffix of ['', '?next=/reset-password', '#access_token=partial&type=invite', '?token_hash=hash&type=sms', '#error=access_denied&error_code=otp_expired&access_token=unused&refresh_token=unused']) {
    const { auth, calls } = client()
    assert.ok('error' in await completeAuthCallback(auth, `https://erp.example.test/auth/callback${suffix}`))
    assert.deepEqual(calls, [])
  }
})

test('Verified account must match the account returned from link verification', async () => {
  const { auth } = client({ verifiedId: 'owner' })
  assert.deepEqual(await completeAuthCallback(auth, 'https://erp.example.test/auth/callback?code=member-code'), { error: { code: 'callback_user_mismatch' } })
})

test('Callback destinations cannot be replaced with an external or privileged route', async () => {
  for (const next of ['https://attacker.example.test', '//attacker.example.test', '/dashboard/settings/roles']) {
    const { auth } = client()
    assert.equal((await completeAuthCallback(auth, `https://erp.example.test/auth/callback?code=valid&next=${encodeURIComponent(next)}`)).destination, '/dashboard')
  }
})
