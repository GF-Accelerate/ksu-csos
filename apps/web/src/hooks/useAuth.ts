/**
 * useAuth Hook
 *
 * React hook for authentication state and operations.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase, getCurrentUserWithRoles } from '@lib/supabase'
import type { AuthUser, LoginCredentials, AuthState } from '@/types'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  /**
   * Load user on mount and auth state changes
   */
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      loadUser(session)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        loadUser(session)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  /**
   * Load user with roles
   */
  const loadUser = async (session: Session | null) => {
    if (!session) {
      setState({ user: null, loading: false, error: null })
      return
    }

    try {
      const user = await getCurrentUserWithRoles()
      setState({ user, loading: false, error: null })
    } catch (error: any) {
      console.error('Error loading user:', error)
      setState({
        user: null,
        loading: false,
        error: error.message || 'Failed to load user',
      })
    }
  }

  /**
   * Sign in with email and password
   */
  const signIn = useCallback(async (credentials: LoginCredentials) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) throw error

      const user = await getCurrentUserWithRoles()
      setState({ user, loading: false, error: null })

      return { user, session: data.session }
    } catch (error: any) {
      const errorMessage = error.message || 'Sign in failed'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * Sign out
   */
  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error

      setState({ user: null, loading: false, error: null })
    } catch (error: any) {
      const errorMessage = error.message || 'Sign out failed'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * Check if user has a specific role
   */
  const hasRole = useCallback(
    (role: string): boolean => {
      if (!state.user) return false
      // Admin has all permissions
      if (state.user.roles.includes('admin')) return true
      return state.user.roles.includes(role)
    },
    [state.user]
  )

  /**
   * Check if user has any of the specified roles
   */
  const hasAnyRole = useCallback(
    (roles: string[]): boolean => {
      if (!state.user) return false
      // Admin has all permissions
      if (state.user.roles.includes('admin')) return true
      return roles.some((role) => state.user!.roles.includes(role))
    },
    [state.user]
  )

  /**
   * Refresh user data (after role changes, etc.)
   */
  const refreshUser = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))

    try {
      const user = await getCurrentUserWithRoles()
      setState({ user, loading: false, error: null })
    } catch (error: any) {
      console.error('Error refreshing user:', error)
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to refresh user',
      }))
    }
  }, [])

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    signIn,
    signOut,
    hasRole,
    hasAnyRole,
    refreshUser,
  }
}
