/**
 * Corporate Module
 *
 * Corporate partnership management, sponsorship opportunities, and deal tracking.
 */

import { useState, useEffect } from 'react'
import { getCorporateContacts } from '@services/constituentService'
import { getConstituentsByCorporatePropensity } from '@services/scoreService'
import { getActiveOpportunitiesByType, createOpportunity } from '@services/opportunityService'
import { getMyWorkQueue } from '@services/taskService'
import type { Constituent, WorkQueueResponse, OpportunityFormData } from '@/types'

type ViewMode = 'partnerships' | 'prospects' | 'pricing' | 'queue'
type DealSize = 'platinum' | 'gold' | 'silver' | 'bronze'

const PRICING_TIERS = {
  platinum: {
    name: 'Platinum Partnership',
    basePrice: 250000,
    benefits: [
      'Premier logo placement on field/court',
      '20 suite tickets per game',
      'Exclusive hospitality events',
      'Digital media package',
      'Community engagement opportunities',
    ],
  },
  gold: {
    name: 'Gold Partnership',
    basePrice: 100000,
    benefits: [
      'Logo placement on concourse',
      '10 suite tickets per game',
      'Hospitality event access',
      'Social media features',
      'Community program participation',
    ],
  },
  silver: {
    name: 'Silver Partnership',
    basePrice: 50000,
    benefits: [
      'Signage at venue',
      '4 premium seats per game',
      'Pre-game hospitality',
      'Digital mentions',
      'Community involvement',
    ],
  },
  bronze: {
    name: 'Bronze Partnership',
    basePrice: 25000,
    benefits: [
      'Logo on website',
      '2 premium seats per game',
      'Social media recognition',
      'Community access',
    ],
  },
}

export function Corporate() {
  const [viewMode, setViewMode] = useState<ViewMode>('partnerships')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data
  const [partnerships, setPartnerships] = useState<any[]>([])
  const [prospects, setProspects] = useState<any[]>([])
  const [workQueue, setWorkQueue] = useState<WorkQueueResponse | null>(null)

  // Pricing calculator
  const [selectedTier, setSelectedTier] = useState<DealSize>('gold')
  const [sportMultiplier, setSportMultiplier] = useState(1.0)
  const [durationYears, setDurationYears] = useState(3)

  // Modal
  const [showCreatePartnership, setShowCreatePartnership] = useState(false)
  const [selectedProspect, setSelectedProspect] = useState<Constituent | null>(null)
  const [newPartnership, setNewPartnership] = useState<OpportunityFormData>({
    constituent_id: '',
    type: 'corporate',
    amount: 0,
    description: '',
  })

  useEffect(() => {
    loadData()
  }, [viewMode])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      if (viewMode === 'partnerships') {
        const data = await getActiveOpportunitiesByType('corporate')
        setPartnerships(data)
      } else if (viewMode === 'prospects') {
        const data = await getConstituentsByCorporatePropensity(50, 100)
        setProspects(data)
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

  const handleCreatePartnership = (prospect: Constituent) => {
    setSelectedProspect(prospect)
    setNewPartnership({
      constituent_id: prospect.id,
      type: 'corporate',
      amount: 0,
      description: '',
    })
    setShowCreatePartnership(true)
  }

  const handleSubmitPartnership = async () => {
    try {
      await createOpportunity(newPartnership)
      setShowCreatePartnership(false)
      loadData()
      alert('Partnership opportunity created successfully!')
    } catch (err: any) {
      console.error('Failed to create partnership:', err)
      alert(err.message || 'Failed to create partnership')
    }
  }

  const calculatePrice = () => {
    const basePrice = PRICING_TIERS[selectedTier].basePrice
    const totalPrice = basePrice * sportMultiplier * durationYears
    return totalPrice
  }

  const calculateAnnualPrice = () => {
    const basePrice = PRICING_TIERS[selectedTier].basePrice
    return basePrice * sportMultiplier
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Corporate Partnerships</h1>
          <p className="page-description">Sponsorship opportunities and partnership management</p>
        </div>

        {/* View Mode Tabs */}
        <div className="tabs mb-lg">
          <button
            className={`tab ${viewMode === 'partnerships' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('partnerships')}
          >
            Active Partnerships
          </button>
          <button
            className={`tab ${viewMode === 'prospects' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('prospects')}
          >
            Corporate Prospects
          </button>
          <button
            className={`tab ${viewMode === 'pricing' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('pricing')}
          >
            Pricing Calculator
          </button>
          <button
            className={`tab ${viewMode === 'queue' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('queue')}
          >
            Work Queue
          </button>
        </div>

        {/* Loading State */}
        {loading && viewMode !== 'pricing' && (
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

        {/* Active Partnerships View */}
        {!loading && viewMode === 'partnerships' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Active Partnerships ({partnerships.length})</h2>
            </div>

            {partnerships.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏢</div>
                <h3 className="empty-state-title">No Active Partnerships</h3>
                <p className="empty-state-description">
                  Create partnership opportunities for corporate prospects.
                </p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Partnership Value</th>
                      <th>Status</th>
                      <th>Expected Close</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerships.map((partnership) => (
                      <tr key={partnership.id}>
                        <td>
                          <div>
                            <div className="font-semibold">
                              {partnership.constituent?.first_name} {partnership.constituent?.last_name}
                            </div>
                            <div className="text-sm text-muted">{partnership.description}</div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-success">
                            ${(partnership.amount / 1000).toFixed(0)}K
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge badge-${partnership.status === 'active' ? 'primary' : 'warning'}`}
                          >
                            {partnership.status}
                          </span>
                        </td>
                        <td className="text-sm">
                          {partnership.expected_close_date
                            ? new Date(partnership.expected_close_date).toLocaleDateString()
                            : '-'}
                        </td>
                        <td>
                          <button className="btn btn-primary btn-sm">View Details</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Corporate Prospects View */}
        {!loading && viewMode === 'prospects' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Corporate Prospects ({prospects.length})</h2>
            </div>

            {prospects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎯</div>
                <h3 className="empty-state-title">No Corporate Prospects</h3>
                <p className="empty-state-description">Corporate prospects will appear here.</p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Company Contact</th>
                      <th>Email</th>
                      <th>Corporate Propensity</th>
                      <th>Current Engagement</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((item) => (
                      <tr key={item.constituent.id}>
                        <td className="font-semibold">
                          {item.constituent.first_name} {item.constituent.last_name}
                        </td>
                        <td className="text-sm">{item.constituent.email}</td>
                        <td>
                          <span className="badge badge-info">{item.score.corporate_propensity}/100</span>
                        </td>
                        <td>
                          {item.constituent.is_ticket_holder && (
                            <span className="badge badge-success">Ticket Holder</span>
                          )}
                          {item.constituent.is_donor && (
                            <span className="badge badge-primary">Donor</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleCreatePartnership(item.constituent)}
                          >
                            Create Partnership
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Pricing Calculator View */}
        {viewMode === 'pricing' && (
          <div className="pricing-calculator">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Partnership Pricing Calculator</h2>
              </div>

              <div className="pricing-form">
                <div className="form-group">
                  <label>Partnership Tier</label>
                  <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value as DealSize)}>
                    <option value="platinum">Platinum ($250K base)</option>
                    <option value="gold">Gold ($100K base)</option>
                    <option value="silver">Silver ($50K base)</option>
                    <option value="bronze">Bronze ($25K base)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Sport Focus (Multiplier)</label>
                  <select value={sportMultiplier} onChange={(e) => setSportMultiplier(Number(e.target.value))}>
                    <option value="1.5">Football (1.5x)</option>
                    <option value="1.2">Men's Basketball (1.2x)</option>
                    <option value="1.0">Women's Basketball (1.0x)</option>
                    <option value="0.8">Baseball (0.8x)</option>
                    <option value="0.7">Other Sports (0.7x)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Contract Duration (Years)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={durationYears}
                    onChange={(e) => setDurationYears(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{PRICING_TIERS[selectedTier].name}</h2>
              </div>

              <div className="pricing-summary">
                <div className="pricing-item">
                  <span className="pricing-label">Annual Value:</span>
                  <span className="pricing-value">${calculateAnnualPrice().toLocaleString()}</span>
                </div>
                <div className="pricing-item">
                  <span className="pricing-label">Contract Duration:</span>
                  <span className="pricing-value">{durationYears} years</span>
                </div>
                <div className="pricing-item total">
                  <span className="pricing-label">Total Contract Value:</span>
                  <span className="pricing-value">${calculatePrice().toLocaleString()}</span>
                </div>
              </div>

              <div className="benefits-list">
                <h3>Benefits Included:</h3>
                <ul>
                  {PRICING_TIERS[selectedTier].benefits.map((benefit, index) => (
                    <li key={index}>✓ {benefit}</li>
                  ))}
                </ul>
              </div>
            </div>
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

        {/* Create Partnership Modal */}
        {showCreatePartnership && selectedProspect && (
          <div className="modal-overlay" onClick={() => setShowCreatePartnership(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Create Partnership Opportunity</h2>
                <button className="modal-close" onClick={() => setShowCreatePartnership(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-md">
                  <strong>Company Contact:</strong> {selectedProspect.first_name}{' '}
                  {selectedProspect.last_name}
                </p>
                <div className="form-group">
                  <label>Partnership Value</label>
                  <input
                    type="number"
                    value={newPartnership.amount}
                    onChange={(e) =>
                      setNewPartnership({ ...newPartnership, amount: Number(e.target.value) })
                    }
                    placeholder="100000"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newPartnership.description}
                    onChange={(e) =>
                      setNewPartnership({ ...newPartnership, description: e.target.value })
                    }
                    placeholder="Gold partnership - Men's Basketball"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Expected Close Date (Optional)</label>
                  <input
                    type="date"
                    onChange={(e) =>
                      setNewPartnership({ ...newPartnership, expected_close_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreatePartnership(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSubmitPartnership}>
                  Create Partnership
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
