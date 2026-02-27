/**
 * ProtectedRoute Component
 *
 * Wrapper component that requires authentication and optional role permissions.
 */

import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import type { AppRole } from '@/types'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRoles?: AppRole[]
  requireAny?: boolean // If true, user needs ANY of the roles; if false, needs ALL
}

export function ProtectedRoute({
  children,
  requiredRoles,
  requireAny = true,
}: ProtectedRouteProps) {
  const { user, loading, hasRole, hasAnyRole } = useAuth()
  const location = useLocation()

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner" style={{ width: '3rem', height: '3rem', margin: '0 auto' }}></div>
              <p className="mt-md text-muted">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Check role requirements if specified
  if (requiredRoles && requiredRoles.length > 0) {
    const hasPermission = requireAny
      ? hasAnyRole(requiredRoles)
      : requiredRoles.every((role) => hasRole(role))

    if (!hasPermission) {
      return (
        <div className="page">
          <div className="container">
            <div className="card mt-xl">
              <div className="empty-state">
                <div className="empty-state-icon">🔒</div>
                <h2 className="empty-state-title">Access Denied</h2>
                <p className="empty-state-description">
                  You don't have permission to access this page.
                  <br />
                  Required role(s): {requiredRoles.join(', ')}
                </p>
                <p className="text-muted">
                  Your roles: {user.roles.join(', ') || 'None'}
                </p>
                <button
                  className="btn btn-primary mt-lg"
                  onClick={() => window.history.back()}
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
  }

  // Render children if authenticated and authorized
  return <>{children}</>
}
