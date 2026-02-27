-- Fix RLS policies for user_role_assignment to prevent infinite recursion
-- and assign admin role to the admin user

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "user_role_role_based_read" ON user_role_assignment;
DROP POLICY IF EXISTS "user_role_admin_write" ON user_role_assignment;

-- Create non-recursive policies
-- Allow users to read their own roles
CREATE POLICY "user_role_self_read" ON user_role_assignment
  FOR SELECT
  USING (user_id = auth.uid());

-- Allow service role (backend) to do everything
CREATE POLICY "user_role_service_all" ON user_role_assignment
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Temporarily disable RLS to insert admin role
ALTER TABLE user_role_assignment DISABLE ROW LEVEL SECURITY;

-- Insert admin role for the admin user (987c864c-3f14-4537-9bec-939c31a034a2)
-- This is the user ID from the auth.users table for admin@ksu.edu
INSERT INTO user_role_assignment (user_id, role, assigned_by_user_id, assigned_at)
VALUES (
  '987c864c-3f14-4537-9bec-939c31a034a2',
  'admin',
  '987c864c-3f14-4537-9bec-939c31a034a2',
  NOW()
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Re-enable RLS
ALTER TABLE user_role_assignment ENABLE ROW LEVEL SECURITY;
