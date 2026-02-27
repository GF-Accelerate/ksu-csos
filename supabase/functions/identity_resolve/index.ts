/**
 * Identity Resolution Edge Function
 * Matches incoming constituent data to existing records or creates new ones
 *
 * POST /identity_resolve
 * Body: {
 *   email?: string,
 *   phone?: string,
 *   first_name?: string,
 *   last_name?: string,
 *   zip?: string,
 *   createIfNotFound?: boolean (default: true)
 * }
 *
 * Returns: {
 *   constituent_id: string,
 *   matched: boolean,
 *   matched_by?: 'email' | 'phone' | 'name_zip',
 *   created: boolean,
 *   household_id?: string
 * }
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabase.ts'

interface IdentityResolveRequest {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  zip?: string
  createIfNotFound?: boolean
}

interface IdentityResolveResponse {
  constituent_id: string
  matched: boolean
  matched_by?: 'email' | 'phone' | 'name_zip'
  created: boolean
  household_id?: string
}

/**
 * Normalize phone number to E.164 format (simple version)
 * Removes all non-digit characters and ensures consistent format
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // If it's a 10-digit number, assume US and prepend +1
  if (digits.length === 10) {
    return `+1${digits}`
  }

  // If it starts with 1 and has 11 digits, prepend +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  // Otherwise return as-is (international numbers)
  return digits.length > 0 ? `+${digits}` : phone
}

/**
 * Calculate similarity between two strings (simple Levenshtein-like)
 * Returns a score between 0 (no match) and 1 (exact match)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  if (s1 === s2) return 1.0

  // Simple character-based similarity
  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  if (longer.length === 0) return 1.0

  let matches = 0
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++
  }

  return matches / longer.length
}

/**
 * Try to find existing constituent by email (case-insensitive)
 */
async function findByEmail(supabase: any, email: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('constituent_master')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .single()

  if (error || !data) return null
  return data.id
}

/**
 * Try to find existing constituent by phone (normalized)
 */
async function findByPhone(supabase: any, phone: string): Promise<string | null> {
  const normalizedPhone = normalizePhone(phone)

  const { data, error } = await supabase
    .from('constituent_master')
    .select('id')
    .eq('phone', normalizedPhone)
    .limit(1)
    .single()

  if (error || !data) return null
  return data.id
}

/**
 * Try to find existing constituent by name + zip (fuzzy match)
 */
async function findByNameZip(
  supabase: any,
  firstName: string,
  lastName: string,
  zip: string
): Promise<string | null> {
  // First try exact match
  const { data: exactMatches } = await supabase
    .from('constituent_master')
    .select('id, first_name, last_name')
    .ilike('last_name', lastName)
    .eq('zip', zip)
    .limit(10)

  if (!exactMatches || exactMatches.length === 0) return null

  // Check for first name similarity
  for (const match of exactMatches) {
    const firstNameSimilarity = stringSimilarity(firstName, match.first_name)

    // If first name is at least 80% similar and last name matches exactly, consider it a match
    if (firstNameSimilarity >= 0.8) {
      return match.id
    }
  }

  return null
}

/**
 * Find or create household for the constituent
 */
async function findOrCreateHousehold(
  supabase: any,
  firstName: string,
  lastName: string,
  zip: string
): Promise<string> {
  // Create household name (e.g., "Smith Household")
  const householdName = `${lastName} Household`

  // Try to find existing household with same name and zip
  const { data: existing } = await supabase
    .from('household')
    .select('id')
    .eq('household_name', householdName)
    .limit(1)
    .single()

  if (existing) {
    return existing.id
  }

  // Create new household
  const { data: newHousehold, error } = await supabase
    .from('household')
    .insert({
      household_name: householdName,
      primary_member_id: null // Will be updated after constituent is created
    })
    .select('id')
    .single()

  if (error || !newHousehold) {
    throw new Error(`Failed to create household: ${error?.message}`)
  }

  return newHousehold.id
}

/**
 * Create a new constituent
 */
async function createConstituent(
  supabase: any,
  data: IdentityResolveRequest
): Promise<{ constituent_id: string; household_id: string | null }> {
  const { email, phone, first_name, last_name, zip } = data

  // Validate required fields for creation
  if (!first_name || !last_name) {
    throw new Error('first_name and last_name are required to create a new constituent')
  }

  // Find or create household if we have last name and zip
  let householdId: string | null = null
  if (last_name && zip) {
    householdId = await findOrCreateHousehold(supabase, first_name, last_name, zip)
  }

  // Create the constituent
  const { data: newConstituent, error } = await supabase
    .from('constituent_master')
    .insert({
      email: email || null,
      phone: phone ? normalizePhone(phone) : null,
      first_name,
      last_name,
      zip: zip || null,
      household_id: householdId,
      is_ticket_holder: false,
      is_donor: false,
      is_corporate: false,
      lifetime_ticket_spend: 0,
      lifetime_giving: 0
    })
    .select('id')
    .single()

  if (error || !newConstituent) {
    throw new Error(`Failed to create constituent: ${error?.message}`)
  }

  // Update household primary member if this is a new household
  if (householdId) {
    await supabase
      .from('household')
      .update({ primary_member_id: newConstituent.id })
      .eq('id', householdId)
      .is('primary_member_id', null)
  }

  return {
    constituent_id: newConstituent.id,
    household_id: householdId
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Parse request body
    const body: IdentityResolveRequest = await req.json()
    const { email, phone, first_name, last_name, zip, createIfNotFound = true } = body

    // Validate input
    if (!email && !phone && (!first_name || !last_name || !zip)) {
      return errorResponse(
        'Must provide either email, phone, or (first_name + last_name + zip)',
        400
      )
    }

    // Use service client to bypass RLS (this is an administrative operation)
    const supabase = createServiceClient()

    let constituentId: string | null = null
    let matchedBy: 'email' | 'phone' | 'name_zip' | undefined
    let created = false
    let householdId: string | null = null

    // Strategy 1: Try to match by email (highest confidence)
    if (email && !constituentId) {
      constituentId = await findByEmail(supabase, email)
      if (constituentId) {
        matchedBy = 'email'
      }
    }

    // Strategy 2: Try to match by phone (high confidence)
    if (phone && !constituentId) {
      constituentId = await findByPhone(supabase, phone)
      if (constituentId) {
        matchedBy = 'phone'
      }
    }

    // Strategy 3: Try to match by name + zip (lower confidence, fuzzy)
    if (first_name && last_name && zip && !constituentId) {
      constituentId = await findByNameZip(supabase, first_name, last_name, zip)
      if (constituentId) {
        matchedBy = 'name_zip'
      }
    }

    // If no match found, create new constituent
    if (!constituentId) {
      if (!createIfNotFound) {
        return successResponse({
          constituent_id: null,
          matched: false,
          created: false
        })
      }

      const result = await createConstituent(supabase, body)
      constituentId = result.constituent_id
      householdId = result.household_id
      created = true
    } else {
      // Get household_id for matched constituent
      const { data: constituent } = await supabase
        .from('constituent_master')
        .select('household_id')
        .eq('id', constituentId)
        .single()

      householdId = constituent?.household_id || null
    }

    const response: IdentityResolveResponse = {
      constituent_id: constituentId,
      matched: !created,
      matched_by: matchedBy,
      created,
      household_id: householdId || undefined
    }

    return successResponse(response)

  } catch (error) {
    console.error('Identity resolution error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
