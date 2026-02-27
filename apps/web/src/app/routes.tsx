import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { Login } from '@/features/auth/Login'
import { RoleAdmin } from '@/features/admin/RoleAdmin'
import { ExecDashboard } from '@/features/exec_dashboard/ExecDashboard'
import { MajorGifts } from '@/features/major_gifts/MajorGifts'
import { Ticketing } from '@/features/ticketing/Ticketing'
import { Corporate } from '@/features/corporate/Corporate'
import { Proposals } from '@/features/proposals/Proposals'
import { DataImport } from '@/features/admin/DataImport'
import { VoiceConsole } from '@/features/voice_console/VoiceConsole'

// Placeholder components (will be built in later tasks)

const NotFound = () => (
  <div className="page">
    <div className="container">
      <div className="card mt-xl">
        <div className="empty-state">
          <div className="empty-state-icon">404</div>
          <h2 className="empty-state-title">Page Not Found</h2>
          <p className="empty-state-description">
            The page you're looking for doesn't exist.
          </p>
        </div>
      </div>
    </div>
  </div>
)

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Navigate to="/dashboard" replace />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <ExecDashboard />
          </ProtectedRoute>
        }
      />

      {/* Major Gifts - requires major_gifts, executive, or admin role */}
      <Route
        path="/major-gifts"
        element={
          <ProtectedRoute requiredRoles={['major_gifts', 'executive', 'admin']}>
            <MajorGifts />
          </ProtectedRoute>
        }
      />

      {/* Ticketing - requires ticketing, executive, or admin role */}
      <Route
        path="/ticketing"
        element={
          <ProtectedRoute requiredRoles={['ticketing', 'executive', 'admin']}>
            <Ticketing />
          </ProtectedRoute>
        }
      />

      {/* Corporate - requires corporate, executive, or admin role */}
      <Route
        path="/corporate"
        element={
          <ProtectedRoute requiredRoles={['corporate', 'executive', 'admin']}>
            <Corporate />
          </ProtectedRoute>
        }
      />

      {/* Proposals - requires revenue team roles */}
      <Route
        path="/proposals"
        element={
          <ProtectedRoute
            requiredRoles={['major_gifts', 'corporate', 'ticketing', 'executive', 'admin']}
          >
            <Proposals />
          </ProtectedRoute>
        }
      />

      {/* Data Import - requires revenue_ops or admin role */}
      <Route
        path="/import"
        element={
          <ProtectedRoute requiredRoles={['revenue_ops', 'admin']}>
            <DataImport />
          </ProtectedRoute>
        }
      />

      {/* Voice Console - requires executive or admin role */}
      <Route
        path="/voice"
        element={
          <ProtectedRoute requiredRoles={['executive', 'admin']}>
            <VoiceConsole />
          </ProtectedRoute>
        }
      />

      {/* Admin - requires admin role only */}
      <Route
        path="/admin/roles"
        element={
          <ProtectedRoute requiredRoles={['admin']} requireAny={false}>
            <RoleAdmin />
          </ProtectedRoute>
        }
      />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
