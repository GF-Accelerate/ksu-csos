/**
 * ProposalPreview Component
 *
 * Preview and send approved proposals.
 */

import { useState } from 'react'
import type { Proposal } from '@/types'

interface ProposalPreviewProps {
  proposal: Proposal
  onSend: (recipientEmail: string, options: { ccEmails?: string[]; customMessage?: string }) => Promise<void>
  onCancel: () => void
}

export function ProposalPreview({ proposal, onSend, onCancel }: ProposalPreviewProps) {
  const [recipientEmail, setRecipientEmail] = useState(
    proposal.opportunity?.constituent?.email || ''
  )
  const [ccEmails, setCcEmails] = useState('')
  const [customMessage, setCustomMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!recipientEmail.trim()) {
      alert('Please provide a recipient email')
      return
    }

    if (!confirm(`Send proposal to ${recipientEmail}?`)) return

    setSending(true)
    try {
      const ccList = ccEmails
        .split(',')
        .map((e) => e.trim())
        .filter((e) => e.length > 0)

      await onSend(recipientEmail, {
        ccEmails: ccList.length > 0 ? ccList : undefined,
        customMessage: customMessage || undefined,
      })
    } catch (error) {
      console.error('Failed to send:', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="proposal-preview">
      <div className="preview-header">
        <h3 className="preview-title">
          Send Proposal - {proposal.opportunity?.constituent?.first_name}{' '}
          {proposal.opportunity?.constituent?.last_name}
        </h3>
        <p className="text-sm text-muted">
          ${(proposal.amount / 1000).toFixed(0)}K {proposal.opportunity?.type} · Approved{' '}
          {proposal.approved_at && new Date(proposal.approved_at).toLocaleDateString()}
        </p>
      </div>

      <div className="preview-body">
        <div className="send-form">
          <div className="form-group">
            <label>Recipient Email *</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="constituent@example.com"
              disabled={sending}
              required
            />
          </div>

          <div className="form-group">
            <label>CC Emails (comma-separated)</label>
            <input
              type="text"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="colleague1@ksu.edu, colleague2@ksu.edu"
              disabled={sending}
            />
          </div>

          <div className="form-group">
            <label>Custom Cover Message (Optional)</label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a personal message to accompany the proposal..."
              rows={3}
              disabled={sending}
            />
          </div>
        </div>

        <div className="proposal-content">
          <h4>Proposal Content</h4>
          <div className="content-preview">
            {proposal.generated_content.split('\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="preview-footer">
        <button className="btn btn-secondary" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
        <button className="btn btn-success" onClick={handleSend} disabled={sending}>
          {sending ? 'Sending...' : 'Send Proposal'}
        </button>
      </div>
    </div>
  )
}
