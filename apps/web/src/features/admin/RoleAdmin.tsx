/**
 * RoleAdmin Component
 *
 * Role management interface for administrators.
 */

import { useState, useEffect } from 'react'
import { supabase } from '@lib/supabase'
import { useRoles } from '@hooks/useRoles'
import { useAuth } from '@hooks/useAuth'
import type { AppRole } from '@/types'

const AVAILABLE_ROLES: AppRole[] = [
  'executive',
  'major_gifts',
  'ticketing',
  'corporate',
  'marketing',
  'revenue_ops',
  'admin',
]

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  executive: 'Full access to all features and data',
  major_gifts: 'Access to major gifts module and constituents',
  ticketing: 'Access to ticketing module and season ticket holders',
  corporate: 'Access to corporate partnerships module',
  marketing: 'Access to marketing and communications features',
  revenue_ops: 'Access to data import and operational tools',
  admin: 'System administrator with all permissions',
}

export function RoleAdmin() {
  const { user: currentUser } = useAuth()
  const { assignRole, removeRole, loading, error } = useRoles()

  const [users, setUsers] = useState<any[]>([])
  const [userRoles, setUserRoles] = useState<Record<string, string[]>>({})
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoadingUsers(true)

    try {
      // Get all users from auth.users (requires service role, so we'll use a simpler approach)
      // In production, this should call an Edge Function that uses service role
      // For now, we'll get users from user_role table
      const { data: roleData, error: roleError } = await supabase
        .from('user_role')
        .select('user_id, role')

      if (roleError) throw roleError

      // Group roles by user
      const rolesByUser: Record<string, string[]> = {}
      const uniqueUserIds = new Set<string>()

      roleData?.forEach((assignment) => {
        uniqueUserIds.add(assignment.user_id)
        if (!rolesByUser[assignment.user_id]) {
          rolesByUser[assignment.user_id] = []
        }
        rolesByUser[assignment.user_id].push(assignment.role)
      })

      // For demo purposes, create user objects
      // In production, fetch actual user data from auth.users via Edge Function
      const userList = Array.from(uniqueUserIds).map((userId) => ({
        id: userId,
        email: `user-${userId.substring(0, 8)}@ksu.edu`, // Placeholder
        created_at: new Date().toISOString(),
      }))

      setUsers(userList)
      setUserRoles(rolesByUser)
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleAssignRole = async (userId: string, role: AppRole) => {
    try {
      await assignRole(userId, role)
      setSuccessMessage(`Successfully assigned ${role} to user`)
      setTimeout(() => setSuccessMessage(null), 3000)

      // Refresh user roles
      await loadUsers()
    } catch (err) {
      console.error('Failed to assign role:', err)
    }
  }

  const handleRemoveRole = async (userId: string, role: AppRole) => {
    // Prevent removing admin role from self
    if (userId === currentUser?.id && role === 'admin') {
      alert('You cannot remove your own admin role')
      return
    }

    if (!confirm(`Remove ${role} from this user?`)) {
      return
    }

    try {
      await removeRole(userId, role)
      setSuccessMessage(`Successfully removed ${role} from user`)
      setTimeout(() => setSuccessMessage(null), 3000)

      // Refresh user roles
      await loadUsers()
    } catch (err) {
      console.error('Failed to remove role:', err)
    }
  }

  if (loadingUsers) {
    return (
      <div className="page">
        <div className="container">
          <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
            <div className="text-center">
              <div className="spinner" style={{ width: '3rem', height: '3rem', margin: '0 auto' }}></div>
              <p className="mt-md text-muted">Loading users...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Role Administration</h1>
          <p className="page-description">
            Manage user roles and permissions
          </p>
        </div>

        {successMessage && (
          <div className="alert alert-success mb-lg">
            <span className="alert-icon">✓</span>
            <span className="alert-message">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error mb-lg">
            <span className="alert-icon">⚠️</span>
            <span className="alert-message">{error}</span>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Users ({users.length})</h2>
          </div>

          {users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3 className="empty-state-title">No Users Found</h3>
              <p className="empty-state-description">
                No users with role assignments found.
              </p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="text-sm text-muted">
                        {user.id.substring(0, 8)}...
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                          {userRoles[user.id]?.map((role) => (
                            <span
                              key={role}
                              className="badge badge-primary"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleRemoveRole(user.id, role as AppRole)}
                              title={`Click to remove ${role}`}
                            >
                              {role} ×
                            </span>
                          )) || (
                            <span className="text-muted text-sm">No roles</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedUser(
                            selectedUser === user.id ? null : user.id
                          )}
                        >
                          {selectedUser === user.id ? 'Cancel' : 'Assign Role'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Role Assignment Panel */}
        {selectedUser && (
          <div className="card mt-lg">
            <div className="card-header">
              <h3 className="card-title">Assign Role</h3>
            </div>

            <div className="role-grid">
              {AVAILABLE_ROLES.map((role) => {
                const hasRole = userRoles[selectedUser]?.includes(role)

                return (
                  <div key={role} className="role-card">
                    <div className="role-card-header">
                      <h4 className="role-card-title">{role}</h4>
                      {hasRole && (
                        <span className="badge badge-success">Active</span>
                      )}
                    </div>
                    <p className="role-card-description text-sm text-secondary">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                    <button
                      className={`btn btn-sm ${hasRole ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() =>
                        hasRole
                          ? handleRemoveRole(selectedUser, role)
                          : handleAssignRole(selectedUser, role)
                      }
                      disabled={loading}
                    >
                      {hasRole ? 'Remove' : 'Assign'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Role Reference */}
        <div className="card mt-lg">
          <div className="card-header">
            <h3 className="card-title">Role Reference</h3>
          </div>

          <div className="role-reference">
            {AVAILABLE_ROLES.map((role) => (
              <div key={role} className="role-reference-item">
                <h4 className="font-semibold">{role}</h4>
                <p className="text-sm text-secondary">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
