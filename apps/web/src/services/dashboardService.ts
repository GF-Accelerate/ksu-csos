/**
 * Dashboard Service
 *
 * API service layer for dashboard data aggregation.
 */

import { callEdgeFunction } from '@lib/supabase'
import type {
  DashboardData,
  ExecutiveDashboard,
  MajorGiftsDashboard,
  TicketingDashboard,
  CorporateDashboard,
} from '@/types'

/**
 * Get dashboard data for current user's role
 */
export async function getDashboardData(
  dashboardType?: 'executive' | 'major_gifts' | 'ticketing' | 'corporate'
): Promise<DashboardData> {
  return callEdgeFunction<DashboardData>('dashboard_data', {
    dashboard_type: dashboardType,
  })
}

/**
 * Get executive dashboard
 */
export async function getExecutiveDashboard(): Promise<ExecutiveDashboard> {
  const data = await callEdgeFunction<DashboardData>('dashboard_data', {
    dashboard_type: 'executive',
  })

  if (!data.executive) {
    throw new Error('Executive dashboard data not available')
  }

  return data.executive
}

/**
 * Get major gifts dashboard
 */
export async function getMajorGiftsDashboard(): Promise<MajorGiftsDashboard> {
  const data = await callEdgeFunction<DashboardData>('dashboard_data', {
    dashboard_type: 'major_gifts',
  })

  if (!data.major_gifts) {
    throw new Error('Major gifts dashboard data not available')
  }

  return data.major_gifts
}

/**
 * Get ticketing dashboard
 */
export async function getTicketingDashboard(): Promise<TicketingDashboard> {
  const data = await callEdgeFunction<DashboardData>('dashboard_data', {
    dashboard_type: 'ticketing',
  })

  if (!data.ticketing) {
    throw new Error('Ticketing dashboard data not available')
  }

  return data.ticketing
}

/**
 * Get corporate dashboard
 */
export async function getCorporateDashboard(): Promise<CorporateDashboard> {
  const data = await callEdgeFunction<DashboardData>('dashboard_data', {
    dashboard_type: 'corporate',
  })

  if (!data.corporate) {
    throw new Error('Corporate dashboard data not available')
  }

  return data.corporate
}

/**
 * Refresh dashboard cache (force refresh)
 */
export async function refreshDashboardCache(
  dashboardType?: 'executive' | 'major_gifts' | 'ticketing' | 'corporate'
): Promise<void> {
  // Call dashboard_data with cache bust parameter
  await callEdgeFunction('dashboard_data', {
    dashboard_type: dashboardType,
    force_refresh: true,
  })
}
