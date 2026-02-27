/**
 * Dashboard Data Edge Function
 * Provides aggregated data for executive dashboard and team dashboards
 *
 * GET /dashboard_data?type=executive|major_gifts|ticketing|corporate
 *
 * Returns:
 * - Pipeline metrics by type and status
 * - Top renewal risks
 * - Ask-ready prospects
 * - Recent activity
 * - Performance metrics
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'

interface DashboardCache {
  data: any
  timestamp: number
}

// Cache for dashboard data (15-minute TTL)
const dashboardCache = new Map<string, DashboardCache>()
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Get cached data or null if expired
 */
function getCachedData(cacheKey: string): any | null {
  const cached = dashboardCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }
  return null
}

/**
 * Set cached data
 */
function setCachedData(cacheKey: string, data: any): void {
  dashboardCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  })
}

/**
 * Get executive dashboard data
 */
async function getExecutiveDashboard(supabase: any): Promise<any> {
  const cacheKey = 'executive_dashboard'
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  // Pipeline summary by type and status
  const { data: pipelineSummary } = await supabase
    .from('opportunity')
    .select('type, status, amount')

  const pipeline = {
    by_type: {} as Record<string, any>,
    by_status: {} as Record<string, any>,
    total_value: 0,
    total_count: 0
  }

  // Aggregate pipeline data
  pipelineSummary?.forEach((opp: any) => {
    // By type
    if (!pipeline.by_type[opp.type]) {
      pipeline.by_type[opp.type] = {
        count: 0,
        total_value: 0,
        by_status: {}
      }
    }
    pipeline.by_type[opp.type].count++
    pipeline.by_type[opp.type].total_value += opp.amount || 0

    // By status within type
    if (!pipeline.by_type[opp.type].by_status[opp.status]) {
      pipeline.by_type[opp.type].by_status[opp.status] = {
        count: 0,
        total_value: 0
      }
    }
    pipeline.by_type[opp.type].by_status[opp.status].count++
    pipeline.by_type[opp.type].by_status[opp.status].total_value += opp.amount || 0

    // By status overall
    if (!pipeline.by_status[opp.status]) {
      pipeline.by_status[opp.status] = {
        count: 0,
        total_value: 0
      }
    }
    pipeline.by_status[opp.status].count++
    pipeline.by_status[opp.status].total_value += opp.amount || 0

    // Totals
    pipeline.total_count++
    pipeline.total_value += opp.amount || 0
  })

  // Top renewal risks (high risk constituents)
  const today = new Date().toISOString().split('T')[0]
  const { data: renewalRisks } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      renewal_risk,
      days_since_touch,
      last_touch_date,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        lifetime_ticket_spend,
        lifetime_giving,
        sport_affinity
      )
    `)
    .eq('as_of_date', today)
    .eq('renewal_risk', 'high')
    .order('days_since_touch', { ascending: false })
    .limit(20)

  // Ask-ready prospects (ready for solicitation)
  const { data: askReadyProspects } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      ask_readiness,
      last_touch_date,
      capacity_estimate,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        lifetime_giving,
        sport_affinity,
        opportunity (
          id,
          type,
          amount,
          status
        )
      )
    `)
    .eq('as_of_date', today)
    .eq('ask_readiness', 'ready')
    .order('capacity_estimate', { ascending: false })
    .limit(20)

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: recentProposals } = await supabase
    .from('proposal')
    .select('id, type, amount, status, created_at, sent_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: recentInteractions } = await supabase
    .from('interaction_log')
    .select('id, type, occurred_at, constituent:constituent_master(first_name, last_name)')
    .gte('occurred_at', sevenDaysAgo.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(10)

  // Performance metrics
  const { data: wonThisMonth } = await supabase
    .from('opportunity')
    .select('amount')
    .eq('status', 'won')
    .gte('updated_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

  const wonValue = wonThisMonth?.reduce((sum, opp) => sum + (opp.amount || 0), 0) || 0

  const dashboardData = {
    pipeline,
    renewal_risks: renewalRisks || [],
    ask_ready_prospects: askReadyProspects || [],
    recent_activity: {
      proposals: recentProposals || [],
      interactions: recentInteractions || []
    },
    performance: {
      won_this_month: {
        count: wonThisMonth?.length || 0,
        total_value: wonValue
      }
    },
    cache_timestamp: new Date().toISOString()
  }

  setCachedData(cacheKey, dashboardData)
  return dashboardData
}

/**
 * Get major gifts dashboard data
 */
async function getMajorGiftsDashboard(supabase: any): Promise<any> {
  const cacheKey = 'major_gifts_dashboard'
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  const today = new Date().toISOString().split('T')[0]

  // Pipeline for major gifts
  const { data: pipeline } = await supabase
    .from('opportunity')
    .select('id, amount, status, constituent:constituent_master(first_name, last_name, email)')
    .eq('type', 'major_gift')
    .eq('status', 'active')
    .order('amount', { ascending: false })

  // Ask-ready prospects for major gifts
  const { data: askReady } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      ask_readiness,
      capacity_estimate,
      last_touch_date,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        lifetime_giving,
        sport_affinity
      )
    `)
    .eq('as_of_date', today)
    .eq('ask_readiness', 'ready')
    .order('capacity_estimate', { ascending: false })
    .limit(50)

  // My proposals (draft and pending)
  const { data: myProposals } = await supabase
    .from('proposal')
    .select('id, type, amount, status, created_at, constituent:constituent_master(first_name, last_name)')
    .eq('type', 'major_gift')
    .in('status', ['draft', 'pending_approval'])
    .order('created_at', { ascending: false })

  const dashboardData = {
    pipeline: pipeline || [],
    ask_ready: askReady || [],
    my_proposals: myProposals || [],
    cache_timestamp: new Date().toISOString()
  }

  setCachedData(cacheKey, dashboardData)
  return dashboardData
}

/**
 * Get ticketing dashboard data
 */
async function getTicketingDashboard(supabase: any): Promise<any> {
  const cacheKey = 'ticketing_dashboard'
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  const today = new Date().toISOString().split('T')[0]

  // Renewal risks for ticket holders
  const { data: renewalRisks } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      renewal_risk,
      days_since_touch,
      ticket_propensity,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        phone,
        lifetime_ticket_spend,
        sport_affinity
      )
    `)
    .eq('as_of_date', today)
    .in('renewal_risk', ['high', 'medium'])
    .order('days_since_touch', { ascending: false })
    .limit(100)

  // Premium ticket holders (high propensity)
  const { data: premiumHolders } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      ticket_propensity,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        lifetime_ticket_spend,
        sport_affinity
      )
    `)
    .eq('as_of_date', today)
    .gte('ticket_propensity', 50)
    .order('ticket_propensity', { ascending: false })
    .limit(50)

  const dashboardData = {
    renewal_risks: renewalRisks || [],
    premium_holders: premiumHolders || [],
    cache_timestamp: new Date().toISOString()
  }

  setCachedData(cacheKey, dashboardData)
  return dashboardData
}

/**
 * Get corporate dashboard data
 */
async function getCorporateDashboard(supabase: any): Promise<any> {
  const cacheKey = 'corporate_dashboard'
  const cached = getCachedData(cacheKey)
  if (cached) return cached

  // Active partnerships
  const { data: activePartnerships } = await supabase
    .from('opportunity')
    .select('id, amount, status, expected_close_date, constituent:constituent_master(company_name, first_name, last_name, email)')
    .eq('type', 'corporate')
    .eq('status', 'active')
    .order('amount', { ascending: false })

  // Corporate propensity prospects
  const today = new Date().toISOString().split('T')[0]
  const { data: prospects } = await supabase
    .from('scores')
    .select(`
      constituent_id,
      corporate_propensity,
      constituent:constituent_master (
        id,
        company_name,
        first_name,
        last_name,
        email,
        is_corporate
      )
    `)
    .eq('as_of_date', today)
    .eq('corporate_propensity', 100)
    .limit(50)

  const dashboardData = {
    active_partnerships: activePartnerships || [],
    prospects: prospects || [],
    cache_timestamp: new Date().toISOString()
  }

  setCachedData(cacheKey, dashboardData)
  return dashboardData
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate
    const { userId, supabase } = await requireAuth(req)

    // Parse dashboard type from query params (GET) or request body (POST)
    let dashboardType = 'executive'

    if (req.method === 'GET') {
      const url = new URL(req.url)
      dashboardType = url.searchParams.get('type') || 'executive'
    } else if (req.method === 'POST') {
      const body = await req.json()
      dashboardType = body.dashboard_type || body.type || 'executive'
    }

    // Use service client to bypass RLS for dashboard queries
    const serviceClient = createServiceClient()

    let dashboardData: any
    let responseKey: string

    switch (dashboardType) {
      case 'executive':
        await requireRole(supabase, userId, ['admin', 'executive', 'revenue_ops'])
        dashboardData = await getExecutiveDashboard(serviceClient)
        responseKey = 'executive'
        break

      case 'major_gifts':
        await requireRole(supabase, userId, ['admin', 'executive', 'major_gifts', 'revenue_ops'])
        dashboardData = await getMajorGiftsDashboard(serviceClient)
        responseKey = 'major_gifts'
        break

      case 'ticketing':
        await requireRole(supabase, userId, ['admin', 'executive', 'ticketing', 'revenue_ops'])
        dashboardData = await getTicketingDashboard(serviceClient)
        responseKey = 'ticketing'
        break

      case 'corporate':
        await requireRole(supabase, userId, ['admin', 'executive', 'corporate', 'revenue_ops'])
        dashboardData = await getCorporateDashboard(serviceClient)
        responseKey = 'corporate'
        break

      default:
        return errorResponse(`Invalid dashboard type: ${dashboardType}`, 400)
    }

    // Return data in format expected by frontend
    return successResponse({
      [responseKey]: dashboardData,
      type: dashboardType,
      cached: !!getCachedData(`${dashboardType}_dashboard`)
    })

  } catch (error) {
    console.error('Dashboard data error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
