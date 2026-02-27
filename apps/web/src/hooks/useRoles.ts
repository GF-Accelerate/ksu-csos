/**
 * useRoles Hook
 *
 * React hook for role management operations.
 */

import { useState, useCallback } from 'react'
import { callEdgeFunction } from '@lib/supabase'
import type { AppRole, RoleAssignRequest, RoleListResponse } from '@/types'

export function useRoles() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Assign role to user
   */
  const assignRole = useCallback(async (userId: string, role: AppRole) => {
    setLoading(true)
    setError(null)

    try {
      const request: RoleAssignRequest = { user_id: userId, role }

      await callEdgeFunction('role_assign', {
        action: 'assign',
        ...request,
      })

      setLoading(false)
      return { success: true }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to assign role'
      setError(errorMessage)
      setLoading(false)
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * Remove role from user
   */
  const removeRole = useCallback(async (userId: string, role: AppRole) => {
    setLoading(true)
    setError(null)

    try {
      const request: RoleAssignRequest = { user_id: userId, role }

      await callEdgeFunction('role_assign', {
        action: 'remove',
        ...request,
      })

      setLoading(false)
      return { success: true }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to remove role'
      setError(errorMessage)
      setLoading(false)
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * List roles for a user
   */
  const listUserRoles = useCallback(async (userId: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await callEdgeFunction<RoleListResponse>('role_list', {
        user_id: userId,
      })

      setLoading(false)
      return response.roles
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to list roles'
      setError(errorMessage)
      setLoading(false)
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * List all user role assignments
   */
  const listAllRoles = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await callEdgeFunction<{ roles: any[] }>('role_list', {
        all: true,
      })

      setLoading(false)
      return response.roles
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to list all roles'
      setError(errorMessage)
      setLoading(false)
      throw new Error(errorMessage)
    }
  }, [])

  return {
    loading,
    error,
    assignRole,
    removeRole,
    listUserRoles,
    listAllRoles,
  }
}
