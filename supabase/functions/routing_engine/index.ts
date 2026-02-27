/**
 * Routing Engine Edge Function
 * Automatically routes opportunities to appropriate teams and detects collisions
 *
 * POST /routing_engine
 * Body: {
 *   opportunityId: string (existing opportunity to route)
 *   OR
 *   constituentId: string,
 *   opportunityType: 'ticket' | 'major_gift' | 'corporate',
 *   amount: number,
 *   status?: string (default: 'active')
 * }
 *
 * Returns:
 * - Routing decision (primary owner, secondary owners)
 * - Collision warnings/blocks
 * - Created task work items
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { loadRoutingRules, loadCollisionRules } from '../_shared/yaml-loader.ts'
import { logRouting } from '../_shared/audit.ts'

interface RoutingRule {
  id: string
  priority: number
  name: string
  when: Record<string, any>
  then: {
    primary_owner_role: string
    secondary_owner_roles?: string[]
    create_task: boolean
    task_type?: string
    task_priority?: 'low' | 'medium' | 'high'
  }
  notes?: string
}

interface CollisionRule {
  id: string
  priority: number
  name: string
  when: Record<string, any>
  then: {
    action: 'block' | 'warn'
    window_days: number
    allow_owner_override: boolean
    notification_required: boolean
    notification_roles?: string[]
  }
  notes?: string
}

interface RoutingDecision {
  matched_rule: string
  primary_owner_role: string
  secondary_owner_roles: string[]
  tasks_created: string[]
}

interface CollisionDetection {
  collisions: Array<{
    rule_id: string
    rule_name: string
    action: 'block' | 'warn'
    blocking_opportunity_id: string
    blocking_opportunity_type: string
    window_days: number
    days_remaining: number
    can_override: boolean
    message: string
  }>
  blocked: boolean
}

/**
 * Evaluate if a rule's 'when' conditions match
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
  // Empty 'when' matches everything (default/fallback rule)
  if (Object.keys(when).length === 0) {
    return true
  }

  // Check opportunity type
  if (when.opportunity_type && when.opportunity_type !== context.opportunity_type) {
    return false
  }

  // Check amount range
  if (when.amount_min !== undefined && (context.amount || 0) < when.amount_min) {
    return false
  }
  if (when.amount_max !== undefined && (context.amount || 0) > when.amount_max) {
    return false
  }

  // Check status
  if (when.status && when.status !== context.status) {
    return false
  }

  // Check constituent flags
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

/**
 * Find matching routing rule
 */
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
  // Sort rules by priority (ascending)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority)

  // Find first matching rule
  for (const rule of sortedRules) {
    if (evaluateWhenConditions(rule.when, context)) {
      return rule
    }
  }

  return null
}

/**
 * Check for collisions with existing opportunities
 */
async function detectCollisions(
  supabase: any,
  constituentId: string,
  newOpportunityType: string,
  newAmount: number,
  collisionRules: CollisionRule[]
): Promise<CollisionDetection> {
  const collisions: CollisionDetection['collisions'] = []
  let blocked = false

  // Get all active opportunities for this constituent
  const { data: existingOpportunities, error } = await supabase
    .from('opportunity')
    .select('id, type, amount, status, updated_at')
    .eq('constituent_id', constituentId)
    .eq('status', 'active')

  if (error) {
    console.error('Error fetching existing opportunities:', error)
    return { collisions: [], blocked: false }
  }

  if (!existingOpportunities || existingOpportunities.length === 0) {
    // No existing opportunities, no collisions
    return { collisions: [], blocked: false }
  }

  // Check each existing opportunity against collision rules
  for (const existingOpp of existingOpportunities) {
    const daysSinceUpdate = Math.floor(
      (new Date().getTime() - new Date(existingOpp.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Sort collision rules by priority
    const sortedRules = [...collisionRules].sort((a, b) => a.priority - b.priority)

    // Check each collision rule
    for (const rule of sortedRules) {
      const { when, then } = rule

      // Check if this rule applies
      let matches = true

      if (when.blocking_opportunity_type && when.blocking_opportunity_type !== existingOpp.type) {
        matches = false
      }

      if (when.blocking_opportunity_status && when.blocking_opportunity_status !== existingOpp.status) {
        matches = false
      }

      if (when.blocked_opportunity_type && when.blocked_opportunity_type !== newOpportunityType && when.blocked_opportunity_type !== 'any') {
        matches = false
      }

      if (when.amount_min !== undefined && existingOpp.amount < when.amount_min) {
        matches = false
      }

      if (when.amount_max !== undefined && existingOpp.amount > when.amount_max) {
        matches = false
      }

      // If rule matches, check if still within collision window
      if (matches && daysSinceUpdate <= then.window_days) {
        const daysRemaining = then.window_days - daysSinceUpdate

        collisions.push({
          rule_id: rule.id,
          rule_name: rule.name,
          action: then.action,
          blocking_opportunity_id: existingOpp.id,
          blocking_opportunity_type: existingOpp.type,
          window_days: then.window_days,
          days_remaining: daysRemaining,
          can_override: then.allow_owner_override,
          message: rule.notes || `${rule.name}: ${then.action === 'block' ? 'Blocked' : 'Warning'} - ${daysRemaining} days remaining`
        })

        // If action is block, mark as blocked
        if (then.action === 'block') {
          blocked = true
        }
      }
    }
  }

  return { collisions, blocked }
}

/**
 * Create task work item for assigned owner
 */
async function createTaskWorkItem(
  supabase: any,
  opportunityId: string,
  constituentId: string,
  assignedRole: string,
  taskType: string,
  taskPriority: 'low' | 'medium' | 'high'
): Promise<string | null> {
  // Calculate due date based on priority
  const now = new Date()
  let dueDate = new Date(now)

  switch (taskPriority) {
    case 'high':
      dueDate.setDate(now.getDate() + 3) // 3 days
      break
    case 'medium':
      dueDate.setDate(now.getDate() + 7) // 1 week
      break
    case 'low':
      dueDate.setDate(now.getDate() + 14) // 2 weeks
      break
  }

  const { data, error } = await supabase
    .from('task_work_item')
    .insert({
      type: taskType,
      constituent_id: constituentId,
      opportunity_id: opportunityId,
      assigned_role: assignedRole,
      priority: taskPriority,
      status: 'pending',
      due_at: dueDate.toISOString()
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating task work item:', error)
    return null
  }

  return data?.id || null
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate and require appropriate role
    const { userId, supabase } = await requireAuth(req)
    await requireRole(supabase, userId, ['admin', 'executive', 'revenue_ops', 'major_gifts', 'ticketing', 'corporate'])

    // Parse request body
    const body = await req.json()
    const { opportunityId, constituentId, opportunityType, amount, status = 'active' } = body

    // Use service client to bypass RLS
    const serviceClient = createServiceClient()

    let opportunity: any
    let constituent: any

    // If opportunityId provided, fetch the opportunity
    if (opportunityId) {
      const { data: oppData, error: oppError } = await serviceClient
        .from('opportunity')
        .select('*, constituent_id')
        .eq('id', opportunityId)
        .single()

      if (oppError || !oppData) {
        return errorResponse('Opportunity not found', 404)
      }

      opportunity = oppData

      // Fetch constituent
      const { data: constData, error: constError } = await serviceClient
        .from('constituent_master')
        .select('*')
        .eq('id', opportunity.constituent_id)
        .single()

      if (constError || !constData) {
        return errorResponse('Constituent not found', 404)
      }

      constituent = constData
    } else {
      // Creating new opportunity - need constituentId, type, amount
      if (!constituentId || !opportunityType || amount === undefined) {
        return errorResponse('Missing required fields: constituentId, opportunityType, amount', 400)
      }

      // Fetch constituent
      const { data: constData, error: constError } = await serviceClient
        .from('constituent_master')
        .select('*')
        .eq('id', constituentId)
        .single()

      if (constError || !constData) {
        return errorResponse('Constituent not found', 404)
      }

      constituent = constData

      // Create opportunity object for routing
      opportunity = {
        constituent_id: constituentId,
        type: opportunityType,
        amount: amount,
        status: status
      }
    }

    // Load routing rules
    const routingRulesData = await loadRoutingRules()
    const routingRules: RoutingRule[] = routingRulesData.rules || []

    // Load collision rules
    const collisionRulesData = await loadCollisionRules()
    const collisionRules: CollisionRule[] = collisionRulesData.rules || []

    // Build context for rule evaluation
    const context = {
      opportunity_type: opportunity.type,
      amount: opportunity.amount,
      status: opportunity.status,
      constituent_is_corporate: constituent.is_corporate || false,
      constituent_is_donor: constituent.is_donor || false,
      constituent_is_ticket_holder: constituent.is_ticket_holder || false
    }

    // Find matching routing rule
    const matchedRule = findMatchingRoutingRule(routingRules, context)

    if (!matchedRule) {
      return errorResponse('No routing rule matched. Check routing_rules.yaml', 500)
    }

    // Check for collisions
    const collisionDetection = await detectCollisions(
      serviceClient,
      constituent.id,
      opportunity.type,
      opportunity.amount,
      collisionRules
    )

    // If blocked and not an override request, return error
    if (collisionDetection.blocked && !body.override) {
      return successResponse({
        routing: {
          matched_rule: matchedRule.id,
          primary_owner_role: matchedRule.then.primary_owner_role,
          secondary_owner_roles: matchedRule.then.secondary_owner_roles || []
        },
        collisions: collisionDetection,
        blocked: true,
        message: 'Opportunity creation blocked due to collision. Set override=true to bypass (if allowed).'
      })
    }

    // Update opportunity with routing decision
    const updateData: any = {
      primary_owner_role: matchedRule.then.primary_owner_role,
      secondary_owner_roles: matchedRule.then.secondary_owner_roles || []
    }

    let updatedOpportunityId = opportunityId

    if (opportunityId) {
      // Update existing opportunity
      const { error: updateError } = await serviceClient
        .from('opportunity')
        .update(updateData)
        .eq('id', opportunityId)

      if (updateError) {
        throw new Error(`Failed to update opportunity: ${updateError.message}`)
      }
    } else {
      // Create new opportunity
      const { data: newOpp, error: createError } = await serviceClient
        .from('opportunity')
        .insert({
          ...opportunity,
          ...updateData
        })
        .select('id')
        .single()

      if (createError) {
        throw new Error(`Failed to create opportunity: ${createError.message}`)
      }

      updatedOpportunityId = newOpp.id
    }

    // Create task work items if required
    const tasksCreated: string[] = []

    if (matchedRule.then.create_task && updatedOpportunityId) {
      const taskId = await createTaskWorkItem(
        serviceClient,
        updatedOpportunityId,
        constituent.id,
        matchedRule.then.primary_owner_role,
        matchedRule.then.task_type || 'follow_up',
        matchedRule.then.task_priority || 'medium'
      )

      if (taskId) {
        tasksCreated.push(taskId)
      }
    }

    // Build result
    const routingDecision: RoutingDecision = {
      matched_rule: matchedRule.id,
      primary_owner_role: matchedRule.then.primary_owner_role,
      secondary_owner_roles: matchedRule.then.secondary_owner_roles || [],
      tasks_created: tasksCreated
    }

    // Log to audit trail
    await logRouting(serviceClient, {
      opportunityId: updatedOpportunityId,
      constituentId: constituent.id,
      matchedRule: matchedRule.id,
      primaryOwnerRole: matchedRule.then.primary_owner_role,
      collisions: collisionDetection.collisions.map(c => c.rule_id)
    })

    return successResponse({
      routing: routingDecision,
      collisions: collisionDetection,
      opportunity_id: updatedOpportunityId,
      message: `Routed to ${routingDecision.primary_owner_role}. ${collisionDetection.collisions.length} collision(s) detected.`
    })

  } catch (error) {
    console.error('Routing engine error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
