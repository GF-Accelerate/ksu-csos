/**
 * ProposalList Component
 *
 * List and filter proposals by status.
 */

import type { Proposal } from '@/types'

interface ProposalListProps {
  proposals: Proposal[]
  onSelect: (proposal: Proposal) => void
  onEdit: (proposal: Proposal) => void
  onApprove: (proposal: Proposal) => void
  onSend: (proposal: Proposal) => void
}

export function ProposalList({ proposals, onSelect, onEdit, onApprove, onSend }: ProposalListProps) {
  if (proposals.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📄</div>
        <h3 className="empty-state-title">No Proposals</h3>
        <p className="empty-state-description">
          Generate proposals from opportunities to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((proposal) => (
            <tr key={proposal.id} onClick={() => onSelect(proposal)}>
              <td>
                <div>
                  <div className="font-semibold">
                    {proposal.opportunity?.constituent?.first_name}{' '}
                    {proposal.opportunity?.constituent?.last_name}
                  </div>
                  <div className="text-sm text-muted">
                    {proposal.opportunity?.description || 'No description'}
                  </div>
                </div>
              </td>
              <td>
                <span className="badge badge-primary">
                  ${(proposal.amount / 1000).toFixed(0)}K
                </span>
              </td>
              <td>
                <span className={`badge badge-${getStatusColor(proposal.status)}`}>
                  {proposal.status}
                </span>
              </td>
              <td className="text-sm">
                {new Date(proposal.created_at).toLocaleDateString()}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-sm">
                  {proposal.status === 'draft' && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onEdit(proposal)}
                    >
                      Edit
                    </button>
                  )}
                  {proposal.status === 'pending_approval' && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onApprove(proposal)}
                    >
                      Review
                    </button>
                  )}
                  {proposal.status === 'approved' && (
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => onSend(proposal)}
                    >
                      Send
                    </button>
                  )}
                  {proposal.status === 'sent' && (
                    <span className="text-muted text-sm">
                      Sent {new Date(proposal.sent_at!).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
