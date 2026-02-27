/**
 * ConstituentTable Component
 *
 * Reusable table for displaying constituents with configurable columns and actions.
 */

import type { Constituent } from '@/types'

export interface ConstituentTableColumn {
  key: string
  label: string
  render?: (constituent: Constituent) => React.ReactNode
  className?: string
}

export interface ConstituentTableAction {
  label: string
  onClick: (constituent: Constituent) => void
  className?: string
  show?: (constituent: Constituent) => boolean
}

interface ConstituentTableProps {
  constituents: Constituent[]
  columns?: ConstituentTableColumn[]
  actions?: ConstituentTableAction[]
  onRowClick?: (constituent: Constituent) => void
  emptyMessage?: string
  className?: string
}

const defaultColumns: ConstituentTableColumn[] = [
  {
    key: 'name',
    label: 'Name',
    render: (c) => (
      <div>
        <div className="font-semibold">
          {c.first_name} {c.last_name}
        </div>
        <div className="text-sm text-muted">{c.email || 'No email'}</div>
      </div>
    ),
  },
  {
    key: 'type',
    label: 'Type',
    render: (c) => (
      <div className="flex gap-sm">
        {c.is_donor && <span className="badge badge-success">Donor</span>}
        {c.is_ticket_holder && <span className="badge badge-info">Ticket Holder</span>}
        {c.is_corporate && <span className="badge badge-warning">Corporate</span>}
      </div>
    ),
  },
  {
    key: 'lifetime_value',
    label: 'Lifetime Value',
    render: (c) => {
      const value = (c.lifetime_giving || 0) + (c.lifetime_ticket_spend || 0)
      return <span className="font-semibold">${value.toLocaleString()}</span>
    },
  },
]

export function ConstituentTable({
  constituents,
  columns = defaultColumns,
  actions = [],
  onRowClick,
  emptyMessage = 'No constituents found',
  className = '',
}: ConstituentTableProps) {
  if (constituents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👤</div>
        <h3 className="empty-state-title">No Constituents</h3>
        <p className="empty-state-description">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className={`data-table-wrapper ${className}`}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.label}
              </th>
            ))}
            {actions.length > 0 && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {constituents.map((constituent) => (
            <tr
              key={constituent.id}
              onClick={onRowClick ? () => onRowClick(constituent) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render ? col.render(constituent) : (constituent as any)[col.key]}
                </td>
              ))}
              {actions.length > 0 && (
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-sm">
                    {actions
                      .filter((action) => !action.show || action.show(constituent))
                      .map((action, idx) => (
                        <button
                          key={idx}
                          className={action.className || 'btn btn-sm btn-secondary'}
                          onClick={() => action.onClick(constituent)}
                        >
                          {action.label}
                        </button>
                      ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
