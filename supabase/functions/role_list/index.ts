/**
 * Role List Edge Function
 * Lists roles for a specific user or all users (with filtering)
 *
 * GET /role_list?userId=<uuid>
 * GET /role_list (returns all user-role mappings - admin only)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, getUserRoles } from '../_shared/supabase.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate user
    const { userId, supabase } = await requireAuth(req)

    // Parse query parameters
    const url = new URL(req.url)
    const targetUserId = url.searchParams.get('userId')

    if (targetUserId) {
      // Get roles for a specific user
      // Allow users to query their own roles, or require admin for others
      if (targetUserId !== userId) {
        await requireRole(supabase, userId, ['admin', 'executive'])
      }

      const roles = await getUserRoles(supabase, targetUserId)

      return successResponse({
        userId: targetUserId,
        roles
      })

    } else {
      // List all user-role mappings (admin only)
      await requireRole(supabase, userId, ['admin', 'executive'])

      const { data, error } = await supabase
        .from('user_role')
        .select(`
          user_id,
          role,
          assigned_by,
          assigned_at
        `)
        .order('assigned_at', { ascending: false })

      if (error) {
        console.error('Error fetching roles:', error)
        return errorResponse(`Failed to fetch roles: ${error.message}`, 500)
      }

      // Group by user_id
      const userRolesMap = new Map<string, {
        userId: string
        roles: string[]
        assignments: Array<{
          role: string
          assignedBy: string
          assignedAt: string
        }>
      }>()

      for (const record of data) {
        if (!userRolesMap.has(record.user_id)) {
          userRolesMap.set(record.user_id, {
            userId: record.user_id,
            roles: [],
            assignments: []
          })
        }

        const userRoles = userRolesMap.get(record.user_id)!
        userRoles.roles.push(record.role)
        userRoles.assignments.push({
          role: record.role,
          assignedBy: record.assigned_by,
          assignedAt: record.assigned_at
        })
      }

      const result = Array.from(userRolesMap.values())

      return successResponse({
        totalUsers: result.length,
        users: result
      })
    }

  } catch (error) {
    console.error('Role list error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
