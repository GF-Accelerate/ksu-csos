/**
 * Supabase Client Factory for KSU CSOS Edge Functions
 * Creates authenticated Supabase clients for Edge Functions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Create a Supabase client with service role access (bypasses RLS)
 * Use this for administrative operations that need full database access
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Create a Supabase client with user authorization (respects RLS)
 * Use this for operations that should respect Row Level Security policies
 *
 * @param authHeader - The Authorization header from the request (contains JWT)
 */
export function createAuthenticatedClient(authHeader: string | null): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  })

  return supabase
}

/**
 * Extract user ID from request headers
 * Returns null if user is not authenticated
 */
export async function getUserId(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return null
    }

    const supabase = createAuthenticatedClient(authHeader)
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    return user.id
  } catch (error) {
    console.error('Error extracting user ID:', error)
    return null
  }
}

/**
 * Verify user is authenticated, throw error if not
 * Use this at the start of protected edge functions
 */
export async function requireAuth(req: Request): Promise<{ userId: string; supabase: SupabaseClient }> {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader) {
    throw new Error('Missing authorization header')
  }

  const supabase = createAuthenticatedClient(authHeader)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Invalid or expired authorization token')
  }

  return {
    userId: user.id,
    supabase,
  }
}

/**
 * Check if user has a specific role
 */
export async function hasRole(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_role_assignment')
    .select('role')
    .eq('user_id', userId)
    .eq('role', role)
    .single()

  if (error || !data) {
    return false
  }

  return true
}

/**
 * Get all roles for a user
 */
export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_role_assignment')
    .select('role')
    .eq('user_id', userId)

  if (error || !data) {
    return []
  }

  return data.map(row => row.role)
}

/**
 * Require user to have at least one of the specified roles
 */
export async function requireRole(
  supabase: SupabaseClient,
  userId: string,
  allowedRoles: string[]
): Promise<void> {
  const userRoles = await getUserRoles(supabase, userId)
  const hasAllowedRole = allowedRoles.some(role => userRoles.includes(role))

  if (!hasAllowedRole) {
    throw new Error(`Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`)
  }
}
