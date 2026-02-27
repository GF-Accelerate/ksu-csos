/**
 * Ticketing Module
 *
 * Season ticket holder management, renewal risk tracking, and retention efforts.
 */

import { useState, useEffect } from 'react'
import { getTicketHolders } from '@services/constituentService'
import { getConstituentsByRenewalRisk, getRenewalRisksWithTouchInfo } from '@services/scoreService'
import { getMyWorkQueue } from '@services/taskService'
import type { Constituent, WorkQueueResponse } from '@/types'

type ViewMode = 'renewal_risks' | 'season_holders' | 'premium' | 'queue'
type RiskFilter = 'all' | 'high' | 'medium' | 'low'
type SportFilter = 'all' | 'football' | 'basketball' | 'baseball' | 'other'

export function Ticketing() {
  const [viewMode, setViewMode] = useState<ViewMode>('renewal_risks')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [sportFilter, setSportFilter] = useState<SportFilter>('all')

  // Data
  const [renewalRisks, setRenewalRisks] = useState<any[]>([])
  const [seasonHolders, setSeasonHolders] = useState<Constituent[]>([])
  const [premiumHolders, setPremiumHolders] = useState<Constituent[]>([])
  const [workQueue, setWorkQueue] = useState<WorkQueueResponse | null>(null)

  useEffect(() => {
    loadData()
  }, [viewMode, riskFilter])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      if (viewMode === 'renewal_risks') {
        if (riskFilter === 'all') {
          const data = await getRenewalRisksWithTouchInfo(100)
          setRenewalRisks(data)
        } else {
          const data = await getConstituentsByRenewalRisk(riskFilter, 100)
          setRenewalRisks(
            data.map((item) => ({
              constituent: item.constituent,
              score: item.score,
              days_since_touch: 0, // Will need to calculate separately
            }))
          )
        }
      } else if (viewMode === 'season_holders') {
        const { data } = await getTicketHolders({ page_size: 100 })
        setSeasonHolders(data)
      } else if (viewMode === 'premium') {
        const { data } = await getTicketHolders({
          page_size: 50,
          sort: { field: 'lifetime_ticket_spend', direction: 'desc' },
        })
        // Filter for premium (>$10k lifetime spend)
        setPremiumHolders(data.filter((h) => h.lifetime_ticket_spend >= 10000))
      } else if (viewMode === 'queue') {
        const data = await getMyWorkQueue()
        setWorkQueue(data)
      }
    } catch (err: any) {
      console.error('Failed to load data:', err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const filteredSeasonHolders =
    sportFilter === 'all'
      ? seasonHolders
      : seasonHolders.filter((h) => h.sport_affinity === sportFilter)

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Ticketing</h1>
          <p className="page-description">
            Season ticket holder management and renewal tracking
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="tabs mb-lg">
          <button
            className={`tab ${viewMode === 'renewal_risks' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('renewal_risks')}
          >
            Renewal Risks
          </button>
          <button
            className={`tab ${viewMode === 'season_holders' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('season_holders')}
          >
            Season Ticket Holders
          </button>
          <button
            className={`tab ${viewMode === 'premium' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('premium')}
          >
            Premium Holders
          </button>
          <button
            className={`tab ${viewMode === 'queue' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('queue')}
          >
            Work Queue
          </button>
        </div>

        {/* Filters */}
        {viewMode === 'renewal_risks' && (
          <div className="card mb-lg">
            <div className="filter-bar">
              <div className="filter-group">
                <label>Risk Level</label>
                <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}>
                  <option value="all">All Levels</option>
                  <option value="high">High Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="low">Low Risk</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'season_holders' && (
          <div className="card mb-lg">
            <div className="filter-bar">
              <div className="filter-group">
                <label>Sport Affinity</label>
                <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value as SportFilter)}>
                  <option value="all">All Sports</option>
                  <option value="football">Football</option>
                  <option value="basketball">Basketball</option>
                  <option value="baseball">Baseball</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center" style={{ minHeight: '40vh' }}>
            <div className="text-center">
              <div className="spinner" style={{ width: '3rem', height: '3rem', margin: '0 auto' }}></div>
              <p className="mt-md text-muted">Loading...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span className="alert-message">{error}</span>
          </div>
        )}

        {/* Renewal Risks View */}
        {!loading && viewMode === 'renewal_risks' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                Renewal Risks ({renewalRisks.length})
                {riskFilter !== 'all' && <span className="text-muted"> - {riskFilter} risk</span>}
              </h2>
            </div>

            {renewalRisks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✓</div>
                <h3 className="empty-state-title">No Renewal Risks</h3>
                <p className="empty-state-description">
                  All ticket holders are engaged and up to date.
                </p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticket Holder</th>
                      <th>Risk Level</th>
                      <th>Days Since Touch</th>
                      <th>Lifetime Spend</th>
                      <th>Sport Affinity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalRisks.map((item) => (
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
                          <span
                            className={`badge badge-${
                              item.score.renewal_risk === 'high'
                                ? 'danger'
                                : item.score.renewal_risk === 'medium'
                                ? 'warning'
                                : 'success'
                            }`}
                          >
                            {item.score.renewal_risk}
                          </span>
                        </td>
                        <td>{item.days_since_touch || 0} days</td>
                        <td>${item.constituent.lifetime_ticket_spend.toLocaleString()}</td>
                        <td>
                          <span className="badge badge-info">{item.constituent.sport_affinity || 'N/A'}</span>
                        </td>
                        <td>
                          <button className="btn btn-primary btn-sm">Reach Out</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Season Ticket Holders View */}
        {!loading && viewMode === 'season_holders' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                Season Ticket Holders ({filteredSeasonHolders.length})
                {sportFilter !== 'all' && <span className="text-muted"> - {sportFilter}</span>}
              </h2>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Sport Affinity</th>
                    <th>Lifetime Spend</th>
                    <th>Donor</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSeasonHolders.map((holder) => (
                    <tr key={holder.id}>
                      <td className="font-semibold">
                        {holder.first_name} {holder.last_name}
                      </td>
                      <td className="text-sm">{holder.email}</td>
                      <td>
                        <span className="badge badge-info">{holder.sport_affinity || 'N/A'}</span>
                      </td>
                      <td>${holder.lifetime_ticket_spend.toLocaleString()}</td>
                      <td>
                        {holder.is_donor ? (
                          <span className="badge badge-success">
                            ${holder.lifetime_giving.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted">No</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm">View Profile</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Premium Holders View */}
        {!loading && viewMode === 'premium' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Premium Holders ({premiumHolders.length})</h2>
              <p className="text-sm text-muted">Lifetime ticket spend &gt; $10,000</p>
            </div>

            {premiumHolders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎫</div>
                <h3 className="empty-state-title">No Premium Holders</h3>
                <p className="empty-state-description">
                  No ticket holders with lifetime spend over $10,000.
                </p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Lifetime Spend</th>
                      <th>Sport Affinity</th>
                      <th>Also Donor</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premiumHolders.map((holder) => (
                      <tr key={holder.id}>
                        <td className="font-semibold">
                          {holder.first_name} {holder.last_name}
                        </td>
                        <td className="text-sm">{holder.email}</td>
                        <td>
                          <span className="badge badge-success">
                            ${holder.lifetime_ticket_spend.toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-info">{holder.sport_affinity || 'N/A'}</span>
                        </td>
                        <td>
                          {holder.is_donor ? (
                            <span className="badge badge-primary">
                              ${holder.lifetime_giving.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted">No</span>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-primary btn-sm">Upgrade Offer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Work Queue View */}
        {!loading && viewMode === 'queue' && workQueue && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">My Work Queue ({workQueue.total})</h2>
            </div>

            {workQueue.tasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✓</div>
                <h3 className="empty-state-title">All Caught Up!</h3>
                <p className="empty-state-description">You have no pending tasks at this time.</p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Type</th>
                      <th>Priority</th>
                      <th>Due Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workQueue.tasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <div>
                            <div className="font-semibold">{task.title}</div>
                            <div className="text-sm text-muted">{task.description}</div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-info">{task.type}</span>
                        </td>
                        <td>
                          <span
                            className={`badge badge-${
                              task.priority === 'high'
                                ? 'danger'
                                : task.priority === 'medium'
                                ? 'warning'
                                : 'success'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="text-sm">
                          {task.due_at ? new Date(task.due_at).toLocaleDateString() : '-'}
                        </td>
                        <td>
                          <button className="btn btn-primary btn-sm">Complete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
