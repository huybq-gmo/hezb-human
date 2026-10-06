export type AppRole =
  | 'company_owner'
  | 'hr_admin'
  | 'finance_admin'
  | 'director'
  | 'project_manager'
  | 'team_leader'
  | 'developer'
  | 'qa_reviewer'
  | 'auditor'

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  company_owner: 'Company Owner',
  hr_admin: 'HR Admin',
  finance_admin: 'Finance Admin',
  director: 'Director',
  project_manager: 'Project Manager',
  team_leader: 'Team Leader',
  developer: 'Developer',
  qa_reviewer: 'QA Reviewer',
  auditor: 'Auditor',
}

export interface UserProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoleAssignment {
  id: string
  user_id: string
  role: AppRole
  granted_by: string | null
  granted_at: string
  expires_at: string | null
  revoked_at: string | null
}
