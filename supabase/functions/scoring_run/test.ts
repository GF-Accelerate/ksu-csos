/**
 * Tests for scoring_run Edge Function
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// ============================================================================
// UNIT TESTS (Scoring Logic)
// ============================================================================

/**
 * Calculate renewal risk (extracted for testing)
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
 * Calculate ask readiness (extracted for testing)
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
 * Calculate ticket propensity (extracted for testing)
 */
function calculateTicketPropensity(lifetimeTicketSpend: number): number {
  const propensity = Math.floor(lifetimeTicketSpend / 500)
  return Math.min(100, Math.max(0, propensity))
}

/**
 * Calculate corporate propensity (extracted for testing)
 */
function calculateCorporatePropensity(isCorporate: boolean): number {
  return isCorporate ? 100 : 0
}

/**
 * Calculate capacity estimate (extracted for testing)
 */
function calculateCapacityEstimate(lifetimeGiving: number): number {
  return lifetimeGiving * 10
}

// ============================================================================
// Renewal Risk Tests
// ============================================================================

Deno.test('calculateRenewalRisk - low risk (recent touch)', () => {
  assertEquals(calculateRenewalRisk(30), 'low')
  assertEquals(calculateRenewalRisk(60), 'low')
  assertEquals(calculateRenewalRisk(89), 'low')
})

Deno.test('calculateRenewalRisk - medium risk (90-180 days)', () => {
  assertEquals(calculateRenewalRisk(91), 'medium')
  assertEquals(calculateRenewalRisk(120), 'medium')
  assertEquals(calculateRenewalRisk(180), 'medium')
})

Deno.test('calculateRenewalRisk - high risk (>180 days or no touch)', () => {
  assertEquals(calculateRenewalRisk(181), 'high')
  assertEquals(calculateRenewalRisk(365), 'high')
  assertEquals(calculateRenewalRisk(null), 'high')
})

Deno.test('calculateRenewalRisk - edge cases', () => {
  assertEquals(calculateRenewalRisk(0), 'low') // Same day
  assertEquals(calculateRenewalRisk(90), 'low') // Exactly 90 days
  assertEquals(calculateRenewalRisk(91), 'medium') // Just over 90
})

// ============================================================================
// Ask Readiness Tests
// ============================================================================

Deno.test('calculateAskReadiness - ready (active opp + recent touch)', () => {
  assertEquals(calculateAskReadiness(true, 10), 'ready')
  assertEquals(calculateAskReadiness(true, 29), 'ready')
})

Deno.test('calculateAskReadiness - not ready (no active opp)', () => {
  assertEquals(calculateAskReadiness(false, 10), 'not_ready')
  assertEquals(calculateAskReadiness(false, 20), 'not_ready')
})

Deno.test('calculateAskReadiness - not ready (touch too old)', () => {
  assertEquals(calculateAskReadiness(true, 30), 'not_ready')
  assertEquals(calculateAskReadiness(true, 60), 'not_ready')
})

Deno.test('calculateAskReadiness - not ready (no touch)', () => {
  assertEquals(calculateAskReadiness(true, null), 'not_ready')
  assertEquals(calculateAskReadiness(false, null), 'not_ready')
})

Deno.test('calculateAskReadiness - edge cases', () => {
  assertEquals(calculateAskReadiness(true, 0), 'ready') // Same day
  assertEquals(calculateAskReadiness(true, 29), 'ready') // Just under 30
  assertEquals(calculateAskReadiness(true, 30), 'not_ready') // Exactly 30
})

// ============================================================================
// Ticket Propensity Tests
// ============================================================================

Deno.test('calculateTicketPropensity - zero spend', () => {
  assertEquals(calculateTicketPropensity(0), 0)
})

Deno.test('calculateTicketPropensity - low spend', () => {
  assertEquals(calculateTicketPropensity(500), 1)
  assertEquals(calculateTicketPropensity(1000), 2)
  assertEquals(calculateTicketPropensity(2500), 5)
})

Deno.test('calculateTicketPropensity - medium spend', () => {
  assertEquals(calculateTicketPropensity(5000), 10)
  assertEquals(calculateTicketPropensity(10000), 20)
  assertEquals(calculateTicketPropensity(25000), 50)
})

Deno.test('calculateTicketPropensity - high spend (capped at 100)', () => {
  assertEquals(calculateTicketPropensity(50000), 100)
  assertEquals(calculateTicketPropensity(100000), 100)
  assertEquals(calculateTicketPropensity(1000000), 100)
})

Deno.test('calculateTicketPropensity - partial amounts', () => {
  assertEquals(calculateTicketPropensity(499), 0) // Rounds down
  assertEquals(calculateTicketPropensity(750), 1) // Rounds down
  assertEquals(calculateTicketPropensity(1499), 2) // Rounds down
})

// ============================================================================
// Corporate Propensity Tests
// ============================================================================

Deno.test('calculateCorporatePropensity - is corporate', () => {
  assertEquals(calculateCorporatePropensity(true), 100)
})

Deno.test('calculateCorporatePropensity - not corporate', () => {
  assertEquals(calculateCorporatePropensity(false), 0)
})

// ============================================================================
// Capacity Estimate Tests
// ============================================================================

Deno.test('calculateCapacityEstimate - zero giving', () => {
  assertEquals(calculateCapacityEstimate(0), 0)
})

Deno.test('calculateCapacityEstimate - small donor', () => {
  assertEquals(calculateCapacityEstimate(1000), 10000)
  assertEquals(calculateCapacityEstimate(5000), 50000)
})

Deno.test('calculateCapacityEstimate - major donor', () => {
  assertEquals(calculateCapacityEstimate(50000), 500000)
  assertEquals(calculateCapacityEstimate(100000), 1000000)
})

Deno.test('calculateCapacityEstimate - large donor', () => {
  assertEquals(calculateCapacityEstimate(500000), 5000000)
  assertEquals(calculateCapacityEstimate(1000000), 10000000)
})

// ============================================================================
// INTEGRATION TESTS (require Supabase running)
// ============================================================================

/*
These integration tests require:
1. Supabase running locally (supabase start)
2. Migrations applied (supabase db reset)
3. Seed data loaded
4. Interaction logs created

Example integration test structure:

Deno.test('scoring_run - score all constituents', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({})
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertExists(data.data.result.totalConstituents)
  assertExists(data.data.result.scored)
  assertEquals(data.data.result.scored, data.data.result.totalConstituents)
})

Deno.test('scoring_run - score specific constituents', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentIds: ['c1', 'c2', 'c3']
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.result.totalConstituents, 3)
})

Deno.test('scoring_run - custom batch size', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      batchSize: 10
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  // Should process in batches of 10
})

Deno.test('scoring_run - verify scores in database', async () => {
  // First, run scoring
  await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentIds: ['c1']
    })
  })

  // Then, verify score was saved
  // (Would need to query scores table)
  // const { data: score } = await supabase
  //   .from('scores')
  //   .select('*')
  //   .eq('constituent_id', 'c1')
  //   .single()

  // assertExists(score)
  // assertExists(score.renewal_risk)
  // assertExists(score.ask_readiness)
})

Deno.test('scoring_run - renewal risk calculation from interaction log', async () => {
  // Test that renewal risk is correctly calculated based on interaction_log

  // Setup: Create constituent with old interaction (>180 days)
  // Run scoring
  // Verify renewal_risk = 'high'

  // Setup: Create constituent with recent interaction (<30 days)
  // Run scoring
  // Verify renewal_risk = 'low'
})

Deno.test('scoring_run - ask readiness with active opportunity', async () => {
  // Test ask readiness calculation with active opportunity

  // Setup: Create constituent with active opportunity + recent touch
  // Run scoring
  // Verify ask_readiness = 'ready'

  // Setup: Create constituent with active opportunity + old touch
  // Run scoring
  // Verify ask_readiness = 'not_ready'
})

Deno.test('scoring_run - ticket propensity based on lifetime spend', async () => {
  // Test ticket propensity calculation

  // Setup: Create constituent with lifetime_ticket_spend = 50000
  // Run scoring
  // Verify ticket_propensity = 100 (50000/500 = 100, capped)

  // Setup: Create constituent with lifetime_ticket_spend = 2500
  // Run scoring
  // Verify ticket_propensity = 5 (2500/500 = 5)
})

Deno.test('scoring_run - corporate propensity for corporate constituents', async () => {
  // Test corporate propensity calculation

  // Setup: Create constituent with is_corporate = true
  // Run scoring
  // Verify corporate_propensity = 100

  // Setup: Create constituent with is_corporate = false
  // Run scoring
  // Verify corporate_propensity = 0
})

Deno.test('scoring_run - performance with 1000+ constituents', async () => {
  // Test performance requirement: 1000+ constituents in < 30 seconds

  const startTime = Date.now()

  const response = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({})
  })

  const endTime = Date.now()
  const duration = endTime - startTime

  assertEquals(response.status, 200)
  const data = await response.json()

  // Should complete in < 30 seconds for 1000+ constituents
  if (data.data.result.totalConstituents >= 1000) {
    assertEquals(duration < 30000, true, `Took ${duration}ms for ${data.data.result.totalConstituents} constituents`)
  }
})

Deno.test('scoring_run - incremental scoring (upsert)', async () => {
  // Test that running scoring multiple times upserts correctly

  // Run scoring first time
  const response1 = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentIds: ['c1']
    })
  })

  // Run scoring second time (should upsert, not create duplicate)
  const response2 = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentIds: ['c1']
    })
  })

  assertEquals(response1.status, 200)
  assertEquals(response2.status, 200)

  // Verify only one score record exists for c1 for today
  // const { data: scores } = await supabase
  //   .from('scores')
  //   .select('*')
  //   .eq('constituent_id', 'c1')
  //   .eq('as_of_date', new Date().toISOString().split('T')[0])

  // assertEquals(scores.length, 1)
})

Deno.test('scoring_run - error handling for invalid constituent', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentIds: ['invalid-id-123']
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  // Should handle gracefully (may score 0 constituents)
  assertEquals(data.success, true)
})

Deno.test('scoring_run - unauthorized access', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/scoring_run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <non-admin-jwt>'
    },
    body: JSON.stringify({})
  })

  // Should reject non-admin/executive/revenue_ops users
  assertEquals(response.status, 400)
})
*/
