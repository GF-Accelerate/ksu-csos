/**
 * Role Assignment Edge Function
 * Assigns or removes roles from users (admin-only)
 *
 * POST /role_assign
 * Body: {
 *   targetUserId: string,
 *   role: string,
 *   action: 'assign' | 'remove'
 * }
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { logRoleChange } from '../_shared/audit.ts'

interface RoleAssignRequest {
  targetUserId: string
  role: string
  action: 'assign' | 'remove'
}

// Valid roles in the system
const VALID_ROLES = [
  'executive',
  'major_gifts',
  'ticketing',
  'corporate',
  'marketing',
  'revenue_ops',
  'admin'
]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate and require admin role
    const { userId, supabase } = await requireAuth(req)
    await requireRole(supabase, userId, ['admin', 'executive'])

    // Parse request body
    const body: RoleAssignRequest = await req.json()
    const { targetUserId, role, action } = body

    // Validate input
    if (!targetUserId || !role || !action) {
      return errorResponse('Missing required fields: targetUserId, role, action', 400)
    }

    if (!VALID_ROLES.includes(role)) {
      return errorResponse(`Invalid role. Valid roles: ${VALID_ROLES.join(', ')}`, 400)
    }

    if (action !== 'assign' && action !== 'remove') {
      return errorResponse('Action must be "assign" or "remove"', 400)
    }

    // Prevent self-removal of admin role (safety check)
    if (action === 'remove' && role === 'admin' && targetUserId === userId) {
      return errorResponse('Cannot remove your own admin role', 403)
    }

    // Use service client to bypass RLS
    const serviceClient = createServiceClient()

    // Perform the action
    if (action === 'assign') {
      // Check if role already assigned
      const { data: existing } = await serviceClient
        .from('user_role')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('role', role)
        .single()

      if (existing) {
        return errorResponse('User already has this role', 409)
      }

      // Assign the role
      const { error: assignError } = await serviceClient
        .from('user_role')
        .insert({
          user_id: targetUserId,
          role: role,
          assigned_by: userId,
          assigned_at: new Date().toISOString()
        })

      if (assignError) {
        console.error('Error assigning role:', assignError)
        return errorResponse(`Failed to assign role: ${assignError.message}`, 500)
      }

      // Log the assignment
      await logRoleChange(serviceClient, {
        adminUserId: userId,
        targetUserId,
        role,
        action: 'role_assign'
      })

      return successResponse(
        { targetUserId, role, action },
        `Role "${role}" assigned to user successfully`
      )

    } else {
      // Remove the role
      const { error: removeError } = await serviceClient
        .from('user_role')
        .delete()
        .eq('user_id', targetUserId)
        .eq('role', role)

      if (removeError) {
        console.error('Error removing role:', removeError)
        return errorResponse(`Failed to remove role: ${removeError.message}`, 500)
      }

      // Log the removal
      await logRoleChange(serviceClient, {
        adminUserId: userId,
        targetUserId,
        role,
        action: 'role_remove'
      })

      return successResponse(
        { targetUserId, role, action },
        `Role "${role}" removed from user successfully`
      )
    }

  } catch (error) {
    console.error('Role assignment error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
