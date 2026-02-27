/**
 * Supabase Client Configuration
 *
 * Initializes and exports the Supabase client for use throughout the app.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file.\n' +
    'Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY'
  )
}

/**
 * Supabase client instance
 * Uses anon key and respects RLS policies
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Edge Function base URL
 */
export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`

/**
 * Helper to call Edge Functions with authentication
 */
export async function callEdgeFunction<T = any>(
  functionName: string,
  payload?: any,
  options?: RequestInit
): Promise<T> {
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
    body: payload ? JSON.stringify(payload) : undefined,
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || error.message || 'Edge function call failed')
  }

  const result = await response.json()

  // Unwrap the successResponse wrapper if present
  if (result.success && result.data !== undefined) {
    return result.data as T
  }

  return result as T
}

/**
 * Helper to get current user with roles
 */
export async function getCurrentUserWithRoles() {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  // Fetch user roles
  const { data: roles } = await supabase
    .from('user_role_assignment')
    .select('role')
    .eq('user_id', user.id)

  return {
    id: user.id,
    email: user.email!,
    roles: roles?.map(r => r.role) || [],
    metadata: user.user_metadata,
  }
}

/**
 * Check if user has a specific role
 */
export async function hasRole(role: string): Promise<boolean> {
  const user = await getCurrentUserWithRoles()
  if (!user) return false

  // Admin has all permissions
  if (user.roles.includes('admin')) return true

  return user.roles.includes(role)
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(roles: string[]): Promise<boolean> {
  const user = await getCurrentUserWithRoles()
  if (!user) return false

  // Admin has all permissions
  if (user.roles.includes('admin')) return true

  return roles.some(role => user.roles.includes(role))
}
