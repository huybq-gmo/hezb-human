'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AppRole } from '@/lib/types'

export interface WorkspaceUser {
  id: string
  name: string
  email: string
  roles: AppRole[]
  memberships: { project_id: string; project_role: string }[]
}

const WorkspaceContext = createContext<WorkspaceUser>({
  id: '',
  name: '',
  email: '',
  roles: [],
  memberships: [],
})

export function WorkspaceProvider({
  user,
  children,
}: {
  user: WorkspaceUser
  children: ReactNode
}) {
  return (
    <WorkspaceContext.Provider value={user}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const user = useContext(WorkspaceContext)
  return {
    ...user,
    hasRole: (...roles: AppRole[]) =>
      user.roles.some((role) => roles.includes(role)),
    hasProjectRole: (projectId: string, ...roles: string[]) =>
      user.memberships.some(
        (m) => m.project_id === projectId && roles.includes(m.project_role),
      ),
  }
}
