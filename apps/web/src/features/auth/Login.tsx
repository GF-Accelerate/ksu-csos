/**
 * Login Page
 *
 * User authentication interface.
 */

import { useState, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Get redirect path from location state (or default to dashboard)
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      await signIn({ email, password })
      // Navigate to original destination or dashboard
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.')
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card card">
          <div className="login-header">
            <h1 className="login-title">KSU CSOS</h1>
            <p className="login-subtitle">College Sports Operating System</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-error">
                <span className="alert-icon">⚠️</span>
                <span className="alert-message">{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@ksu.edu"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-md">
                  <span className="spinner"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p className="text-sm text-muted">
              Kansas State University Athletics
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Styles can be added to App.css or a separate Login.css
