/**
 * Executive Dashboard
 *
 * High-level revenue intelligence dashboard for executives.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getExecutiveDashboard, refreshDashboardCache } from '@services/dashboardService'
import type { ExecutiveDashboard as DashboardData } from '@/types'

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function ExecDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    loadDashboard()

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      loadDashboard(true)
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  const loadDashboard = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    try {
      const dashboardData = await getExecutiveDashboard()
      setData(dashboardData)
      setLastRefresh(new Date())
    } catch (err: any) {
      console.error('Failed to load dashboard:', err)
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await refreshDashboardCache('executive')
      await loadDashboard(true)
    } catch (err: any) {
      setError(err.message || 'Failed to refresh dashboard')
      setLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="page">
        <div className="container">
          <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner" style={{ width: '3rem', height: '3rem', margin: '0 auto' }}></div>
              <p className="mt-md text-muted">Loading dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="page">
        <div className="container">
          <div className="card mt-xl">
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <h2 className="empty-state-title">Error Loading Dashboard</h2>
              <p className="empty-state-description">{error}</p>
              <button className="btn btn-primary mt-lg" onClick={() => loadDashboard()}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Calculate totals
  const totalPipeline = data.pipeline_summary.reduce((sum, item) => sum + item.total_amount, 0)
  const totalCount = data.pipeline_summary.reduce((sum, item) => sum + item.count, 0)

  // Group by type
  const byType: Record<string, { count: number; amount: number }> = {}
  data.pipeline_summary.forEach((item) => {
    if (!byType[item.type]) {
      byType[item.type] = { count: 0, amount: 0 }
    }
    byType[item.type].count += item.count
    byType[item.type].amount += item.total_amount
  })

  // Group by status
  const byStatus: Record<string, { count: number; amount: number }> = {}
  data.pipeline_summary.forEach((item) => {
    if (!byStatus[item.status]) {
      byStatus[item.status] = { count: 0, amount: 0 }
    }
    byStatus[item.status].count += item.count
    byStatus[item.status].amount += item.total_amount
  })

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Executive Dashboard</h1>
            <p className="page-description">
              Revenue Intelligence Overview
              <span className="text-muted text-sm ml-md">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            </p>
          </div>
          <div className="page-actions">
            <button
              className="btn btn-secondary"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-sm">
                  <span className="spinner" style={{ width: '1rem', height: '1rem' }}></span>
                  Refreshing...
                </span>
              ) : (
                '🔄 Refresh'
              )}
            </button>
          </div>
        </div>

        {/* Pipeline Summary Cards */}
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <div className="dashboard-card-label">Total Pipeline</div>
            <div className="dashboard-card-value">
              ${(totalPipeline / 1000000).toFixed(1)}M
            </div>
            <div className="dashboard-card-trend">
              {totalCount} opportunities
            </div>
          </div>

          <div className="dashboard-card" style={{ background: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)' }}>
            <div className="dashboard-card-label">Major Gifts</div>
            <div className="dashboard-card-value">
              ${((byType.major_gift?.amount || 0) / 1000000).toFixed(1)}M
            </div>
            <div className="dashboard-card-trend">
              {byType.major_gift?.count || 0} opportunities
            </div>
          </div>

          <div className="dashboard-card" style={{ background: 'linear-gradient(135deg, #17a2b8 0%, #117a8b 100%)' }}>
            <div className="dashboard-card-label">Ticketing</div>
            <div className="dashboard-card-value">
              ${((byType.ticket?.amount || 0) / 1000).toFixed(0)}K
            </div>
            <div className="dashboard-card-trend">
              {byType.ticket?.count || 0} opportunities
            </div>
          </div>

          <div className="dashboard-card" style={{ background: 'linear-gradient(135deg, #ffc107 0%, #d39e00 100%)' }}>
            <div className="dashboard-card-label">Corporate</div>
            <div className="dashboard-card-value">
              ${((byType.corporate?.amount || 0) / 1000000).toFixed(1)}M
            </div>
            <div className="dashboard-card-trend">
              {byType.corporate?.count || 0} opportunities
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="card mb-lg">
          <div className="card-header">
            <h2 className="card-title">Pipeline by Status</h2>
          </div>
          <div className="status-grid">
            {Object.entries(byStatus).map(([status, stats]) => (
              <div key={status} className="status-card">
                <div className="status-card-header">
                  <span className={`badge badge-${getStatusColor(status)}`}>
                    {status}
                  </span>
                  <span className="status-card-count">{stats.count}</span>
                </div>
                <div className="status-card-amount">
                  ${(stats.amount / 1000000).toFixed(2)}M
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Renewal Risks */}
        <div className="card mb-lg">
          <div className="card-header">
            <h2 className="card-title">Top Renewal Risks</h2>
            <Link to="/ticketing" className="btn btn-secondary btn-sm">
              View All
            </Link>
          </div>

          {data.renewal_risks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✓</div>
              <h3 className="empty-state-title">No High-Risk Renewals</h3>
              <p className="empty-state-description">
                All constituents are engaged and up to date.
              </p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Constituent</th>
                    <th>Risk Level</th>
                    <th>Days Since Touch</th>
                    <th>Lifetime Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.renewal_risks.slice(0, 10).map((item) => (
                    <tr key={item.constituent.id}>
                      <td>
                        <div>
                          <div className="font-semibold">
                            {item.constituent.first_name} {item.constituent.last_name}
                          </div>
                          <div className="text-sm text-muted">{item.constituent.email}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${getRiskColor(item.score.renewal_risk)}`}>
                          {item.score.renewal_risk}
                        </span>
                      </td>
                      <td>{item.days_since_touch} days</td>
                      <td>
                        ${(
                          item.constituent.lifetime_giving +
                          item.constituent.lifetime_ticket_spend
                        ).toLocaleString()}
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm">
                          Reach Out
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ask-Ready Prospects */}
        <div className="card mb-lg">
          <div className="card-header">
            <h2 className="card-title">Ask-Ready Prospects</h2>
            <Link to="/major-gifts" className="btn btn-secondary btn-sm">
              View All
            </Link>
          </div>

          {data.ask_ready_prospects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎯</div>
              <h3 className="empty-state-title">No Ask-Ready Prospects</h3>
              <p className="empty-state-description">
                Continue cultivation efforts to move prospects to ready status.
              </p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Constituent</th>
                    <th>Capacity</th>
                    <th>Lifetime Giving</th>
                    <th>Active Opportunity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ask_ready_prospects.slice(0, 10).map((item) => (
                    <tr key={item.constituent.id}>
                      <td>
                        <div>
                          <div className="font-semibold">
                            {item.constituent.first_name} {item.constituent.last_name}
                          </div>
                          <div className="text-sm text-muted">{item.constituent.email}</div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-success">
                          ${(item.score.capacity_estimate / 1000).toFixed(0)}K
                        </span>
                      </td>
                      <td>${item.constituent.lifetime_giving.toLocaleString()}</td>
                      <td>
                        {item.opportunity ? (
                          <span className="badge badge-primary">
                            ${(item.opportunity.amount / 1000).toFixed(0)}K
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm">
                          Generate Proposal
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card mb-lg">
          <div className="card-header">
            <h2 className="card-title">Recent Activity</h2>
          </div>

          {data.recent_activity.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3 className="empty-state-title">No Recent Activity</h3>
              <p className="empty-state-description">
                Interactions will appear here as they occur.
              </p>
            </div>
          ) : (
            <div className="activity-feed">
              {data.recent_activity.slice(0, 10).map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className="activity-icon">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="activity-content">
                    <div className="activity-title">
                      {activity.type.replace('_', ' ')}
                      {activity.constituent && (
                        <span className="text-muted">
                          {' '}
                          - {activity.constituent.first_name} {activity.constituent.last_name}
                        </span>
                      )}
                    </div>
                    {activity.notes && (
                      <div className="activity-notes text-sm text-secondary">
                        {activity.notes}
                      </div>
                    )}
                    <div className="activity-date text-sm text-muted">
                      {new Date(activity.date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Performance Metrics */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">This Month's Performance</h2>
          </div>
          <div className="performance-grid">
            <div className="performance-card">
              <div className="performance-label">Wins</div>
              <div className="performance-value">{data.performance.won_this_month}</div>
              <div className="performance-amount">
                ${(data.performance.won_this_month_amount / 1000).toFixed(0)}K
              </div>
            </div>
            <div className="performance-card">
              <div className="performance-label">Active Pipeline</div>
              <div className="performance-value">{data.performance.active_count}</div>
              <div className="performance-amount">
                ${(data.performance.active_total / 1000000).toFixed(1)}M
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'primary'
    case 'won':
      return 'success'
    case 'lost':
      return 'danger'
    case 'paused':
      return 'warning'
    default:
      return 'info'
  }
}

function getRiskColor(risk: string): string {
  switch (risk) {
    case 'high':
      return 'danger'
    case 'medium':
      return 'warning'
    case 'low':
      return 'success'
    default:
      return 'info'
  }
}

function getActivityIcon(type: string): string {
  switch (type) {
    case 'email':
      return '📧'
    case 'call':
      return '📞'
    case 'meeting':
      return '🤝'
    case 'event':
      return '🎉'
    case 'proposal_sent':
      return '📄'
    default:
      return '📋'
  }
}
