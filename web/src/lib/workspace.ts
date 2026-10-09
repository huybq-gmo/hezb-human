import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { APP_ROLE_LABELS, type AppRole } from '@/lib/types'
import { localDate } from '@/lib/presentation'

export const getWorkspaceUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const today = localDate()
  const [profile, assignments, memberships, token, liveRoles] =
    await Promise.all([
      supabase
        .from('core_user_profile')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('core_role_assignment')
        .select('role')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .limit(100),
      supabase
        .from('project_membership')
        .select('project_id, project_role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .limit(100),
      supabase.auth.getClaims(),
      supabase.rpc('get_my_roles'),
    ])
  // Non-admin users cannot read role assignments under the Phase 1 RLS policy.
  // Read the verified custom claims supplied by the Auth hook in that case.
  const claims = token.data?.claims.sub === user.id ? token.data.claims : null
  const claimRoles = [
    ...(Array.isArray(claims?.roles) ? claims.roles : []),
    claims?.role,
    ...(Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : []),
    user.app_metadata?.role,
  ].filter(
    (role: unknown): role is AppRole =>
      typeof role === 'string' && role in APP_ROLE_LABELS,
  )
  // An empty live result is authoritative: revoked roles must not reappear
  // through stale JWT claims. Keep the fallback for older Phase 1 databases.
  const roles: AppRole[] = !liveRoles.error
    ? (liveRoles.data ?? []).map((a: { role: AppRole }) => a.role)
    : assignments.data?.length
      ? assignments.data.map((a) => a.role as AppRole)
      : liveRoles.error.code === 'PGRST202'
        ? [...new Set(claimRoles)]
        : []
  return {
    id: user.id,
    name: profile.data?.full_name || user.email?.split('@')[0] || 'Thành viên',
    email: user.email || '',
    roles,
    memberships: memberships.data ?? [],
  }
})
