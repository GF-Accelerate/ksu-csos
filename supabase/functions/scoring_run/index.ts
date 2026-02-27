/**
 * Scoring Engine Edge Function
 * Calculates constituent scores for renewal risk, ask readiness, and propensity models
 *
 * POST /scoring_run
 * Body: {
 *   constituentIds?: string[] (optional - score specific constituents),
 *   batchSize?: number (default: 100)
 * }
 *
 * Calculates:
 * - renewal_risk: 'low' | 'medium' | 'high'
 * - ask_readiness: 'ready' | 'not_ready'
 * - ticket_propensity: 0-100
 * - corporate_propensity: 0-100
 * - capacity_estimate: number (stub for now)
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { logScoringRun } from '../_shared/audit.ts'

interface ConstituentScore {
  constituent_id: string
  as_of_date: string
  renewal_risk: 'low' | 'medium' | 'high'
  ask_readiness: 'ready' | 'not_ready'
  ticket_propensity: number
  corporate_propensity: number
  capacity_estimate: number
  last_touch_date: string | null
  days_since_touch: number | null
}

interface ScoringResult {
  totalConstituents: number
  scored: number
  errors: Array<{ constituent_id: string; error: string }>
  duration: number
}

/**
 * Get last interaction date for a constituent
 */
async function getLastInteractionDate(
  supabase: any,
  constituentId: string
): Promise<Date | null> {
  const { data } = await supabase
    .from('interaction_log')
    .select('occurred_at')
    .eq('constituent_id', constituentId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .single()

  return data?.occurred_at ? new Date(data.occurred_at) : null
}

/**
 * Check if constituent has active opportunities
 */
async function hasActiveOpportunity(
  supabase: any,
  constituentId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('opportunity')
    .select('id')
    .eq('constituent_id', constituentId)
    .eq('status', 'active')
    .limit(1)

  return !error && data && data.length > 0
}

/**
 * Calculate renewal risk based on days since last touch
 */
function calculateRenewalRisk(daysSinceTouch: number | null): 'low' | 'medium' | 'high' {
  if (daysSinceTouch === null || daysSinceTouch > 180) {
    return 'high'
  } else if (daysSinceTouch > 90) {
    return 'medium'
  } else {
    return 'low'
  }
}

/**
 * Calculate ask readiness based on active opportunities and recent touch
 */
function calculateAskReadiness(
  hasActiveOpp: boolean,
  daysSinceTouch: number | null
): 'ready' | 'not_ready' {
  if (hasActiveOpp && daysSinceTouch !== null && daysSinceTouch < 30) {
    return 'ready'
  }
  return 'not_ready'
}

/**
 * Calculate ticket propensity (0-100 scale)
 * Based on lifetime ticket spend
 */
function calculateTicketPropensity(lifetimeTicketSpend: number): number {
  // Simple linear scale: $500 = 1 point, capped at 100
  const propensity = Math.floor(lifetimeTicketSpend / 500)
  return Math.min(100, Math.max(0, propensity))
}

/**
 * Calculate corporate propensity (0-100 scale)
 * Based on is_corporate flag and engagement
 */
function calculateCorporatePropensity(isCorporate: boolean): number {
  // Stub implementation - future versions will use engagement metrics
  return isCorporate ? 100 : 0
}

/**
 * Calculate capacity estimate (stub for future wealth screening integration)
 */
function calculateCapacityEstimate(lifetimeGiving: number): number {
  // Stub: Simple multiplier of lifetime giving
  // Future: Integrate with wealth screening API
  return lifetimeGiving * 10
}

/**
 * Score a single constituent
 */
async function scoreConstituent(
  supabase: any,
  constituent: any,
  asOfDate: string
): Promise<ConstituentScore> {
  // Get last interaction date
  const lastInteractionDate = await getLastInteractionDate(supabase, constituent.id)

  // Calculate days since last touch
  const daysSinceTouch = lastInteractionDate
    ? Math.floor((new Date(asOfDate).getTime() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Check for active opportunities
  const hasActiveOpp = await hasActiveOpportunity(supabase, constituent.id)

  // Calculate scores
  const renewalRisk = calculateRenewalRisk(daysSinceTouch)
  const askReadiness = calculateAskReadiness(hasActiveOpp, daysSinceTouch)
  const ticketPropensity = calculateTicketPropensity(constituent.lifetime_ticket_spend || 0)
  const corporatePropensity = calculateCorporatePropensity(constituent.is_corporate || false)
  const capacityEstimate = calculateCapacityEstimate(constituent.lifetime_giving || 0)

  return {
    constituent_id: constituent.id,
    as_of_date: asOfDate,
    renewal_risk: renewalRisk,
    ask_readiness: askReadiness,
    ticket_propensity: ticketPropensity,
    corporate_propensity: corporatePropensity,
    capacity_estimate: capacityEstimate,
    last_touch_date: lastInteractionDate ? lastInteractionDate.toISOString() : null,
    days_since_touch: daysSinceTouch
  }
}

/**
 * Batch upsert scores to database
 */
async function upsertScores(
  supabase: any,
  scores: ConstituentScore[]
): Promise<void> {
  const { error } = await supabase
    .from('scores')
    .upsert(
      scores.map(score => ({
        constituent_id: score.constituent_id,
        as_of_date: score.as_of_date,
        renewal_risk: score.renewal_risk,
        ask_readiness: score.ask_readiness,
        ticket_propensity: score.ticket_propensity,
        corporate_propensity: score.corporate_propensity,
        capacity_estimate: score.capacity_estimate,
        last_touch_date: score.last_touch_date,
        days_since_touch: score.days_since_touch
      })),
      {
        onConflict: 'constituent_id,as_of_date',
        ignoreDuplicates: false
      }
    )

  if (error) {
    throw new Error(`Failed to upsert scores: ${error.message}`)
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const startTime = Date.now()

  try {
    // Authenticate and require appropriate role
    const { userId, supabase } = await requireAuth(req)
    await requireRole(supabase, userId, ['admin', 'executive', 'revenue_ops'])

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const { constituentIds, batchSize = 100 } = body

    // Use service client to bypass RLS
    const serviceClient = createServiceClient()

    // Get constituents to score
    let constituentsQuery = serviceClient
      .from('constituent_master')
      .select('id, lifetime_ticket_spend, lifetime_giving, is_corporate')

    if (constituentIds && constituentIds.length > 0) {
      constituentsQuery = constituentsQuery.in('id', constituentIds)
    }

    const { data: constituents, error: fetchError } = await constituentsQuery

    if (fetchError) {
      throw new Error(`Failed to fetch constituents: ${fetchError.message}`)
    }

    if (!constituents || constituents.length === 0) {
      return successResponse({
        result: {
          totalConstituents: 0,
          scored: 0,
          errors: [],
          duration: Date.now() - startTime
        },
        message: 'No constituents to score'
      })
    }

    console.log(`Scoring ${constituents.length} constituents...`)

    const result: ScoringResult = {
      totalConstituents: constituents.length,
      scored: 0,
      errors: [],
      duration: 0
    }

    const asOfDate = new Date().toISOString().split('T')[0] // Today's date (YYYY-MM-DD)

    // Process constituents in batches
    for (let i = 0; i < constituents.length; i += batchSize) {
      const batch = constituents.slice(i, i + batchSize)
      const batchScores: ConstituentScore[] = []

      // Score each constituent in the batch
      for (const constituent of batch) {
        try {
          const score = await scoreConstituent(serviceClient, constituent, asOfDate)
          batchScores.push(score)
          result.scored++
        } catch (error) {
          console.error(`Error scoring constituent ${constituent.id}:`, error)
          result.errors.push({
            constituent_id: constituent.id,
            error: error.message
          })
        }
      }

      // Upsert batch to database
      if (batchScores.length > 0) {
        try {
          await upsertScores(serviceClient, batchScores)
        } catch (error) {
          console.error('Error upserting batch:', error)
          // Add all constituents in this batch to errors
          for (const score of batchScores) {
            result.errors.push({
              constituent_id: score.constituent_id,
              error: `Upsert failed: ${error.message}`
            })
          }
        }
      }

      console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(constituents.length / batchSize)}`)
    }

    // Refresh materialized view
    // Note: This requires the mv_exec_pipeline view from migration 0003_scores_and_views.sql
    try {
      // Use raw SQL to refresh the materialized view
      const { error: refreshError } = await serviceClient
        .from('scores')
        .select('constituent_id')
        .limit(0) // Don't fetch data, just trigger connection

      // The materialized view will be refreshed by a scheduled job or manually
      // For now, we'll document this as a TODO for the pg_cron setup
      console.log('Scoring complete. Note: Materialized view refresh should be scheduled via pg_cron')
    } catch (error) {
      console.warn('Note: Materialized view refresh requires manual setup or pg_cron:', error)
      // Non-fatal - continue
    }

    result.duration = Date.now() - startTime

    // Log to audit trail
    await logScoringRun(serviceClient, {
      constituentsScored: result.scored,
      duration: result.duration,
      errors: result.errors.map(e => `${e.constituent_id}: ${e.error}`)
    })

    return successResponse({
      result,
      message: `Scored ${result.scored}/${result.totalConstituents} constituents in ${result.duration}ms. Errors: ${result.errors.length}`
    })

  } catch (error) {
    console.error('Scoring engine error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
