/**
 * MetricCard Component
 *
 * Reusable metric card for dashboards.
 */

interface MetricCardProps {
  label: string
  value: string | number
  icon?: string
  trend?: {
    value: number
    label: string
  }
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  onClick?: () => void
  className?: string
}

export function MetricCard({
  label,
  value,
  icon,
  trend,
  variant = 'default',
  onClick,
  className = '',
}: MetricCardProps) {
  const variantClasses = {
    default: '',
    primary: 'metric-card-primary',
    success: 'metric-card-success',
    warning: 'metric-card-warning',
    danger: 'metric-card-danger',
  }

  return (
    <div
      className={`metric-card ${variantClasses[variant]} ${onClick ? 'metric-card-clickable' : ''} ${className}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {icon && <div className="metric-icon">{icon}</div>}
      <div className="metric-content">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        {trend && (
          <div className={`metric-trend ${trend.value >= 0 ? 'trend-positive' : 'trend-negative'}`}>
            <span className="trend-arrow">{trend.value >= 0 ? '↑' : '↓'}</span>
            <span className="trend-value">
              {Math.abs(trend.value)}% {trend.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
