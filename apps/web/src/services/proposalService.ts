/**
 * Proposal Service
 *
 * API service layer for proposal lifecycle operations.
 */

import { supabase, callEdgeFunction } from '@lib/supabase'
import type {
  Proposal,
  ProposalApproval,
  PaginatedResponse,
  QueryOptions,
  ProposalGenerateRequest,
  ProposalGenerateResponse,
  ProposalApproveRequest,
  ProposalApproveResponse,
  ProposalSendRequest,
  ProposalSendResponse,
} from '@/types'

/**
 * Get all proposals with optional filtering, sorting, and pagination
 */
export async function getProposals(
  options?: QueryOptions
): Promise<PaginatedResponse<Proposal>> {
  let query = supabase
    .from('proposal')
    .select('*, opportunity:opportunity(*, constituent:constituent_master(*))', { count: 'exact' })

  // Apply filters
  if (options?.filter) {
    const { filter } = options

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        query = query.in('status', filter.status)
      } else {
        query = query.eq('status', filter.status)
      }
    }

    if (filter.min_amount) {
      query = query.gte('amount', filter.min_amount)
    }

    if (filter.max_amount) {
      query = query.lte('amount', filter.max_amount)
    }
  }

  // Apply sorting
  if (options?.sort) {
    query = query.order(options.sort.field, {
      ascending: options.sort.direction === 'asc',
    })
  } else {
    // Default sort by created date (newest first)
    query = query.order('created_at', { ascending: false })
  }

  // Apply pagination
  const page = options?.page || 1
  const pageSize = options?.page_size || 50
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data || [],
    total: count || 0,
    page,
    page_size: pageSize,
    has_more: count ? to < count - 1 : false,
  }
}

/**
 * Get proposal by ID
 */
export async function getProposal(id: string): Promise<Proposal> {
  const { data, error } = await supabase
    .from('proposal')
    .select('*, opportunity:opportunity(*, constituent:constituent_master(*))')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Get proposals by status
 */
export async function getProposalsByStatus(
  status: string
): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from('proposal')
    .select('*, opportunity:opportunity(*, constituent:constituent_master(*))')
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get my proposals (opportunities owned by current user)
 */
export async function getMyProposals(): Promise<Proposal[]> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('proposal')
    .select('*, opportunity!inner(*, constituent:constituent_master(*))')
    .eq('opportunity.owner_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get pending approvals
 */
export async function getPendingApprovals(): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from('proposal')
    .select('*, opportunity:opportunity(*, constituent:constituent_master(*))')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Generate new proposal using AI
 */
export async function generateProposal(
  opportunityId: string,
  templateType?: 'major_gift' | 'corporate'
): Promise<ProposalGenerateResponse> {
  const request: ProposalGenerateRequest = {
    opportunity_id: opportunityId,
    template_type: templateType,
  }

  return callEdgeFunction<ProposalGenerateResponse>('proposal_generate', request)
}

/**
 * Update proposal content (draft only)
 */
export async function updateProposalContent(
  id: string,
  content: string
): Promise<Proposal> {
  const { data: proposal, error } = await supabase
    .from('proposal')
    .update({
      generated_content: content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft') // Only allow editing drafts
    .select('*, opportunity:opportunity(*, constituent:constituent_master(*))')
    .single()

  if (error) throw error
  return proposal
}

/**
 * Approve proposal
 */
export async function approveProposal(
  proposalId: string,
  notes?: string
): Promise<ProposalApproveResponse> {
  const request: ProposalApproveRequest = {
    proposal_id: proposalId,
    approve: true,
    notes,
  }

  return callEdgeFunction<ProposalApproveResponse>('proposal_approve', request)
}

/**
 * Reject proposal
 */
export async function rejectProposal(
  proposalId: string,
  reason: string
): Promise<ProposalApproveResponse> {
  const request: ProposalApproveRequest = {
    proposal_id: proposalId,
    approve: false,
    notes: reason,
  }

  return callEdgeFunction<ProposalApproveResponse>('proposal_approve', request)
}

/**
 * Send proposal to constituent
 */
export async function sendProposal(
  proposalId: string,
  recipientEmail: string,
  options?: {
    ccEmails?: string[]
    customMessage?: string
    includePdf?: boolean
  }
): Promise<ProposalSendResponse> {
  const request: ProposalSendRequest = {
    proposal_id: proposalId,
    recipient_email: recipientEmail,
    cc_emails: options?.ccEmails,
    custom_message: options?.customMessage,
    include_pdf: options?.includePdf,
  }

  return callEdgeFunction<ProposalSendResponse>('proposal_send', request)
}

/**
 * Delete proposal (draft only)
 */
export async function deleteProposal(id: string): Promise<void> {
  const { error } = await supabase
    .from('proposal')
    .delete()
    .eq('id', id)
    .eq('status', 'draft') // Only allow deleting drafts

  if (error) throw error
}

/**
 * Get proposal approvals history
 */
export async function getProposalApprovals(
  proposalId: string
): Promise<ProposalApproval[]> {
  const { data, error } = await supabase
    .from('proposal_approval')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('approved_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Get proposals requiring approval (for current user's roles)
 */
export async function getProposalsRequiringMyApproval(): Promise<Proposal[]> {
  // Get current user's roles
  const { data: userRoles } = await supabase
    .from('user_role')
    .select('role')

  const roles = userRoles?.map(r => r.role) || []

  // Check if user is an approver (executive, deputy_ad_revenue, etc.)
  const approverRoles = ['executive', 'admin']
  const isApprover = roles.some(role => approverRoles.includes(role))

  if (!isApprover) {
    return []
  }

  const { data, error } = await supabase
    .from('proposal')
    .select('*, opportunity:opportunity(*, constituent:constituent_master(*))')
    .eq('status', 'pending_approval')
    .eq('requires_approval', true)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Get proposal statistics
 */
export async function getProposalStats() {
  const { data, error } = await supabase
    .from('proposal')
    .select('status, amount')

  if (error) throw error

  const stats = {
    by_status: {} as Record<string, { count: number; total_amount: number }>,
    totals: {
      count: 0,
      total_amount: 0,
    },
  }

  data?.forEach((proposal) => {
    const status = proposal.status

    if (!stats.by_status[status]) {
      stats.by_status[status] = { count: 0, total_amount: 0 }
    }

    stats.by_status[status].count += 1
    stats.by_status[status].total_amount += proposal.amount

    stats.totals.count += 1
    stats.totals.total_amount += proposal.amount
  })

  return stats
}
