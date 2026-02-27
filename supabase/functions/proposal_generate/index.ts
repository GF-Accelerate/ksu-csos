/**
 * Proposal Generation Edge Function
 * Generates AI-powered proposals using LLM and prompt templates
 *
 * POST /proposal_generate
 * Body: {
 *   opportunityId: string,
 *   templateType?: 'major_gift' | 'corporate' (auto-detected if not provided)
 * }
 *
 * Returns:
 * - Generated proposal draft
 * - Proposal ID for further workflow
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { logProposalEvent } from '../_shared/audit.ts'

interface ProposalTemplate {
  type: 'major_gift' | 'corporate'
  content: string
}

/**
 * Load prompt template from Storage
 */
async function loadPromptTemplate(
  supabase: any,
  templateType: 'major_gift' | 'corporate'
): Promise<string> {
  const fileName = templateType === 'major_gift'
    ? 'major_gift_proposal.md'
    : 'corporate_partnership_proposal.md'

  const { data, error } = await supabase
    .storage
    .from('prompts')
    .download(`proposals/${fileName}`)

  if (error) {
    console.error(`Error loading template ${fileName}:`, error)
    // Return fallback template
    return getFallbackTemplate(templateType)
  }

  const text = await data.text()
  return text
}

/**
 * Fallback templates if Storage fails
 */
function getFallbackTemplate(templateType: 'major_gift' | 'corporate'): string {
  if (templateType === 'major_gift') {
    return `Generate a major gift proposal for Kansas State University Athletics.

Constituent: {{first_name}} {{last_name}}
Lifetime Giving: ${{lifetime_giving}}
Sport Affinity: {{sport_affinity}}
Ask Amount: ${{ask_amount}}

Create a compelling, personalized proposal with:
1. Personalized opening acknowledging their support
2. Description of the giving opportunity and impact
3. Investment details (${{ask_amount}})
4. Recognition and stewardship plan
5. Clear next steps

Tone: Professional, warm, grateful, action-oriented.`
  } else {
    return `Generate a corporate partnership proposal for Kansas State University Athletics.

Company: {{company_name}}
Contact: {{first_name}} {{last_name}}
Investment: ${{ask_amount}}
Sport Focus: {{sport_affinity}}

Create a business-focused proposal with:
1. Executive summary
2. Partnership opportunity description
3. Activation & benefits (brand visibility, hospitality, community engagement, digital)
4. Investment details (${{ask_amount}})
5. K-State Athletics brand value
6. Clear next steps

Tone: Professional, ROI-driven, data-focused, enthusiastic about partnership.`
  }
}

/**
 * Fill template placeholders with constituent/opportunity data
 */
function fillTemplate(
  template: string,
  data: {
    first_name: string
    last_name: string
    company_name?: string
    lifetime_giving: number
    lifetime_ticket_spend: number
    sport_affinity: string | null
    is_donor: boolean
    is_ticket_holder: boolean
    last_interaction_date: string | null
    ask_amount: number
    opportunity_type: string
    opportunity_status: string
    expected_close_date: string | null
    capacity_rating: number
    recent_interactions: string
    industry?: string
    company_size?: string
    partnership_period?: string
    target_audience?: string
    marketing_goals?: string
  }
): string {
  let filled = template

  // Replace all placeholders
  Object.entries(data).forEach(([key, value]) => {
    const placeholder = new RegExp(`{{${key}}}`, 'g')
    filled = filled.replace(placeholder, value !== null && value !== undefined ? String(value) : 'N/A')
  })

  // Handle conditional blocks (simple implementation)
  // {{#if sport_affinity}}...{{/if}}
  filled = filled.replace(/{{#if ([^}]+)}}([\s\S]*?){{\/if}}/g, (match, condition, content) => {
    const value = data[condition as keyof typeof data]
    return value ? content : ''
  })

  return filled
}

/**
 * Call LLM API (OpenAI or Anthropic)
 */
async function callLLM(prompt: string, apiKey: string, provider: 'openai' | 'anthropic' = 'openai'): Promise<string> {
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert fundraising and corporate partnerships professional creating personalized proposals for Kansas State University Athletics.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  } else {
    // Anthropic Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${error}`)
    }

    const data = await response.json()
    return data.content[0].text
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
    await requireRole(supabase, userId, ['admin', 'executive', 'major_gifts', 'corporate', 'revenue_ops'])

    // Parse request body
    const body = await req.json()
    const { opportunityId, templateType } = body

    if (!opportunityId) {
      return errorResponse('Missing required field: opportunityId', 400)
    }

    // Use service client to bypass RLS
    const serviceClient = createServiceClient()

    // Fetch opportunity with constituent data
    const { data: opportunity, error: oppError } = await serviceClient
      .from('opportunity')
      .select(`
        *,
        constituent:constituent_master (
          id,
          first_name,
          last_name,
          email,
          phone,
          company_name,
          is_donor,
          is_ticket_holder,
          is_corporate,
          lifetime_giving,
          lifetime_ticket_spend,
          sport_affinity,
          household_id
        )
      `)
      .eq('id', opportunityId)
      .single()

    if (oppError || !opportunity) {
      return errorResponse('Opportunity not found', 404)
    }

    const constituent = opportunity.constituent

    // Auto-detect template type if not provided
    const detectedTemplateType: 'major_gift' | 'corporate' =
      templateType ||
      (opportunity.type === 'corporate' ? 'corporate' : 'major_gift')

    // Get recent interactions for context
    const { data: interactions } = await serviceClient
      .from('interaction_log')
      .select('occurred_at, type, notes')
      .eq('constituent_id', constituent.id)
      .order('occurred_at', { ascending: false })
      .limit(5)

    const recentInteractions = interactions
      ?.map(i => `${i.type} on ${i.occurred_at}: ${i.notes || 'No notes'}`)
      .join('\n') || 'No recent interactions'

    // Get capacity rating from scores
    const { data: scores } = await serviceClient
      .from('scores')
      .select('capacity_estimate')
      .eq('constituent_id', constituent.id)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .single()

    // Load prompt template
    const promptTemplate = await loadPromptTemplate(serviceClient, detectedTemplateType)

    // Prepare template data
    const templateData = {
      first_name: constituent.first_name,
      last_name: constituent.last_name,
      company_name: constituent.company_name || constituent.first_name + ' ' + constituent.last_name,
      lifetime_giving: constituent.lifetime_giving || 0,
      lifetime_ticket_spend: constituent.lifetime_ticket_spend || 0,
      sport_affinity: constituent.sport_affinity,
      is_donor: constituent.is_donor,
      is_ticket_holder: constituent.is_ticket_holder,
      last_interaction_date: interactions && interactions.length > 0 ? interactions[0].occurred_at : null,
      ask_amount: opportunity.amount,
      opportunity_type: opportunity.type,
      opportunity_status: opportunity.status,
      expected_close_date: opportunity.expected_close_date,
      capacity_rating: scores?.capacity_estimate || 0,
      recent_interactions: recentInteractions,
      // Corporate-specific fields
      industry: 'N/A',  // TODO: Add to constituent_master schema
      company_size: 'N/A',
      partnership_period: opportunity.expected_close_date ? new Date(opportunity.expected_close_date).getFullYear().toString() : 'Current Season',
      target_audience: 'K-State Athletics fans and alumni',
      marketing_goals: 'Brand awareness and community engagement'
    }

    // Fill template with data
    const filledPrompt = fillTemplate(promptTemplate, templateData)

    // Get API key from environment
    const llmProvider = Deno.env.get('LLM_PROVIDER') || 'openai'
    const apiKey = llmProvider === 'openai'
      ? Deno.env.get('OPENAI_API_KEY')
      : Deno.env.get('ANTHROPIC_API_KEY')

    if (!apiKey) {
      return errorResponse(`${llmProvider.toUpperCase()} API key not configured`, 500)
    }

    // Call LLM
    console.log('Generating proposal with LLM...')
    const generatedContent = await callLLM(filledPrompt, apiKey, llmProvider as 'openai' | 'anthropic')

    // Create proposal record
    const { data: proposal, error: createError } = await serviceClient
      .from('proposal')
      .insert({
        opportunity_id: opportunityId,
        constituent_id: constituent.id,
        type: opportunity.type,
        amount: opportunity.amount,
        status: 'draft',
        content: generatedContent,
        created_by: userId
      })
      .select()
      .single()

    if (createError) {
      throw new Error(`Failed to create proposal: ${createError.message}`)
    }

    // Log to audit trail
    await logProposalEvent(serviceClient, {
      proposalId: proposal.id,
      action: 'generated',
      userId: userId,
      amount: opportunity.amount
    })

    return successResponse({
      proposal: {
        id: proposal.id,
        content: proposal.content,
        amount: proposal.amount,
        status: proposal.status,
        type: proposal.type
      },
      message: `Proposal generated successfully using ${detectedTemplateType} template`
    })

  } catch (error) {
    console.error('Proposal generation error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
