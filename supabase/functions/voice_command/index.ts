/**
 * Voice Command Edge Function
 *
 * Processes natural language voice commands using LLM for intent parsing
 * and routes to appropriate actions.
 */

import { corsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createAuthenticatedClient, requireAuth, getUserId } from '../_shared/supabase.ts'
import { logVoiceCommand } from '../_shared/audit.ts'

// OpenAI API configuration (can switch to Anthropic if preferred)
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_MODEL = 'gpt-4o-mini' // Fast and cheap for parsing

interface VoiceCommandRequest {
  transcript: string
  context?: {
    current_page?: string
    selected_constituent_id?: string
  }
}

interface ParsedIntent {
  action: string
  confidence: number
  parameters: Record<string, any>
  requires_confirmation: boolean
}

interface VoiceCommandResponse {
  success: boolean
  intent: ParsedIntent
  result?: any
  message: string
  display_data?: any
}

// LLM prompt for intent parsing
const INTENT_PARSING_PROMPT = `You are a voice command parser for a college athletics fundraising CRM system. Parse the user's voice command and extract the intent.

Available actions:
- "show_renewals": Show constituents at risk of not renewing (params: risk_level: high|medium|low|all)
- "show_prospects": Show ask-ready prospects (params: limit: number)
- "show_queue": Show user's work queue (params: filter: all|high_priority|overdue)
- "find_constituent": Find a specific constituent (params: name: string, email?: string)
- "generate_proposal": Generate a proposal (params: constituent_name: string, amount?: number)
- "create_opportunity": Create a new opportunity (params: constituent_name: string, type: major_gift|ticket|corporate, amount: number)
- "show_pipeline": Show pipeline summary (params: type?: major_gift|ticket|corporate)
- "send_proposal": Send a proposal (params: proposal_id: string, constituent_name: string) [REQUIRES CONFIRMATION]
- "approve_proposal": Approve a proposal (params: proposal_id: string, constituent_name: string) [REQUIRES CONFIRMATION]
- "unknown": Unable to parse command

Respond with JSON only:
{
  "action": "<action_name>",
  "confidence": <0.0-1.0>,
  "parameters": { ... },
  "requires_confirmation": <true|false>
}

Examples:
User: "Show me renewals at risk"
Response: {"action": "show_renewals", "confidence": 0.95, "parameters": {"risk_level": "all"}, "requires_confirmation": false}

User: "Find John Smith"
Response: {"action": "find_constituent", "confidence": 0.9, "parameters": {"name": "John Smith"}, "requires_confirmation": false}

User: "Generate a proposal for Jane Doe for twenty five thousand dollars"
Response: {"action": "generate_proposal", "confidence": 0.85, "parameters": {"constituent_name": "Jane Doe", "amount": 25000}, "requires_confirmation": false}

User: "Send the proposal to John Smith"
Response: {"action": "send_proposal", "confidence": 0.8, "parameters": {"constituent_name": "John Smith"}, "requires_confirmation": true}

User: "What's in my queue?"
Response: {"action": "show_queue", "confidence": 0.95, "parameters": {"filter": "all"}, "requires_confirmation": false}

Now parse this command:`

async function parseIntentWithLLM(transcript: string): Promise<ParsedIntent> {
  if (!OPENAI_API_KEY) {
    // Fallback to simple rule-based parsing
    return parseIntentSimple(transcript)
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: INTENT_PARSING_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text())
      return parseIntentSimple(transcript)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      return parseIntentSimple(transcript)
    }

    // Parse JSON response
    const parsed = JSON.parse(content)

    return {
      action: parsed.action || 'unknown',
      confidence: parsed.confidence || 0.5,
      parameters: parsed.parameters || {},
      requires_confirmation: parsed.requires_confirmation || false,
    }
  } catch (error) {
    console.error('LLM parsing error:', error)
    return parseIntentSimple(transcript)
  }
}

// Simple rule-based parsing fallback
function parseIntentSimple(transcript: string): ParsedIntent {
  const lower = transcript.toLowerCase()

  // Show renewals
  if (lower.includes('renewal') && (lower.includes('risk') || lower.includes('at risk'))) {
    let risk_level = 'all'
    if (lower.includes('high risk')) risk_level = 'high'
    else if (lower.includes('medium risk')) risk_level = 'medium'
    else if (lower.includes('low risk')) risk_level = 'low'

    return {
      action: 'show_renewals',
      confidence: 0.8,
      parameters: { risk_level },
      requires_confirmation: false,
    }
  }

  // Show prospects
  if (lower.includes('prospect') || lower.includes('ask ready') || lower.includes('ready to ask')) {
    return {
      action: 'show_prospects',
      confidence: 0.8,
      parameters: { limit: 20 },
      requires_confirmation: false,
    }
  }

  // Show queue
  if (lower.includes('queue') || lower.includes('my work') || lower.includes('my task')) {
    return {
      action: 'show_queue',
      confidence: 0.9,
      parameters: { filter: 'all' },
      requires_confirmation: false,
    }
  }

  // Show pipeline
  if (lower.includes('pipeline')) {
    let type = undefined
    if (lower.includes('major gift')) type = 'major_gift'
    else if (lower.includes('ticket')) type = 'ticket'
    else if (lower.includes('corporate')) type = 'corporate'

    return {
      action: 'show_pipeline',
      confidence: 0.8,
      parameters: { type },
      requires_confirmation: false,
    }
  }

  // Find constituent
  if (lower.includes('find') || lower.includes('lookup') || lower.includes('search')) {
    // Extract name (simple heuristic)
    const nameMatch = transcript.match(/find\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i)
    if (nameMatch) {
      return {
        action: 'find_constituent',
        confidence: 0.7,
        parameters: { name: nameMatch[1] },
        requires_confirmation: false,
      }
    }
  }

  return {
    action: 'unknown',
    confidence: 0.3,
    parameters: {},
    requires_confirmation: false,
  }
}

async function executeAction(
  intent: ParsedIntent,
  userId: string,
  supabase: any
): Promise<{ result: any; message: string; display_data?: any }> {
  switch (intent.action) {
    case 'show_renewals':
      return await handleShowRenewals(intent.parameters, supabase)

    case 'show_prospects':
      return await handleShowProspects(intent.parameters, supabase)

    case 'show_queue':
      return await handleShowQueue(intent.parameters, userId, supabase)

    case 'show_pipeline':
      return await handleShowPipeline(intent.parameters, supabase)

    case 'find_constituent':
      return await handleFindConstituent(intent.parameters, supabase)

    case 'generate_proposal':
      return await handleGenerateProposal(intent.parameters, supabase)

    default:
      return {
        result: null,
        message: "I didn't understand that command. Try asking to show renewals, prospects, or your work queue.",
        display_data: null,
      }
  }
}

async function handleShowRenewals(params: any, supabase: any) {
  const { risk_level } = params
  let query = supabase
    .from('scores')
    .select(`
      constituent_id,
      renewal_risk,
      constituent_master!inner(
        id,
        first_name,
        last_name,
        email,
        lifetime_ticket_spend,
        lifetime_giving
      )
    `)
    .order('as_of_date', { ascending: false })

  if (risk_level && risk_level !== 'all') {
    query = query.eq('renewal_risk', risk_level)
  } else {
    query = query.in('renewal_risk', ['high', 'medium'])
  }

  const { data, error } = await query.limit(20)

  if (error) {
    throw new Error(`Failed to fetch renewals: ${error.message}`)
  }

  const constituents = data.map((s: any) => s.constituent_master)
  const count = constituents.length

  return {
    result: constituents,
    message: risk_level === 'all'
      ? `Found ${count} constituents at risk of not renewing.`
      : `Found ${count} constituents at ${risk_level} risk.`,
    display_data: {
      type: 'table',
      columns: ['Name', 'Email', 'Lifetime Value', 'Risk Level'],
      rows: constituents.slice(0, 10).map((c: any, idx: number) => ({
        name: `${c.first_name} ${c.last_name}`,
        email: c.email || 'No email',
        value: `$${((c.lifetime_giving || 0) + (c.lifetime_ticket_spend || 0)).toLocaleString()}`,
        risk: data[idx].renewal_risk,
      })),
    },
  }
}

async function handleShowProspects(params: any, supabase: any) {
  const { limit = 20 } = params

  const { data, error } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      ask_readiness,
      capacity_estimate,
      constituent_master!inner(
        id,
        first_name,
        last_name,
        email,
        lifetime_giving
      )
    `)
    .eq('ask_readiness', 'ready')
    .order('capacity_estimate', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch prospects: ${error.message}`)
  }

  const constituents = data.map((s: any) => ({ ...s.constituent_master, capacity: s.capacity_estimate }))
  const count = constituents.length

  return {
    result: constituents,
    message: `Found ${count} ask-ready prospects.`,
    display_data: {
      type: 'table',
      columns: ['Name', 'Email', 'Lifetime Giving', 'Capacity'],
      rows: constituents.slice(0, 10).map((c: any) => ({
        name: `${c.first_name} ${c.last_name}`,
        email: c.email || 'No email',
        giving: `$${(c.lifetime_giving || 0).toLocaleString()}`,
        capacity: `$${(c.capacity || 0).toLocaleString()}`,
      })),
    },
  }
}

async function handleShowQueue(params: any, userId: string, supabase: any) {
  const { filter = 'all' } = params

  let query = supabase
    .from('task_work_item')
    .select(`
      id,
      type,
      description,
      priority,
      status,
      due_at,
      constituent_id,
      opportunity_id
    `)
    .eq('assigned_user_id', userId)
    .eq('status', 'open')
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true })

  if (filter === 'high_priority') {
    query = query.eq('priority', 'high')
  } else if (filter === 'overdue') {
    query = query.lt('due_at', new Date().toISOString())
  }

  const { data, error } = await query.limit(20)

  if (error) {
    throw new Error(`Failed to fetch work queue: ${error.message}`)
  }

  const count = data.length
  const highPriority = data.filter((t: any) => t.priority === 'high').length

  return {
    result: data,
    message: `You have ${count} tasks in your queue${highPriority > 0 ? `, including ${highPriority} high priority` : ''}.`,
    display_data: {
      type: 'list',
      items: data.slice(0, 10).map((t: any) => ({
        title: t.description || `${t.type} task`,
        subtitle: `Priority: ${t.priority} • Due: ${new Date(t.due_at).toLocaleDateString()}`,
        priority: t.priority,
      })),
    },
  }
}

async function handleShowPipeline(params: any, supabase: any) {
  const { type } = params

  let query = supabase
    .from('opportunity')
    .select('id, type, status, amount')
    .eq('status', 'active')

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch pipeline: ${error.message}`)
  }

  const totalAmount = data.reduce((sum: number, opp: any) => sum + (opp.amount || 0), 0)
  const count = data.length

  const byType = data.reduce((acc: any, opp: any) => {
    acc[opp.type] = (acc[opp.type] || 0) + 1
    return acc
  }, {})

  return {
    result: data,
    message: type
      ? `${type} pipeline: ${count} opportunities worth $${(totalAmount / 1000).toFixed(0)}K.`
      : `Active pipeline: ${count} opportunities worth $${(totalAmount / 1000000).toFixed(1)}M.`,
    display_data: {
      type: 'summary',
      metrics: [
        { label: 'Total Opportunities', value: count },
        { label: 'Total Value', value: `$${(totalAmount / 1000000).toFixed(1)}M` },
        { label: 'Major Gifts', value: byType.major_gift || 0 },
        { label: 'Ticketing', value: byType.ticket || 0 },
        { label: 'Corporate', value: byType.corporate || 0 },
      ],
    },
  }
}

async function handleFindConstituent(params: any, supabase: any) {
  const { name, email } = params

  let query = supabase
    .from('constituent_master')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      lifetime_giving,
      lifetime_ticket_spend,
      is_donor,
      is_ticket_holder,
      is_corporate
    `)

  if (email) {
    query = query.ilike('email', `%${email}%`)
  } else if (name) {
    // Split name and search
    const parts = name.split(' ')
    if (parts.length >= 2) {
      query = query.ilike('first_name', `%${parts[0]}%`).ilike('last_name', `%${parts[parts.length - 1]}%`)
    } else {
      query = query.or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%`)
    }
  }

  const { data, error } = await query.limit(10)

  if (error) {
    throw new Error(`Failed to find constituent: ${error.message}`)
  }

  if (data.length === 0) {
    return {
      result: null,
      message: `No constituents found matching "${name || email}".`,
      display_data: null,
    }
  }

  const constituent = data[0]
  const lifetimeValue = (constituent.lifetime_giving || 0) + (constituent.lifetime_ticket_spend || 0)

  return {
    result: constituent,
    message: `Found ${constituent.first_name} ${constituent.last_name}. Lifetime value: $${lifetimeValue.toLocaleString()}.`,
    display_data: {
      type: 'profile',
      constituent: {
        name: `${constituent.first_name} ${constituent.last_name}`,
        email: constituent.email,
        phone: constituent.phone,
        lifetime_value: `$${lifetimeValue.toLocaleString()}`,
        tags: [
          constituent.is_donor && 'Donor',
          constituent.is_ticket_holder && 'Ticket Holder',
          constituent.is_corporate && 'Corporate',
        ].filter(Boolean),
      },
      alternatives: data.length > 1 ? data.slice(1, 4).map((c: any) => `${c.first_name} ${c.last_name}`) : [],
    },
  }
}

async function handleGenerateProposal(params: any, supabase: any) {
  const { constituent_name, amount } = params

  return {
    result: { constituent_name, amount },
    message: `To generate a proposal for ${constituent_name}${amount ? ` for $${amount.toLocaleString()}` : ''}, please use the Major Gifts module.`,
    display_data: {
      type: 'action',
      suggestion: 'Navigate to Major Gifts → Find constituent → Generate Proposal',
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    const userId = await requireAuth(req)
    const supabase = createAuthenticatedClient(req)

    const { transcript, context }: VoiceCommandRequest = await req.json()

    if (!transcript || transcript.trim().length === 0) {
      return errorResponse('Transcript is required', 400)
    }

    // Parse intent using LLM
    const intent = await parseIntentWithLLM(transcript)

    // Log voice command
    await logVoiceCommand(supabase, userId, transcript, intent.action, intent.confidence)

    // If confidence is too low, ask for clarification
    if (intent.confidence < 0.5) {
      return jsonResponse({
        success: false,
        intent,
        message: "I'm not confident I understood that. Could you rephrase or try a different command?",
      })
    }

    // Execute action
    const { result, message, display_data } = await executeAction(intent, userId, supabase)

    const response: VoiceCommandResponse = {
      success: true,
      intent,
      result,
      message,
      display_data,
    }

    return jsonResponse(response)
  } catch (error: any) {
    console.error('Voice command error:', error)
    return errorResponse(error.message || 'Failed to process voice command', 500)
  }
})
