/**
 * Paciolan CSV Ingestion Edge Function
 * Imports ticket holder data from Paciolan ticketing system
 *
 * POST /ingest_paciolan
 * Body: {
 *   csvData: string (CSV content),
 *   dryRun?: boolean (default: false)
 * }
 *
 * CSV Format:
 * email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { parse as parseCSV } from 'https://deno.land/std@0.208.0/csv/parse.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { logDataIngest } from '../_shared/audit.ts'

interface PaciolanRow {
  email: string
  first_name: string
  last_name: string
  phone: string
  zip: string
  account_id: string
  lifetime_spend: string
  sport_affinity: string
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
 * Parse and validate a Paciolan CSV row
 */
function validatePaciolanRow(row: any, rowIndex: number): { valid: boolean; error?: string; data?: PaciolanRow } {
  // Check required fields
  if (!row.email && !row.phone && !(row.first_name && row.last_name && row.zip)) {
    return {
      valid: false,
      error: 'Row must have email, phone, or (first_name + last_name + zip)'
    }
  }

  // Parse lifetime_spend
  const lifetimeSpend = parseFloat(row.lifetime_spend || '0')
  if (isNaN(lifetimeSpend) || lifetimeSpend < 0) {
    return {
      valid: false,
      error: `Invalid lifetime_spend: ${row.lifetime_spend}`
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
      account_id: row.account_id?.trim() || '',
      lifetime_spend: lifetimeSpend.toString(),
      sport_affinity: row.sport_affinity?.trim() || ''
    }
  }
}

/**
 * Call identity_resolve to get or create constituent
 */
async function resolveConstituent(supabase: any, row: PaciolanRow): Promise<string | null> {
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
 * Update constituent with Paciolan data
 */
async function updateConstituentWithPaciolanData(
  supabase: any,
  constituentId: string,
  row: PaciolanRow
): Promise<{ created: boolean }> {
  const lifetimeSpend = parseFloat(row.lifetime_spend)

  // Get current constituent data
  const { data: existing } = await supabase
    .from('constituent_master')
    .select('is_ticket_holder, lifetime_ticket_spend')
    .eq('id', constituentId)
    .single()

  const wasTicketHolder = existing?.is_ticket_holder || false
  const currentSpend = existing?.lifetime_ticket_spend || 0

  // Update constituent
  const updateData: any = {
    is_ticket_holder: true,
    lifetime_ticket_spend: Math.max(lifetimeSpend, currentSpend) // Take the higher value
  }

  // Update sport affinity if provided
  if (row.sport_affinity) {
    updateData.sport_affinity = row.sport_affinity
  }

  const { error: updateError } = await supabase
    .from('constituent_master')
    .update(updateData)
    .eq('id', constituentId)

  if (updateError) {
    throw new Error(`Failed to update constituent: ${updateError.message}`)
  }

  return { created: !wasTicketHolder }
}

/**
 * Create or update opportunity for ticket renewal
 */
async function createTicketOpportunity(
  supabase: any,
  constituentId: string,
  row: PaciolanRow
): Promise<void> {
  const lifetimeSpend = parseFloat(row.lifetime_spend)

  // Check if there's an active ticket opportunity
  const { data: existingOpp } = await supabase
    .from('opportunity')
    .select('id')
    .eq('constituent_id', constituentId)
    .eq('type', 'ticket')
    .eq('status', 'active')
    .single()

  if (existingOpp) {
    // Update existing opportunity
    await supabase
      .from('opportunity')
      .update({
        amount: lifetimeSpend,
        notes: `Paciolan Account: ${row.account_id}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingOpp.id)
  } else {
    // Create new opportunity
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    nextYear.setMonth(7) // August renewal

    await supabase
      .from('opportunity')
      .insert({
        constituent_id: constituentId,
        type: 'ticket',
        status: 'active',
        amount: lifetimeSpend,
        expected_close_date: nextYear.toISOString().split('T')[0],
        notes: `Paciolan Account: ${row.account_id}`
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
    await requireRole(supabase, userId, ['admin', 'executive', 'ticketing', 'revenue_ops'])

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
        columns: ['email', 'first_name', 'last_name', 'phone', 'zip', 'account_id', 'lifetime_spend', 'sport_affinity']
      })
    } catch (error) {
      return errorResponse(`Failed to parse CSV: ${error.message}`, 400)
    }

    console.log(`Processing ${rows.length} rows from Paciolan CSV`)

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
        const validation = validatePaciolanRow(row, rowIndex)
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

        // Update constituent with Paciolan data
        const { created } = await updateConstituentWithPaciolanData(
          serviceClient,
          constituentId,
          validRow
        )

        if (created) {
          result.created++
        } else {
          result.updated++
        }

        // Create or update ticket opportunity
        await createTicketOpportunity(serviceClient, constituentId, validRow)

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
        source: 'paciolan',
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
    console.error('Paciolan ingestion error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
