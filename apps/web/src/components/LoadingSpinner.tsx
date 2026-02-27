/**
 * LoadingSpinner Component
 *
 * Reusable loading spinner with optional message.
 */

interface LoadingSpinnerProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  centered?: boolean
  className?: string
}

export function LoadingSpinner({
  message = 'Loading...',
  size = 'md',
  centered = true,
  className = '',
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: '1.5rem',
    md: '2rem',
    lg: '3rem',
  }

  const spinnerSize = sizeMap[size]

  const content = (
    <div className={`loading-spinner-container ${className}`}>
      <div className="spinner" style={{ width: spinnerSize, height: spinnerSize }}></div>
      {message && <p className="loading-message text-muted mt-md">{message}</p>}
    </div>
  )

  if (centered) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
        {content}
      </div>
    )
  }

  return content
}
