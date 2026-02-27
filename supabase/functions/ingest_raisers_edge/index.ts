/**
 * Raiser's Edge CSV Ingestion Edge Function
 * Imports donor data from Raiser's Edge fundraising system
 *
 * POST /ingest_raisers_edge
 * Body: {
 *   csvData: string (CSV content),
 *   dryRun?: boolean (default: false)
 * }
 *
 * CSV Format:
 * email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { parse as parseCSV } from 'https://deno.land/std@0.208.0/csv/parse.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { logDataIngest } from '../_shared/audit.ts'

interface RaisersEdgeRow {
  email: string
  first_name: string
  last_name: string
  phone: string
  zip: string
  donor_id: string
  lifetime_giving: string
  capacity_rating: string
}

interface IngestResult {
  totalRows: number
  processed: number
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; error: string; data?: any }>
}

/**
 * Parse and validate a Raiser's Edge CSV row
 */
function validateRaisersEdgeRow(row: any, rowIndex: number): { valid: boolean; error?: string; data?: RaisersEdgeRow } {
  // Check required fields
  if (!row.email && !row.phone && !(row.first_name && row.last_name && row.zip)) {
    return {
      valid: false,
      error: 'Row must have email, phone, or (first_name + last_name + zip)'
    }
  }

  // Parse lifetime_giving
  const lifetimeGiving = parseFloat(row.lifetime_giving || '0')
  if (isNaN(lifetimeGiving) || lifetimeGiving < 0) {
    return {
      valid: false,
      error: `Invalid lifetime_giving: ${row.lifetime_giving}`
    }
  }

  // Parse capacity_rating (optional)
  const capacityRating = parseFloat(row.capacity_rating || '0')
  if (isNaN(capacityRating) || capacityRating < 0) {
    return {
      valid: false,
      error: `Invalid capacity_rating: ${row.capacity_rating}`
    }
  }

  return {
    valid: true,
    data: {
      email: row.email?.trim() || '',
      first_name: row.first_name?.trim() || '',
      last_name: row.last_name?.trim() || '',
      phone: row.phone?.trim() || '',
      zip: row.zip?.trim()?.substring(0, 5) || '',
      donor_id: row.donor_id?.trim() || '',
      lifetime_giving: lifetimeGiving.toString(),
      capacity_rating: capacityRating.toString()
    }
  }
}

/**
 * Call identity_resolve to get or create constituent
 */
async function resolveConstituent(supabase: any, row: RaisersEdgeRow): Promise<string | null> {
  const identityResolveUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/identity_resolve`

  const response = await fetch(identityResolveUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({
      email: row.email || undefined,
      phone: row.phone || undefined,
      first_name: row.first_name || undefined,
      last_name: row.last_name || undefined,
      zip: row.zip || undefined,
      createIfNotFound: true
    })
  })

  if (!response.ok) {
    throw new Error(`Identity resolution failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data?.constituent_id || null
}

/**
 * Update constituent with Raiser's Edge data
 */
async function updateConstituentWithRaisersEdgeData(
  supabase: any,
  constituentId: string,
  row: RaisersEdgeRow
): Promise<{ created: boolean }> {
  const lifetimeGiving = parseFloat(row.lifetime_giving)

  // Get current constituent data
  const { data: existing } = await supabase
    .from('constituent_master')
    .select('is_donor, lifetime_giving')
    .eq('id', constituentId)
    .single()

  const wasDonor = existing?.is_donor || false
  const currentGiving = existing?.lifetime_giving || 0

  // Update constituent
  const updateData: any = {
    is_donor: true,
    lifetime_giving: Math.max(lifetimeGiving, currentGiving) // Take the higher value
  }

  const { error: updateError } = await supabase
    .from('constituent_master')
    .update(updateData)
    .eq('id', constituentId)

  if (updateError) {
    throw new Error(`Failed to update constituent: ${updateError.message}`)
  }

  return { created: !wasDonor }
}

/**
 * Create or update opportunity for major gift
 */
async function createMajorGiftOpportunity(
  supabase: any,
  constituentId: string,
  row: RaisersEdgeRow
): Promise<void> {
  const lifetimeGiving = parseFloat(row.lifetime_giving)
  const capacityRating = parseFloat(row.capacity_rating)

  // Only create opportunity if there's significant giving history or capacity
  if (lifetimeGiving < 1000 && capacityRating < 10000) {
    return // Skip creating opportunity for small donors
  }

  // Check if there's an active major_gift opportunity
  const { data: existingOpp } = await supabase
    .from('opportunity')
    .select('id, amount')
    .eq('constituent_id', constituentId)
    .eq('type', 'major_gift')
    .eq('status', 'active')
    .single()

  // Calculate suggested ask amount (based on capacity or previous giving)
  const suggestedAsk = Math.max(
    capacityRating * 0.1, // 10% of capacity
    lifetimeGiving * 0.2, // 20% of lifetime giving
    5000 // Minimum $5k ask
  )

  if (existingOpp) {
    // Update existing opportunity only if new amount is higher
    if (suggestedAsk > existingOpp.amount) {
      await supabase
        .from('opportunity')
        .update({
          amount: suggestedAsk,
          notes: `Raiser's Edge Donor ID: ${row.donor_id}. Capacity: $${capacityRating}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingOpp.id)
    }
  } else {
    // Create new opportunity
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    nextYear.setMonth(5) // June (typical end of fiscal year)

    await supabase
      .from('opportunity')
      .insert({
        constituent_id: constituentId,
        type: 'major_gift',
        status: 'active',
        amount: suggestedAsk,
        expected_close_date: nextYear.toISOString().split('T')[0],
        notes: `Raiser's Edge Donor ID: ${row.donor_id}. Lifetime Giving: $${lifetimeGiving}. Capacity: $${capacityRating}`
      })
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate and require appropriate role
    const { userId, supabase } = await requireAuth(req)
    await requireRole(supabase, userId, ['admin', 'executive', 'major_gifts', 'revenue_ops'])

    // Parse request body
    const body = await req.json()
    const { csvData, dryRun = false } = body

    if (!csvData) {
      return errorResponse('Missing csvData parameter', 400)
    }

    // Parse CSV
    let rows: any[]
    try {
      rows = parseCSV(csvData, {
        skipFirstRow: true, // Assume first row is header
        columns: ['email', 'first_name', 'last_name', 'phone', 'zip', 'donor_id', 'lifetime_giving', 'capacity_rating']
      })
    } catch (error) {
      return errorResponse(`Failed to parse CSV: ${error.message}`, 400)
    }

    console.log(`Processing ${rows.length} rows from Raiser's Edge CSV`)

    const result: IngestResult = {
      totalRows: rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    }

    // Use service client to bypass RLS
    const serviceClient = createServiceClient()

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const rowIndex = i + 2 // +2 because of header and 1-based indexing
      const row = rows[i]

      try {
        // Validate row
        const validation = validateRaisersEdgeRow(row, rowIndex)
        if (!validation.valid) {
          result.skipped++
          result.errors.push({
            row: rowIndex,
            error: validation.error!,
            data: row
          })
          continue
        }

        const validRow = validation.data!

        if (dryRun) {
          // Dry run - just validate
          result.processed++
          continue
        }

        // Resolve constituent identity
        const constituentId = await resolveConstituent(serviceClient, validRow)
        if (!constituentId) {
          throw new Error('Identity resolution returned null')
        }

        // Update constituent with Raiser's Edge data
        const { created } = await updateConstituentWithRaisersEdgeData(
          serviceClient,
          constituentId,
          validRow
        )

        if (created) {
          result.created++
        } else {
          result.updated++
        }

        // Create or update major gift opportunity
        await createMajorGiftOpportunity(serviceClient, constituentId, validRow)

        result.processed++

      } catch (error) {
        console.error(`Error processing row ${rowIndex}:`, error)
        result.errors.push({
          row: rowIndex,
          error: error.message,
          data: row
        })
      }
    }

    // Log ingestion to audit trail
    if (!dryRun) {
      await logDataIngest(serviceClient, {
        userId,
        source: 'raisers_edge',
        recordsProcessed: result.processed,
        recordsCreated: result.created,
        recordsUpdated: result.updated,
        errors: result.errors.map(e => `Row ${e.row}: ${e.error}`)
      })
    }

    return successResponse({
      result,
      summary: `Processed ${result.processed}/${result.totalRows} rows. Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`,
      dryRun
    })

  } catch (error) {
    console.error("Raiser's Edge ingestion error:", error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
