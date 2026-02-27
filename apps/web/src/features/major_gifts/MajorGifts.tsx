/**
 * Major Gifts Module
 *
 * Constituent management, ask-ready prospects, and proposal generation for major gifts team.
 */

import { useState, useEffect } from 'react'
import { getDonors, searchConstituents, getConstituentWithContext } from '@services/constituentService'
import { getAskReadyConstituents } from '@services/scoreService'
import { getMyOpportunities, createOpportunity } from '@services/opportunityService'
import { generateProposal } from '@services/proposalService'
import { getMyWorkQueue } from '@services/taskService'
import type {
  Constituent,
  OpportunityFormData,
  WorkQueueResponse,
} from '@/types'

type ViewMode = 'prospects' | 'donors' | 'opportunities' | 'queue'

export function MajorGifts() {
  const [viewMode, setViewMode] = useState<ViewMode>('prospects')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Prospects view
  const [prospects, setProspects] = useState<any[]>([])

  // Donors view
  const [donors, setDonors] = useState<Constituent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Constituent[]>([])

  // Opportunities view
  const [opportunities, setOpportunities] = useState<any[]>([])

  // Work queue view
  const [workQueue, setWorkQueue] = useState<WorkQueueResponse | null>(null)

  // Modals
  const [selectedConstituent, setSelectedConstituent] = useState<any | null>(null)
  const [showConstituentDetail, setShowConstituentDetail] = useState(false)
  const [showCreateOpportunity, setShowCreateOpportunity] = useState(false)
  const [creatingProposal, setCreatingProposal] = useState(false)

  // New opportunity form
  const [newOpportunity, setNewOpportunity] = useState<OpportunityFormData>({
    constituent_id: '',
    type: 'major_gift',
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
      if (viewMode === 'prospects') {
        const data = await getAskReadyConstituents(50)
        setProspects(data)
      } else if (viewMode === 'donors') {
        const { data } = await getDonors({ page_size: 50 })
        setDonors(data)
      } else if (viewMode === 'opportunities') {
        const data = await getMyOpportunities()
        setOpportunities(data)
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    try {
      const results = await searchConstituents(searchQuery)
      setSearchResults(results)
    } catch (err: any) {
      console.error('Search failed:', err)
    }
  }

  const handleViewConstituent = async (constituent: Constituent) => {
    setLoading(true)
    try {
      const data = await getConstituentWithContext(constituent.id)
      setSelectedConstituent(data)
      setShowConstituentDetail(true)
    } catch (err: any) {
      console.error('Failed to load constituent:', err)
      setError(err.message || 'Failed to load constituent')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateOpportunity = (constituent: Constituent) => {
    setNewOpportunity({
      constituent_id: constituent.id,
      type: 'major_gift',
      amount: 0,
      description: '',
    })
    setShowCreateOpportunity(true)
  }

  const handleSubmitOpportunity = async () => {
    try {
      await createOpportunity(newOpportunity)
      setShowCreateOpportunity(false)
      loadData()
      alert('Opportunity created successfully!')
    } catch (err: any) {
      console.error('Failed to create opportunity:', err)
      alert(err.message || 'Failed to create opportunity')
    }
  }

  const handleGenerateProposal = async (opportunityId: string) => {
    if (!confirm('Generate proposal for this opportunity?')) return

    setCreatingProposal(true)
    try {
      const result = await generateProposal(opportunityId, 'major_gift')
      alert(`Proposal generated successfully! ID: ${result.proposal_id}`)
      loadData()
    } catch (err: any) {
      console.error('Failed to generate proposal:', err)
      alert(err.message || 'Failed to generate proposal')
    } finally {
      setCreatingProposal(false)
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Major Gifts</h1>
          <p className="page-description">
            Constituent management and proposal generation
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="tabs mb-lg">
          <button
            className={`tab ${viewMode === 'prospects' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('prospects')}
          >
            Ask-Ready Prospects
          </button>
          <button
            className={`tab ${viewMode === 'donors' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('donors')}
          >
            All Donors
          </button>
          <button
            className={`tab ${viewMode === 'opportunities' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('opportunities')}
          >
            My Opportunities
          </button>
          <button
            className={`tab ${viewMode === 'queue' ? 'tab-active' : ''}`}
            onClick={() => setViewMode('queue')}
          >
            Work Queue
          </button>
        </div>

        {/* Search Bar (for donors view) */}
        {viewMode === 'donors' && (
          <div className="card mb-lg">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search constituents by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn-primary" onClick={handleSearch}>
                Search
              </button>
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

        {/* Prospects View */}
        {!loading && viewMode === 'prospects' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Ask-Ready Prospects ({prospects.length})</h2>
            </div>

            {prospects.length === 0 ? (
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
                      <th>Ask Readiness</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((item) => (
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
                          <span className="badge badge-primary">{item.score.ask_readiness}</span>
                        </td>
                        <td>
                          <div className="flex gap-sm">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleViewConstituent(item.constituent)}
                            >
                              View
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleCreateOpportunity(item.constituent)}
                            >
                              Create Opportunity
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Donors View */}
        {!loading && viewMode === 'donors' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                {searchResults.length > 0
                  ? `Search Results (${searchResults.length})`
                  : `All Donors (${donors.length})`}
              </h2>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Lifetime Giving</th>
                    <th>Ticket Holder</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchResults.length > 0 ? searchResults : donors).map((donor) => (
                    <tr key={donor.id}>
                      <td className="font-semibold">
                        {donor.first_name} {donor.last_name}
                      </td>
                      <td className="text-sm">{donor.email}</td>
                      <td>${donor.lifetime_giving.toLocaleString()}</td>
                      <td>
                        {donor.is_ticket_holder ? (
                          <span className="badge badge-info">Yes</span>
                        ) : (
                          <span className="text-muted">No</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleViewConstituent(donor)}
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Opportunities View */}
        {!loading && viewMode === 'opportunities' && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">My Opportunities ({opportunities.length})</h2>
            </div>

            {opportunities.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3 className="empty-state-title">No Active Opportunities</h3>
                <p className="empty-state-description">
                  Create opportunities for ask-ready prospects.
                </p>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Constituent</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Expected Close</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((opp) => (
                      <tr key={opp.id}>
                        <td>
                          <div>
                            <div className="font-semibold">
                              {opp.constituent?.first_name} {opp.constituent?.last_name}
                            </div>
                            <div className="text-sm text-muted">{opp.description}</div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-primary">
                            ${(opp.amount / 1000).toFixed(0)}K
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${opp.status === 'active' ? 'success' : 'warning'}`}>
                            {opp.status}
                          </span>
                        </td>
                        <td className="text-sm">
                          {opp.expected_close_date
                            ? new Date(opp.expected_close_date).toLocaleDateString()
                            : '-'}
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleGenerateProposal(opp.id)}
                            disabled={creatingProposal}
                          >
                            {creatingProposal ? 'Generating...' : 'Generate Proposal'}
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
                <p className="empty-state-description">
                  You have no pending tasks at this time.
                </p>
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

        {/* Constituent Detail Modal */}
        {showConstituentDetail && selectedConstituent && (
          <div className="modal-overlay" onClick={() => setShowConstituentDetail(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">
                  {selectedConstituent.constituent.first_name}{' '}
                  {selectedConstituent.constituent.last_name}
                </h2>
                <button
                  className="modal-close"
                  onClick={() => setShowConstituentDetail(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="constituent-detail">
                  <div className="detail-section">
                    <h3>Contact Information</h3>
                    <p><strong>Email:</strong> {selectedConstituent.constituent.email}</p>
                    <p><strong>Phone:</strong> {selectedConstituent.constituent.phone || 'N/A'}</p>
                    <p><strong>Zip:</strong> {selectedConstituent.constituent.zip || 'N/A'}</p>
                  </div>

                  <div className="detail-section">
                    <h3>Giving History</h3>
                    <p>
                      <strong>Lifetime Giving:</strong> $
                      {selectedConstituent.constituent.lifetime_giving.toLocaleString()}
                    </p>
                    <p>
                      <strong>Ticket Spend:</strong> $
                      {selectedConstituent.constituent.lifetime_ticket_spend.toLocaleString()}
                    </p>
                  </div>

                  {selectedConstituent.score && (
                    <div className="detail-section">
                      <h3>Scores</h3>
                      <p>
                        <strong>Ask Readiness:</strong>{' '}
                        <span className="badge badge-primary">
                          {selectedConstituent.score.ask_readiness}
                        </span>
                      </p>
                      <p>
                        <strong>Capacity:</strong> $
                        {(selectedConstituent.score.capacity_estimate / 1000).toFixed(0)}K
                      </p>
                    </div>
                  )}

                  {selectedConstituent.opportunities.length > 0 && (
                    <div className="detail-section">
                      <h3>Opportunities ({selectedConstituent.opportunities.length})</h3>
                      {selectedConstituent.opportunities.map((opp: any) => (
                        <div key={opp.id} className="opportunity-item">
                          <span className="badge badge-primary">
                            ${(opp.amount / 1000).toFixed(0)}K
                          </span>
                          <span className={`badge badge-${opp.status === 'active' ? 'success' : 'warning'}`}>
                            {opp.status}
                          </span>
                          <span className="text-sm text-muted">{opp.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowConstituentDetail(false)}>
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setShowConstituentDetail(false)
                    handleCreateOpportunity(selectedConstituent.constituent)
                  }}
                >
                  Create Opportunity
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Opportunity Modal */}
        {showCreateOpportunity && (
          <div className="modal-overlay" onClick={() => setShowCreateOpportunity(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Create Opportunity</h2>
                <button className="modal-close" onClick={() => setShowCreateOpportunity(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Ask Amount</label>
                  <input
                    type="number"
                    value={newOpportunity.amount}
                    onChange={(e) =>
                      setNewOpportunity({ ...newOpportunity, amount: Number(e.target.value) })
                    }
                    placeholder="50000"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newOpportunity.description}
                    onChange={(e) =>
                      setNewOpportunity({ ...newOpportunity, description: e.target.value })
                    }
                    placeholder="Annual fund major gift ask"
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Expected Close Date (Optional)</label>
                  <input
                    type="date"
                    onChange={(e) =>
                      setNewOpportunity({ ...newOpportunity, expected_close_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreateOpportunity(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSubmitOpportunity}>
                  Create Opportunity
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
