/**
 * ProposalEditor Component
 *
 * Edit draft proposal content.
 */

import { useState } from 'react'
import type { Proposal } from '@/types'

interface ProposalEditorProps {
  proposal: Proposal
  onSave: (content: string) => Promise<void>
  onCancel: () => void
}

export function ProposalEditor({ proposal, onSave, onCancel }: ProposalEditorProps) {
  const [content, setContent] = useState(proposal.generated_content)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(content)
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="proposal-editor">
      <div className="editor-header">
        <div>
          <h3 className="editor-title">
            Edit Proposal - {proposal.opportunity?.constituent?.first_name}{' '}
            {proposal.opportunity?.constituent?.last_name}
          </h3>
          <p className="text-sm text-muted">
            ${(proposal.amount / 1000).toFixed(0)}K {proposal.opportunity?.type} opportunity
          </p>
        </div>
        <div className="editor-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="editor-body">
        <textarea
          className="proposal-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          placeholder="Enter proposal content..."
        />
      </div>

      <div className="editor-footer">
        <p className="text-sm text-muted">
          {content.length} characters · Last updated:{' '}
          {new Date(proposal.updated_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}
