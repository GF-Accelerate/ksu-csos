/**
 * AppNav Component
 *
 * Main navigation bar with role-based menu items.
 */

import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'

export function AppNav() {
  const { user, isAuthenticated, signOut, hasRole, hasAnyRole } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <nav className="app-nav">
      <div className="container">
        <div className="nav-content">
          <Link to="/dashboard" className="app-logo">
            KSU CSOS
          </Link>

          <ul className="app-nav-links">
            {/* Dashboard - visible to all authenticated users */}
            <li>
              <Link to="/dashboard">Dashboard</Link>
            </li>

            {/* Major Gifts - visible to major_gifts, executive, admin */}
            {hasAnyRole(['major_gifts', 'executive', 'admin']) && (
              <li>
                <Link to="/major-gifts">Major Gifts</Link>
              </li>
            )}

            {/* Ticketing - visible to ticketing, executive, admin */}
            {hasAnyRole(['ticketing', 'executive', 'admin']) && (
              <li>
                <Link to="/ticketing">Ticketing</Link>
              </li>
            )}

            {/* Corporate - visible to corporate, executive, admin */}
            {hasAnyRole(['corporate', 'executive', 'admin']) && (
              <li>
                <Link to="/corporate">Corporate</Link>
              </li>
            )}

            {/* Proposals - visible to all revenue teams */}
            {hasAnyRole(['major_gifts', 'corporate', 'ticketing', 'executive', 'admin']) && (
              <li>
                <Link to="/proposals">Proposals</Link>
              </li>
            )}

            {/* Data Import - visible to revenue_ops, admin */}
            {hasAnyRole(['revenue_ops', 'admin']) && (
              <li>
                <Link to="/import">Import</Link>
              </li>
            )}

            {/* Voice Console - visible to executive, admin */}
            {hasAnyRole(['executive', 'admin']) && (
              <li>
                <Link to="/voice">Voice</Link>
              </li>
            )}

            {/* Admin - visible to admin only */}
            {hasRole('admin') && (
              <li>
                <Link to="/admin/roles">Admin</Link>
              </li>
            )}
          </ul>

          <div className="nav-user">
            <span className="nav-user-email">{user?.email}</span>
            {user?.roles && user.roles.length > 0 && (
              <span className="badge badge-primary">
                {user.roles[0]}
              </span>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
