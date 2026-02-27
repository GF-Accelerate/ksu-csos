/**
 * StatusBadge Component
 *
 * Reusable status badge with color mapping.
 */

type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'

interface StatusBadgeProps {
  status: string
  variant?: BadgeVariant
  colorMap?: Record<string, BadgeVariant>
  className?: string
}

const defaultColorMap: Record<string, BadgeVariant> = {
  // Opportunity status
  active: 'primary',
  won: 'success',
  lost: 'danger',
  paused: 'secondary',

  // Proposal status
  draft: 'warning',
  pending_approval: 'info',
  approved: 'success',
  sent: 'primary',
  rejected: 'danger',

  // Task priority
  high: 'danger',
  medium: 'warning',
  low: 'info',

  // Task status
  open: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'secondary',

  // Renewal risk
  'high risk': 'danger',
  'medium risk': 'warning',
  'low risk': 'info',

  // Ask readiness
  ready: 'success',
  not_ready: 'secondary',
}

export function StatusBadge({
  status,
  variant,
  colorMap = defaultColorMap,
  className = '',
}: StatusBadgeProps) {
  const badgeVariant = variant || colorMap[status.toLowerCase()] || 'secondary'

  return (
    <span className={`badge badge-${badgeVariant} ${className}`}>
      {status}
    </span>
  )
}
