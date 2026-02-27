/**
 * Constituent Service
 *
 * API service layer for constituent CRUD operations.
 */

import { supabase } from '@lib/supabase'
import type {
  Constituent,
  ConstituentFormData,
  PaginatedResponse,
  QueryOptions,
} from '@/types'

/**
 * Get all constituents with optional filtering, sorting, and pagination
 */
export async function getConstituents(
  options?: QueryOptions
): Promise<PaginatedResponse<Constituent>> {
  let query = supabase
    .from('constituent_master')
    .select('*', { count: 'exact' })

  // Apply filters
  if (options?.filter) {
    const { filter } = options

    if (filter.search) {
      query = query.or(
        `first_name.ilike.%${filter.search}%,` +
        `last_name.ilike.%${filter.search}%,` +
        `email.ilike.%${filter.search}%`
      )
    }

    if (filter.owner_role) {
      query = query.eq('primary_owner_role', filter.owner_role)
    }

    if (filter.owner_user_id) {
      query = query.eq('primary_owner_user_id', filter.owner_user_id)
    }
  }

  // Apply sorting
  if (options?.sort) {
    query = query.order(options.sort.field, {
      ascending: options.sort.direction === 'asc',
    })
  } else {
    // Default sort by last name
    query = query.order('last_name', { ascending: true })
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
 * Get constituent by ID
 */
export async function getConstituent(id: string): Promise<Constituent> {
  const { data, error } = await supabase
    .from('constituent_master')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Get constituent by email
 */
export async function getConstituentByEmail(email: string): Promise<Constituent | null> {
  const { data, error } = await supabase
    .from('constituent_master')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Search constituents by name, email, or phone
 */
export async function searchConstituents(query: string): Promise<Constituent[]> {
  const { data, error } = await supabase
    .from('constituent_master')
    .select('*')
    .or(
      `first_name.ilike.%${query}%,` +
      `last_name.ilike.%${query}%,` +
      `email.ilike.%${query}%,` +
      `phone.ilike.%${query}%`
    )
    .order('last_name', { ascending: true })
    .limit(50)

  if (error) throw error
  return data || []
}

/**
 * Get constituents by household
 */
export async function getConstituentsByHousehold(householdId: string): Promise<Constituent[]> {
  const { data, error } = await supabase
    .from('constituent_master')
    .select('*')
    .eq('household_id', householdId)
    .order('last_name', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Get ticket holders
 */
export async function getTicketHolders(options?: QueryOptions): Promise<PaginatedResponse<Constituent>> {
  let query = supabase
    .from('constituent_master')
    .select('*', { count: 'exact' })
    .eq('is_ticket_holder', true)

  // Apply filters
  if (options?.filter?.search) {
    query = query.or(
      `first_name.ilike.%${options.filter.search}%,` +
      `last_name.ilike.%${options.filter.search}%`
    )
  }

  // Sort by lifetime spend (descending by default)
  const sortField = options?.sort?.field || 'lifetime_ticket_spend'
  const sortDirection = options?.sort?.direction || 'desc'
  query = query.order(sortField, { ascending: sortDirection === 'asc' })

  // Pagination
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
 * Get donors
 */
export async function getDonors(options?: QueryOptions): Promise<PaginatedResponse<Constituent>> {
  let query = supabase
    .from('constituent_master')
    .select('*', { count: 'exact' })
    .eq('is_donor', true)

  // Apply filters
  if (options?.filter?.search) {
    query = query.or(
      `first_name.ilike.%${options.filter.search}%,` +
      `last_name.ilike.%${options.filter.search}%`
    )
  }

  // Sort by lifetime giving (descending by default)
  const sortField = options?.sort?.field || 'lifetime_giving'
  const sortDirection = options?.sort?.direction || 'desc'
  query = query.order(sortField, { ascending: sortDirection === 'asc' })

  // Pagination
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
 * Get corporate contacts
 */
export async function getCorporateContacts(options?: QueryOptions): Promise<PaginatedResponse<Constituent>> {
  let query = supabase
    .from('constituent_master')
    .select('*', { count: 'exact' })
    .eq('is_corporate', true)

  // Apply filters
  if (options?.filter?.search) {
    query = query.or(
      `first_name.ilike.%${options.filter.search}%,` +
      `last_name.ilike.%${options.filter.search}%`
    )
  }

  query = query.order('last_name', { ascending: true })

  // Pagination
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
 * Create new constituent
 */
export async function createConstituent(data: ConstituentFormData): Promise<Constituent> {
  const { data: constituent, error } = await supabase
    .from('constituent_master')
    .insert({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email || null,
      phone: data.phone || null,
      zip: data.zip || null,
      sport_affinity: data.sport_affinity || null,
    })
    .select()
    .single()

  if (error) throw error
  return constituent
}

/**
 * Update constituent
 */
export async function updateConstituent(
  id: string,
  data: Partial<ConstituentFormData>
): Promise<Constituent> {
  const { data: constituent, error } = await supabase
    .from('constituent_master')
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      zip: data.zip,
      sport_affinity: data.sport_affinity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return constituent
}

/**
 * Delete constituent
 */
export async function deleteConstituent(id: string): Promise<void> {
  const { error } = await supabase
    .from('constituent_master')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Get constituent with full context (opportunities, interactions, scores)
 */
export async function getConstituentWithContext(id: string) {
  const [constituent, opportunities, interactions, score] = await Promise.all([
    getConstituent(id),
    supabase
      .from('opportunity')
      .select('*')
      .eq('constituent_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('interaction_log')
      .select('*')
      .eq('constituent_id', id)
      .order('date', { ascending: false })
      .limit(10),
    supabase
      .from('scores')
      .select('*')
      .eq('constituent_id', id)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    constituent,
    opportunities: opportunities.data || [],
    interactions: interactions.data || [],
    score: score.data || null,
  }
}
