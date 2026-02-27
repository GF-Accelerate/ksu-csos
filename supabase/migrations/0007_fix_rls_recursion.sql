-- Fix infinite recursion in user_role_assignment RLS policies
-- Drop the actual existing policies by their correct names

DROP POLICY IF EXISTS "read_own_roles" ON user_role_assignment;
DROP POLICY IF EXISTS "admin_manage_roles" ON user_role_assignment;
DROP POLICY IF EXISTS "user_role_self_read" ON user_role_assignment;
DROP POLICY IF EXISTS "user_role_service_all" ON user_role_assignment;

-- Create simple, non-recursive policies
-- Allow users to read their own roles
CREATE POLICY "read_own_roles" ON user_role_assignment
  FOR SELECT
  USING (user_id = auth.uid());

-- Allow all authenticated users to insert (will be restricted by application logic)
CREATE POLICY "insert_roles" ON user_role_assignment
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Note: Admin management of roles should be done via Edge Functions using service role
