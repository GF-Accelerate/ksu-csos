/**
 * Score Service
 *
 * API service layer for constituent scoring queries.
 */

import { supabase, callEdgeFunction } from '@lib/supabase'
import type {
  Score,
  Constituent,
  ScoringRunRequest,
  ScoringRunResponse,
} from '@/types'

/**
 * Get score for a constituent (latest)
 */
export async function getConstituentScore(
  constituentId: string
): Promise<Score | null> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .eq('constituent_id', constituentId)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Get score history for a constituent
 */
export async function getConstituentScoreHistory(
  constituentId: string,
  limit = 30
): Promise<Score[]> {
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .eq('constituent_id', constituentId)
    .order('as_of_date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Get constituents by renewal risk
 */
export async function getConstituentsByRenewalRisk(
  risk: 'high' | 'medium' | 'low',
  limit = 100
): Promise<Array<{ constituent: Constituent; score: Score }>> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .eq('renewal_risk', risk)
    .order('as_of_date', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Group by constituent (get latest score for each)
  const byConstituent = new Map<string, any>()

  data?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  return Array.from(byConstituent.values())
}

/**
 * Get ask-ready constituents
 */
export async function getAskReadyConstituents(
  limit = 50
): Promise<Array<{ constituent: Constituent; score: Score }>> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .eq('ask_readiness', 'ready')
    .order('capacity_estimate', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Group by constituent (get latest score for each)
  const byConstituent = new Map<string, any>()

  data?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  return Array.from(byConstituent.values())
}

/**
 * Get constituents by ticket propensity
 */
export async function getConstituentsByTicketPropensity(
  minScore = 50,
  limit = 100
): Promise<Array<{ constituent: Constituent; score: Score }>> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .gte('ticket_propensity', minScore)
    .order('ticket_propensity', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Group by constituent (get latest score for each)
  const byConstituent = new Map<string, any>()

  data?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  return Array.from(byConstituent.values())
}

/**
 * Get constituents by corporate propensity
 */
export async function getConstituentsByCorporatePropensity(
  minScore = 50,
  limit = 100
): Promise<Array<{ constituent: Constituent; score: Score }>> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .gte('corporate_propensity', minScore)
    .order('corporate_propensity', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Group by constituent (get latest score for each)
  const byConstituent = new Map<string, any>()

  data?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  return Array.from(byConstituent.values())
}

/**
 * Get constituents by capacity estimate
 */
export async function getConstituentsByCapacity(
  minCapacity = 10000,
  limit = 100
): Promise<Array<{ constituent: Constituent; score: Score }>> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .gte('capacity_estimate', minCapacity)
    .order('capacity_estimate', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Group by constituent (get latest score for each)
  const byConstituent = new Map<string, any>()

  data?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  return Array.from(byConstituent.values())
}

/**
 * Run scoring engine (for all constituents or specific ones)
 */
export async function runScoring(
  constituentIds?: string[],
  batchSize?: number
): Promise<ScoringRunResponse> {
  const request: ScoringRunRequest = {
    constituent_ids: constituentIds,
    batch_size: batchSize,
  }

  return callEdgeFunction<ScoringRunResponse>('scoring_run', request)
}

/**
 * Get scoring statistics
 */
export async function getScoringStats() {
  const { data, error } = await supabase
    .from('scores')
    .select('renewal_risk, ask_readiness')

  if (error) throw error

  const stats = {
    renewal_risk: {
      high: 0,
      medium: 0,
      low: 0,
    },
    ask_readiness: {
      ready: 0,
      not_ready: 0,
      under_cultivation: 0,
    },
    totals: {
      count: 0,
    },
  }

  // Group by constituent (count latest scores only)
  const byConstituent = new Map<string, any>()

  data?.forEach((score: any) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  // Count stats from latest scores
  byConstituent.forEach((score) => {
    stats.renewal_risk[score.renewal_risk as keyof typeof stats.renewal_risk] += 1
    stats.ask_readiness[score.ask_readiness as keyof typeof stats.ask_readiness] += 1
    stats.totals.count += 1
  })

  return stats
}

/**
 * Get top prospects (high capacity + ask ready)
 */
export async function getTopProspects(
  limit = 20
): Promise<Array<{ constituent: Constituent; score: Score }>> {
  const { data, error } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .eq('ask_readiness', 'ready')
    .gte('capacity_estimate', 10000)
    .order('capacity_estimate', { ascending: false })
    .limit(limit)

  if (error) throw error

  // Group by constituent (get latest score for each)
  const byConstituent = new Map<string, any>()

  data?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  return Array.from(byConstituent.values())
}

/**
 * Get renewal risks with last touch info
 */
export async function getRenewalRisksWithTouchInfo(
  limit = 100
): Promise<Array<{
  constituent: Constituent
  score: Score
  days_since_touch: number
}>> {
  // Get high renewal risk constituents
  const { data: scores, error: scoresError } = await supabase
    .from('scores')
    .select('*, constituent:constituent_master(*)')
    .eq('renewal_risk', 'high')
    .order('as_of_date', { ascending: false })
    .limit(limit)

  if (scoresError) throw scoresError

  // Group by constituent
  const byConstituent = new Map<string, any>()
  scores?.forEach((score) => {
    const constituentId = score.constituent_id
    if (!byConstituent.has(constituentId)) {
      byConstituent.set(constituentId, score)
    }
  })

  // Get last touch date for each constituent
  const results = []

  for (const score of byConstituent.values()) {
    const { data: lastInteraction } = await supabase
      .from('interaction_log')
      .select('date')
      .eq('constituent_id', score.constituent_id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const daysSinceTouch = lastInteraction
      ? Math.floor(
          (Date.now() - new Date(lastInteraction.date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 999

    results.push({
      constituent: score.constituent,
      score,
      days_since_touch: daysSinceTouch,
    })
  }

  // Sort by days since touch (descending)
  results.sort((a, b) => b.days_since_touch - a.days_since_touch)

  return results
}
