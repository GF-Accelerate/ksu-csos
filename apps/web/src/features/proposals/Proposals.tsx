/**
 * Proposals Module
 *
 * Proposal lifecycle management - draft, approve, send, track.
 */

import { useState, useEffect } from 'react'
import {
  getProposals,
  getProposalsByStatus,
  updateProposalContent,
  approveProposal,
  rejectProposal,
  sendProposal,
} from '@services/proposalService'
import { ProposalList } from './ProposalList'
import { ProposalEditor } from './ProposalEditor'
import { ProposalApproval } from './ProposalApproval'
import { ProposalPreview } from './ProposalPreview'
import type { Proposal } from '@/types'

type ViewMode = 'list' | 'edit' | 'approve' | 'preview'
type StatusFilter = 'all' | 'draft' | 'pending_approval' | 'approved' | 'sent' | 'rejected'

export function Proposals() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  useEffect(() => {
    loadProposals()
  }, [statusFilter])

  const loadProposals = async () => {
    setLoading(true)
    setError(null)

    try {
      let data: Proposal[]
      if (statusFilter === 'all') {
        const result = await getProposals({ page_size: 100 })
        data = result.data
      } else {
        data = await getProposalsByStatus(statusFilter)
      }
      setProposals(data)
    } catch (err: any) {
      console.error('Failed to load proposals:', err)
      setError(err.message || 'Failed to load proposals')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setShowDetailModal(true)
  }

  const handleEditProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setViewMode('edit')
  }

  const handleApproveProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setViewMode('approve')
  }

  const handleSendProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setViewMode('preview')
  }

  const handleSaveContent = async (content: string) => {
    if (!selectedProposal) return

    try {
      await updateProposalContent(selectedProposal.id, content)
      alert('Proposal saved successfully!')
      setViewMode('list')
      loadProposals()
    } catch (err: any) {
      alert(err.message || 'Failed to save proposal')
    }
  }

  const handleApprove = async (notes?: string) => {
    if (!selectedProposal) return

    try {
      await approveProposal(selectedProposal.id, notes)
      alert('Proposal approved successfully!')
      setViewMode('list')
      loadProposals()
    } catch (err: any) {
      alert(err.message || 'Failed to approve proposal')
    }
  }

  const handleReject = async (reason: string) => {
    if (!selectedProposal) return

    try {
      await rejectProposal(selectedProposal.id, reason)
      alert('Proposal rejected')
      setViewMode('list')
      loadProposals()
    } catch (err: any) {
      alert(err.message || 'Failed to reject proposal')
    }
  }

  const handleSend = async (
    recipientEmail: string,
    options: { ccEmails?: string[]; customMessage?: string }
  ) => {
    if (!selectedProposal) return

    try {
      await sendProposal(selectedProposal.id, recipientEmail, options)
      alert('Proposal sent successfully!')
      setViewMode('list')
      loadProposals()
    } catch (err: any) {
      alert(err.message || 'Failed to send proposal')
    }
  }

  const handleCancelAction = () => {
    setViewMode('list')
    setSelectedProposal(null)
  }

  if (viewMode === 'edit' && selectedProposal) {
    return (
      <div className="page">
        <div className="container">
          <ProposalEditor
            proposal={selectedProposal}
            onSave={handleSaveContent}
            onCancel={handleCancelAction}
          />
        </div>
      </div>
    )
  }

  if (viewMode === 'approve' && selectedProposal) {
    return (
      <div className="page">
        <div className="container">
          <ProposalApproval
            proposal={selectedProposal}
            onApprove={handleApprove}
            onReject={handleReject}
            onCancel={handleCancelAction}
          />
        </div>
      </div>
    )
  }

  if (viewMode === 'preview' && selectedProposal) {
    return (
      <div className="page">
        <div className="container">
          <ProposalPreview
            proposal={selectedProposal}
            onSend={handleSend}
            onCancel={handleCancelAction}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Proposal Management</h1>
          <p className="page-description">Draft, approve, and send proposals</p>
        </div>

        {/* Status Filter */}
        <div className="card mb-lg">
          <div className="filter-bar">
            <div className="filter-group">
              <label>Filter by Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">All Proposals</option>
                <option value="draft">Drafts</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="sent">Sent</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="filter-stats">
              <span className="text-sm text-muted">
                Showing {proposals.length} proposals
              </span>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center" style={{ minHeight: '40vh' }}>
            <div className="text-center">
              <div className="spinner" style={{ width: '3rem', height: '3rem', margin: '0 auto' }}></div>
              <p className="mt-md text-muted">Loading proposals...</p>
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

        {/* Proposal List */}
        {!loading && (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                {statusFilter === 'all' ? 'All Proposals' : `${statusFilter} Proposals`} (
                {proposals.length})
              </h2>
            </div>

            <ProposalList
              proposals={proposals}
              onSelect={handleSelectProposal}
              onEdit={handleEditProposal}
              onApprove={handleApproveProposal}
              onSend={handleSendProposal}
            />
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedProposal && (
          <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">
                  Proposal Details - {selectedProposal.opportunity?.constituent?.first_name}{' '}
                  {selectedProposal.opportunity?.constituent?.last_name}
                </h2>
                <button className="modal-close" onClick={() => setShowDetailModal(false)}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="detail-section">
                  <h3>Proposal Information</h3>
                  <p>
                    <strong>Amount:</strong> ${proposal.amount.toLocaleString()}
                  </p>
                  <p>
                    <strong>Status:</strong>{' '}
                    <span className={`badge badge-${getStatusColor(selectedProposal.status)}`}>
                      {selectedProposal.status}
                    </span>
                  </p>
                  <p>
                    <strong>Created:</strong>{' '}
                    {new Date(selectedProposal.created_at).toLocaleDateString()}
                  </p>
                  {selectedProposal.approved_at && (
                    <p>
                      <strong>Approved:</strong>{' '}
                      {new Date(selectedProposal.approved_at).toLocaleDateString()}
                    </p>
                  )}
                  {selectedProposal.sent_at && (
                    <p>
                      <strong>Sent:</strong>{' '}
                      {new Date(selectedProposal.sent_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Proposal Content</h3>
                  <div className="content-preview">
                    {selectedProposal.generated_content.split('\n').map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'draft':
      return 'warning'
    case 'pending_approval':
      return 'info'
    case 'approved':
      return 'success'
    case 'sent':
      return 'primary'
    case 'rejected':
      return 'danger'
    default:
      return 'secondary'
  }
}
