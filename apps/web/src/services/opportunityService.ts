/**
 * Opportunity Service
 *
 * API service layer for opportunity CRUD operations.
 */

import { supabase, callEdgeFunction } from '@lib/supabase'
import type {
  Opportunity,
  OpportunityFormData,
  PaginatedResponse,
  QueryOptions,
  RoutingEngineRequest,
  RoutingEngineResponse,
} from '@/types'

/**
 * Get all opportunities with optional filtering, sorting, and pagination
 */
export async function getOpportunities(
  options?: QueryOptions
): Promise<PaginatedResponse<Opportunity>> {
  let query = supabase
    .from('opportunity')
    .select('*, constituent:constituent_master(*)', { count: 'exact' })

  // Apply filters
  if (options?.filter) {
    const { filter } = options

    if (filter.type) {
      if (Array.isArray(filter.type)) {
        query = query.in('type', filter.type)
      } else {
        query = query.eq('type', filter.type)
      }
    }

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

    if (filter.owner_user_id) {
      query = query.eq('owner_user_id', filter.owner_user_id)
    }

    if (filter.owner_role) {
      query = query.eq('owner_role', filter.owner_role)
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
 * Get opportunity by ID
 */
export async function getOpportunity(id: string): Promise<Opportunity> {
  const { data, error } = await supabase
    .from('opportunity')
    .select('*, constituent:constituent_master(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Get opportunities for a constituent
 */
export async function getOpportunitiesByConstituent(
  constituentId: string
): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from('opportunity')
    .select('*')
    .eq('constituent_id', constituentId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get active opportunities by type
 */
export async function getActiveOpportunitiesByType(
  type: string
): Promise<Opportunity[]> {
  const { data, error } = await supabase
    .from('opportunity')
    .select('*, constituent:constituent_master(*)')
    .eq('type', type)
    .eq('status', 'active')
    .order('amount', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Get my opportunities (assigned to current user)
 */
export async function getMyOpportunities(): Promise<Opportunity[]> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('opportunity')
    .select('*, constituent:constituent_master(*)')
    .eq('owner_user_id', user.id)
    .eq('status', 'active')
    .order('expected_close_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data || []
}

/**
 * Create new opportunity (with routing engine)
 */
export async function createOpportunity(
  data: OpportunityFormData
): Promise<{ opportunity: Opportunity; routing: RoutingEngineResponse }> {
  // First, create the opportunity
  const { data: opportunity, error: createError } = await supabase
    .from('opportunity')
    .insert({
      constituent_id: data.constituent_id,
      type: data.type,
      status: 'active',
      amount: data.amount,
      description: data.description || null,
      expected_close_date: data.expected_close_date || null,
    })
    .select('*, constituent:constituent_master(*)')
    .single()

  if (createError) throw createError

  // Then, run through routing engine
  const routingRequest: RoutingEngineRequest = {
    opportunity_id: opportunity.id,
  }

  const routing = await callEdgeFunction<RoutingEngineResponse>(
    'routing_engine',
    routingRequest
  )

  // Update opportunity with routing results if not blocked
  if (!routing.blocked && routing.routing) {
    const { error: updateError } = await supabase
      .from('opportunity')
      .update({
        owner_role: routing.routing.primary_owner_role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunity.id)

    if (updateError) throw updateError
  }

  return { opportunity, routing }
}

/**
 * Update opportunity
 */
export async function updateOpportunity(
  id: string,
  data: Partial<OpportunityFormData>
): Promise<Opportunity> {
  const { data: opportunity, error } = await supabase
    .from('opportunity')
    .update({
      type: data.type,
      amount: data.amount,
      description: data.description,
      expected_close_date: data.expected_close_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, constituent:constituent_master(*)')
    .single()

  if (error) throw error
  return opportunity
}

/**
 * Update opportunity status
 */
export async function updateOpportunityStatus(
  id: string,
  status: 'active' | 'won' | 'lost' | 'paused'
): Promise<Opportunity> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  }

  // Set actual close date if won or lost
  if (status === 'won' || status === 'lost') {
    updateData.actual_close_date = new Date().toISOString()
  }

  const { data: opportunity, error } = await supabase
    .from('opportunity')
    .update(updateData)
    .eq('id', id)
    .select('*, constituent:constituent_master(*)')
    .single()

  if (error) throw error
  return opportunity
}

/**
 * Delete opportunity
 */
export async function deleteOpportunity(id: string): Promise<void> {
  const { error } = await supabase
    .from('opportunity')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Claim opportunity (assign to current user)
 */
export async function claimOpportunity(id: string): Promise<Opportunity> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { data: opportunity, error } = await supabase
    .from('opportunity')
    .update({
      owner_user_id: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, constituent:constituent_master(*)')
    .single()

  if (error) throw error
  return opportunity
}

/**
 * Get pipeline statistics
 */
export async function getPipelineStats() {
  const { data, error } = await supabase
    .from('mv_exec_pipeline')
    .select('*')

  if (error) throw error

  // Transform data into grouped format
  const stats = {
    by_type: {} as Record<string, any>,
    by_status: {} as Record<string, any>,
    totals: {
      count: 0,
      amount: 0,
    },
  }

  data?.forEach((row) => {
    const type = row.opportunity_type
    const status = row.opportunity_status

    if (!stats.by_type[type]) {
      stats.by_type[type] = { count: 0, amount: 0, by_status: {} }
    }

    if (!stats.by_status[status]) {
      stats.by_status[status] = { count: 0, amount: 0 }
    }

    stats.by_type[type].count += row.count
    stats.by_type[type].amount += row.total_amount
    stats.by_type[type].by_status[status] = {
      count: row.count,
      amount: row.total_amount,
    }

    stats.by_status[status].count += row.count
    stats.by_status[status].amount += row.total_amount

    stats.totals.count += row.count
    stats.totals.amount += row.total_amount
  })

  return stats
}
