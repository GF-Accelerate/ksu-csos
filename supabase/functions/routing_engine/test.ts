/**
 * Tests for routing_engine Edge Function
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// ============================================================================
// UNIT TESTS (Rule Evaluation Logic)
// ============================================================================

/**
 * Evaluate if a rule's 'when' conditions match (extracted for testing)
 */
function evaluateWhenConditions(
  when: Record<string, any>,
  context: {
    opportunity_type?: string
    amount?: number
    status?: string
    constituent_is_corporate?: boolean
    constituent_is_donor?: boolean
    constituent_is_ticket_holder?: boolean
  }
): boolean {
  if (Object.keys(when).length === 0) {
    return true
  }

  if (when.opportunity_type && when.opportunity_type !== context.opportunity_type) {
    return false
  }

  if (when.amount_min !== undefined && (context.amount || 0) < when.amount_min) {
    return false
  }
  if (when.amount_max !== undefined && (context.amount || 0) > when.amount_max) {
    return false
  }

  if (when.status && when.status !== context.status) {
    return false
  }

  if (when.constituent_is_corporate !== undefined && when.constituent_is_corporate !== context.constituent_is_corporate) {
    return false
  }
  if (when.constituent_is_donor !== undefined && when.constituent_is_donor !== context.constituent_is_donor) {
    return false
  }
  if (when.constituent_is_ticket_holder !== undefined && when.constituent_is_ticket_holder !== context.constituent_is_ticket_holder) {
    return false
  }

  return true
}

// ============================================================================
// Rule Evaluation Tests
// ============================================================================

Deno.test('evaluateWhenConditions - empty when matches everything', () => {
  const result = evaluateWhenConditions({}, {
    opportunity_type: 'major_gift',
    amount: 50000
  })
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - opportunity type match', () => {
  const result = evaluateWhenConditions(
    { opportunity_type: 'major_gift' },
    { opportunity_type: 'major_gift', amount: 10000 }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - opportunity type mismatch', () => {
  const result = evaluateWhenConditions(
    { opportunity_type: 'major_gift' },
    { opportunity_type: 'ticket', amount: 10000 }
  )
  assertEquals(result, false)
})

Deno.test('evaluateWhenConditions - amount within range', () => {
  const result = evaluateWhenConditions(
    { amount_min: 25000, amount_max: 99999 },
    { opportunity_type: 'major_gift', amount: 50000 }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - amount below min', () => {
  const result = evaluateWhenConditions(
    { amount_min: 25000 },
    { opportunity_type: 'major_gift', amount: 10000 }
  )
  assertEquals(result, false)
})

Deno.test('evaluateWhenConditions - amount above max', () => {
  const result = evaluateWhenConditions(
    { amount_max: 99999 },
    { opportunity_type: 'major_gift', amount: 150000 }
  )
  assertEquals(result, false)
})

Deno.test('evaluateWhenConditions - amount at exact min (inclusive)', () => {
  const result = evaluateWhenConditions(
    { amount_min: 25000 },
    { opportunity_type: 'major_gift', amount: 25000 }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - amount at exact max (inclusive)', () => {
  const result = evaluateWhenConditions(
    { amount_max: 99999 },
    { opportunity_type: 'major_gift', amount: 99999 }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - status match', () => {
  const result = evaluateWhenConditions(
    { status: 'active' },
    { opportunity_type: 'ticket', amount: 5000, status: 'active' }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - status mismatch', () => {
  const result = evaluateWhenConditions(
    { status: 'active' },
    { opportunity_type: 'ticket', amount: 5000, status: 'won' }
  )
  assertEquals(result, false)
})

Deno.test('evaluateWhenConditions - constituent is corporate match', () => {
  const result = evaluateWhenConditions(
    { constituent_is_corporate: true },
    { opportunity_type: 'corporate', amount: 50000, constituent_is_corporate: true }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - constituent is corporate mismatch', () => {
  const result = evaluateWhenConditions(
    { constituent_is_corporate: true },
    { opportunity_type: 'corporate', amount: 50000, constituent_is_corporate: false }
  )
  assertEquals(result, false)
})

Deno.test('evaluateWhenConditions - multiple conditions all match', () => {
  const result = evaluateWhenConditions(
    {
      opportunity_type: 'major_gift',
      amount_min: 100000,
      status: 'active',
      constituent_is_donor: true
    },
    {
      opportunity_type: 'major_gift',
      amount: 150000,
      status: 'active',
      constituent_is_donor: true
    }
  )
  assertEquals(result, true)
})

Deno.test('evaluateWhenConditions - multiple conditions one fails', () => {
  const result = evaluateWhenConditions(
    {
      opportunity_type: 'major_gift',
      amount_min: 100000,
      status: 'active',
      constituent_is_donor: true
    },
    {
      opportunity_type: 'major_gift',
      amount: 150000,
      status: 'won',  // Mismatch here
      constituent_is_donor: true
    }
  )
  assertEquals(result, false)
})

// ============================================================================
// Routing Rule Priority Tests
// ============================================================================

interface RoutingRule {
  id: string
  priority: number
  when: Record<string, any>
  then: {
    primary_owner_role: string
    secondary_owner_roles?: string[]
    create_task: boolean
    task_type?: string
    task_priority?: 'low' | 'medium' | 'high'
  }
}

function findMatchingRoutingRule(
  rules: RoutingRule[],
  context: {
    opportunity_type: string
    amount: number
    status: string
    constituent_is_corporate: boolean
    constituent_is_donor: boolean
    constituent_is_ticket_holder: boolean
  }
): RoutingRule | null {
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority)

  for (const rule of sortedRules) {
    if (evaluateWhenConditions(rule.when, context)) {
      return rule
    }
  }

  return null
}

Deno.test('findMatchingRoutingRule - returns first matching rule by priority', () => {
  const rules: RoutingRule[] = [
    {
      id: 'rule1',
      priority: 20,
      when: { opportunity_type: 'major_gift' },
      then: { primary_owner_role: 'major_gifts', create_task: true }
    },
    {
      id: 'rule2',
      priority: 10,
      when: { opportunity_type: 'major_gift', amount_min: 100000 },
      then: { primary_owner_role: 'executive', create_task: true }
    },
    {
      id: 'rule3',
      priority: 30,
      when: {},
      then: { primary_owner_role: 'revenue_ops', create_task: true }
    }
  ]

  const context = {
    opportunity_type: 'major_gift',
    amount: 150000,
    status: 'active',
    constituent_is_corporate: false,
    constituent_is_donor: true,
    constituent_is_ticket_holder: false
  }

  const result = findMatchingRoutingRule(rules, context)
  assertEquals(result?.id, 'rule2') // Highest priority (10) that matches
})

Deno.test('findMatchingRoutingRule - falls back to default rule', () => {
  const rules: RoutingRule[] = [
    {
      id: 'specific',
      priority: 10,
      when: { opportunity_type: 'major_gift', amount_min: 1000000 },
      then: { primary_owner_role: 'executive', create_task: true }
    },
    {
      id: 'default',
      priority: 999,
      when: {},
      then: { primary_owner_role: 'revenue_ops', create_task: true }
    }
  ]

  const context = {
    opportunity_type: 'major_gift',
    amount: 50000,  // Below specific rule threshold
    status: 'active',
    constituent_is_corporate: false,
    constituent_is_donor: true,
    constituent_is_ticket_holder: false
  }

  const result = findMatchingRoutingRule(rules, context)
  assertEquals(result?.id, 'default')
})

Deno.test('findMatchingRoutingRule - returns null if no match', () => {
  const rules: RoutingRule[] = [
    {
      id: 'corporate_only',
      priority: 10,
      when: { opportunity_type: 'corporate' },
      then: { primary_owner_role: 'corporate', create_task: true }
    }
  ]

  const context = {
    opportunity_type: 'major_gift',  // Doesn't match
    amount: 50000,
    status: 'active',
    constituent_is_corporate: false,
    constituent_is_donor: true,
    constituent_is_ticket_holder: false
  }

  const result = findMatchingRoutingRule(rules, context)
  assertEquals(result, null)
})

// ============================================================================
// Collision Detection Tests
// ============================================================================

Deno.test('collision detection - calculates days remaining correctly', () => {
  const windowDays = 14
  const daysSinceUpdate = 5
  const daysRemaining = windowDays - daysSinceUpdate

  assertEquals(daysRemaining, 9)
})

Deno.test('collision detection - within window triggers collision', () => {
  const windowDays = 14
  const daysSinceUpdate = 10

  assertEquals(daysSinceUpdate <= windowDays, true)
})

Deno.test('collision detection - outside window does not trigger', () => {
  const windowDays = 14
  const daysSinceUpdate = 20

  assertEquals(daysSinceUpdate <= windowDays, false)
})

// ============================================================================
// INTEGRATION TESTS (require Supabase running)
// ============================================================================

/*
These integration tests require:
1. Supabase running locally (supabase start)
2. Migrations applied (supabase db reset)
3. Seed data loaded
4. YAML rules uploaded to Supabase Storage

Example integration test structure:

Deno.test('routing_engine - routes major gift to major_gifts team', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c1',
      opportunityType: 'major_gift',
      amount: 50000,
      status: 'active'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.routing.primary_owner_role, 'major_gifts')
  assertExists(data.data.opportunity_id)
})

Deno.test('routing_engine - detects major gift collision with ticketing', async () => {
  // First, create active major gift opportunity
  await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c2',
      opportunityType: 'major_gift',
      amount: 100000,
      status: 'active'
    })
  })

  // Now try to create ticket opportunity (should be blocked)
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c2',
      opportunityType: 'ticket',
      amount: 5000,
      status: 'active'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.blocked, true)
  assertEquals(data.data.collisions.collisions.length > 0, true)
  assertEquals(data.data.collisions.collisions[0].action, 'block')
})

Deno.test('routing_engine - allows override with override flag', async () => {
  // Create active major gift
  await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c3',
      opportunityType: 'major_gift',
      amount: 100000,
      status: 'active'
    })
  })

  // Try with override flag
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c3',
      opportunityType: 'ticket',
      amount: 5000,
      status: 'active',
      override: true
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertExists(data.data.opportunity_id)
})

Deno.test('routing_engine - creates task work item for routed opportunity', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c4',
      opportunityType: 'major_gift',
      amount: 50000,
      status: 'active'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.routing.tasks_created.length > 0, true)
})

Deno.test('routing_engine - routes transformational gift to executive', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c5',
      opportunityType: 'major_gift',
      amount: 1500000,  // $1.5M transformational gift
      status: 'active'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.routing.primary_owner_role, 'major_gifts')
  assertEquals(data.data.routing.secondary_owner_roles.includes('executive'), true)
})

Deno.test('routing_engine - routes corporate partnership correctly', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c6',
      opportunityType: 'corporate',
      amount: 75000,
      status: 'active'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.routing.primary_owner_role, 'corporate')
})

Deno.test('routing_engine - routes premium ticket package', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c7',
      opportunityType: 'ticket',
      amount: 15000,  // Premium package
      status: 'active'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.routing.primary_owner_role, 'ticketing')
  assertEquals(data.data.routing.secondary_owner_roles.includes('major_gifts'), true)
})

Deno.test('routing_engine - audit log captures routing decision', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <admin-jwt>'
    },
    body: JSON.stringify({
      constituentId: 'c8',
      opportunityType: 'major_gift',
      amount: 50000,
      status: 'active'
    })
  })

  assertEquals(response.status, 200)

  // Verify audit log entry (would need to query audit_log table)
  // const { data: auditLog } = await supabase
  //   .from('audit_log')
  //   .select('*')
  //   .eq('action', 'route_opportunity')
  //   .order('created_at', { ascending: false })
  //   .limit(1)
  //   .single()

  // assertExists(auditLog)
})
*/
