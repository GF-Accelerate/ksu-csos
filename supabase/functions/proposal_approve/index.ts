/**
 * Proposal Approval Edge Function
 * Handles approval workflow with threshold checking
 *
 * POST /proposal_approve
 * Body: {
 *   proposalId: string,
 *   action: 'approve' | 'reject',
 *   notes?: string
 * }
 *
 * Returns:
 * - Updated proposal status
 * - Approval requirements if applicable
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, createServiceClient, getUserRoles } from '../_shared/supabase.ts'
import { loadApprovalThresholds } from '../_shared/yaml-loader.ts'
import { logProposalEvent } from '../_shared/audit.ts'

interface ApprovalThreshold {
  id: string
  name: string
  when: Record<string, any>
  then: {
    approval_required: boolean
    approver_roles: string[]
    approval_levels: number
    auto_escalate_days: number
  }
  notes?: string
}

/**
 * Evaluate if a threshold's 'when' conditions match
 */
function evaluateWhenConditions(
  when: Record<string, any>,
  context: {
    opportunity_type: string
    amount: number
  }
): boolean {
  if (Object.keys(when).length === 0) {
    return true
  }

  if (when.opportunity_type && when.opportunity_type !== context.opportunity_type) {
    return false
  }

  if (when.amount_min !== undefined && context.amount < when.amount_min) {
    return false
  }

  if (when.amount_max !== undefined && context.amount > when.amount_max) {
    return false
  }

  return true
}

/**
 * Find matching approval threshold
 */
function findMatchingThreshold(
  thresholds: ApprovalThreshold[],
  context: {
    opportunity_type: string
    amount: number
  }
): ApprovalThreshold | null {
  // Sort by priority (rules with specific amount ranges first)
  const sortedThresholds = [...thresholds].sort((a, b) => {
    // Rules with both min and max are most specific
    const aHasBoth = a.when.amount_min !== undefined && a.when.amount_max !== undefined
    const bHasBoth = b.when.amount_min !== undefined && b.when.amount_max !== undefined
    if (aHasBoth && !bHasBoth) return -1
    if (!aHasBoth && bHasBoth) return 1

    // Then rules with only min
    const aHasMin = a.when.amount_min !== undefined
    const bHasMin = b.when.amount_min !== undefined
    if (aHasMin && !bHasMin) return -1
    if (!aHasMin && bHasMin) return 1

    return 0
  })

  for (const threshold of sortedThresholds) {
    if (evaluateWhenConditions(threshold.when, context)) {
      return threshold
    }
  }

  return null
}

/**
 * Check if user has required approver role
 */
function hasApproverRole(userRoles: string[], requiredRoles: string[]): boolean {
  // Admin can always approve
  if (userRoles.includes('admin')) {
    return true
  }

  // Check if user has any of the required roles
  return requiredRoles.some(role => userRoles.includes(role))
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate
    const { userId, supabase } = await requireAuth(req)

    // Parse request body
    const body = await req.json()
    const { proposalId, action, notes } = body

    if (!proposalId || !action) {
      return errorResponse('Missing required fields: proposalId, action', 400)
    }

    if (action !== 'approve' && action !== 'reject') {
      return errorResponse('Invalid action. Must be "approve" or "reject"', 400)
    }

    // Use service client
    const serviceClient = createServiceClient()

    // Fetch proposal with opportunity data
    const { data: proposal, error: proposalError } = await serviceClient
      .from('proposal')
      .select(`
        *,
        opportunity:opportunity (
          id,
          type,
          amount,
          status
        )
      `)
      .eq('id', proposalId)
      .single()

    if (proposalError || !proposal) {
      return errorResponse('Proposal not found', 404)
    }

    // Check if proposal is in correct status
    if (proposal.status !== 'draft' && proposal.status !== 'pending_approval') {
      return errorResponse(`Proposal cannot be ${action}ed in status: ${proposal.status}`, 400)
    }

    // Get user roles
    const userRoles = await getUserRoles(serviceClient, userId)

    // Load approval thresholds
    const thresholdsData = await loadApprovalThresholds()
    const thresholds: ApprovalThreshold[] = thresholdsData.thresholds || []

    // Find matching threshold
    const matchedThreshold = findMatchingThreshold(thresholds, {
      opportunity_type: proposal.opportunity.type,
      amount: proposal.opportunity.amount
    })

    if (!matchedThreshold) {
      return errorResponse('No approval threshold matched. Check approval_thresholds.yaml', 500)
    }

    // Check if approval is required
    if (!matchedThreshold.then.approval_required) {
      // No approval required - auto-approve
      const { error: updateError } = await serviceClient
        .from('proposal')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          approval_notes: notes || 'Auto-approved (below threshold)'
        })
        .eq('id', proposalId)

      if (updateError) {
        throw new Error(`Failed to auto-approve proposal: ${updateError.message}`)
      }

      await logProposalEvent(serviceClient, {
        proposalId,
        action: 'auto_approved',
        userId,
        amount: proposal.amount
      })

      return successResponse({
        proposal: {
          id: proposalId,
          status: 'approved',
          message: 'Proposal auto-approved (below approval threshold)'
        },
        threshold: matchedThreshold
      })
    }

    // Approval is required - check if user has approver role
    if (!hasApproverRole(userRoles, matchedThreshold.then.approver_roles)) {
      return errorResponse(
        `Insufficient permissions. Required roles: ${matchedThreshold.then.approver_roles.join(', ')}`,
        403
      )
    }

    // Handle rejection
    if (action === 'reject') {
      const { error: updateError } = await serviceClient
        .from('proposal')
        .update({
          status: 'rejected',
          approved_by: userId,
          approved_at: new Date().toISOString(),
          approval_notes: notes || 'Rejected'
        })
        .eq('id', proposalId)

      if (updateError) {
        throw new Error(`Failed to reject proposal: ${updateError.message}`)
      }

      await logProposalEvent(serviceClient, {
        proposalId,
        action: 'rejected',
        userId,
        amount: proposal.amount
      })

      return successResponse({
        proposal: {
          id: proposalId,
          status: 'rejected',
          message: 'Proposal rejected'
        }
      })
    }

    // Handle approval
    // For multi-level approval (approval_levels = 2), check if already partially approved
    if (matchedThreshold.then.approval_levels === 2) {
      // Check if another approver has already approved
      const { data: existingApprovals, error: approvalsError } = await serviceClient
        .from('proposal_approval')
        .select('*')
        .eq('proposal_id', proposalId)

      if (approvalsError) {
        console.warn('Could not check existing approvals:', approvalsError)
      }

      const approvalCount = existingApprovals?.length || 0

      // Record this approval
      await serviceClient
        .from('proposal_approval')
        .insert({
          proposal_id: proposalId,
          approved_by: userId,
          approved_at: new Date().toISOString(),
          notes: notes
        })

      if (approvalCount < matchedThreshold.then.approval_levels - 1) {
        // Not enough approvals yet
        const { error: updateError } = await serviceClient
          .from('proposal')
          .update({
            status: 'pending_approval'
          })
          .eq('id', proposalId)

        if (updateError) {
          throw new Error(`Failed to update proposal status: ${updateError.message}`)
        }

        await logProposalEvent(serviceClient, {
          proposalId,
          action: 'partially_approved',
          userId,
          amount: proposal.amount
        })

        return successResponse({
          proposal: {
            id: proposalId,
            status: 'pending_approval',
            message: `Partially approved (${approvalCount + 1}/${matchedThreshold.then.approval_levels} approvals). Awaiting additional approval.`
          },
          threshold: matchedThreshold
        })
      }
    }

    // Full approval
    const { error: updateError } = await serviceClient
      .from('proposal')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        approval_notes: notes || 'Approved'
      })
      .eq('id', proposalId)

    if (updateError) {
      throw new Error(`Failed to approve proposal: ${updateError.message}`)
    }

    await logProposalEvent(serviceClient, {
      proposalId,
      action: 'approved',
      userId,
      amount: proposal.amount
    })

    return successResponse({
      proposal: {
        id: proposalId,
        status: 'approved',
        message: 'Proposal approved and ready to send'
      },
      threshold: matchedThreshold
    })

  } catch (error) {
    console.error('Proposal approval error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
