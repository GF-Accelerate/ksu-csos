/**
 * ProposalApproval Component
 *
 * Approve or reject proposals.
 */

import { useState } from 'react'
import type { Proposal } from '@/types'

interface ProposalApprovalProps {
  proposal: Proposal
  onApprove: (notes?: string) => Promise<void>
  onReject: (reason: string) => Promise<void>
  onCancel: () => void
}

export function ProposalApproval({ proposal, onApprove, onReject, onCancel }: ProposalApprovalProps) {
  const [notes, setNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [processing, setProcessing] = useState(false)

  const handleApprove = async () => {
    if (!confirm('Approve this proposal?')) return

    setProcessing(true)
    try {
      await onApprove(notes || undefined)
    } catch (error) {
      console.error('Failed to approve:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection')
      return
    }

    if (!confirm('Reject this proposal? This action cannot be undone.')) return

    setProcessing(true)
    try {
      await onReject(rejectionReason)
    } catch (error) {
      console.error('Failed to reject:', error)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="proposal-approval">
      <div className="approval-header">
        <h3 className="approval-title">
          Review Proposal - {proposal.opportunity?.constituent?.first_name}{' '}
          {proposal.opportunity?.constituent?.last_name}
        </h3>
        <p className="text-sm text-muted">
          ${(proposal.amount / 1000).toFixed(0)}K {proposal.opportunity?.type} · Created{' '}
          {new Date(proposal.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="approval-body">
        <div className="proposal-content">
          <h4>Proposal Content</h4>
          <div className="content-preview">
            {proposal.generated_content.split('\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>

        {!showRejectForm ? (
          <div className="approval-form">
            <div className="form-group">
              <label>Approval Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this approval..."
                rows={3}
                disabled={processing}
              />
            </div>

            <div className="approval-actions">
              <button className="btn btn-secondary" onClick={onCancel} disabled={processing}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setShowRejectForm(true)}
                disabled={processing}
              >
                Reject
              </button>
              <button className="btn btn-success" onClick={handleApprove} disabled={processing}>
                {processing ? 'Approving...' : 'Approve Proposal'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rejection-form">
            <div className="form-group">
              <label>Reason for Rejection *</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this proposal is being rejected..."
                rows={4}
                disabled={processing}
                required
              />
            </div>

            <div className="approval-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRejectForm(false)}
                disabled={processing}
              >
                Back
              </button>
              <button className="btn btn-danger" onClick={handleReject} disabled={processing}>
                {processing ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
