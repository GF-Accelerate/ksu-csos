-- KSU CSOS - Initial Schema
-- Phase 1: Revenue Intelligence Engine
-- Created: 2026-02-25

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Household table (family/organization grouping)
CREATE TABLE IF NOT EXISTS household (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Constituent master table (unified constituent records)
CREATE TABLE IF NOT EXISTS constituent_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES household(id),

  -- Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Classification flags
  is_ticket_holder BOOLEAN DEFAULT false,
  is_donor BOOLEAN DEFAULT false,
  is_corporate BOOLEAN DEFAULT false,

  -- Financial data
  lifetime_ticket_spend DECIMAL(10,2) DEFAULT 0,
  lifetime_giving DECIMAL(10,2) DEFAULT 0,

  -- Preferences
  sport_affinity TEXT, -- football, basketball, baseball, etc.

  -- Portfolio ownership
  primary_owner_role TEXT, -- major_gifts, ticketing, corporate
  primary_owner_user_id UUID,
  secondary_owner_roles TEXT[], -- for cross-team coordination

  -- External IDs
  paciolan_account_id TEXT,
  raisers_edge_donor_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT email_or_phone_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Opportunity table (pipeline tracking)
CREATE TABLE IF NOT EXISTS opportunity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituent_id UUID NOT NULL REFERENCES constituent_master(id) ON DELETE CASCADE,

  -- Opportunity details
  type TEXT NOT NULL CHECK (type IN ('major_gift', 'ticket', 'corporate')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'paused')),
  amount DECIMAL(10,2),
  description TEXT,

  -- Dates
  expected_close_at DATE,
  closed_at TIMESTAMPTZ,

  -- Ownership
  owner_user_id UUID,
  owner_role TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Proposal table (proposal lifecycle management)
CREATE TABLE IF NOT EXISTS proposal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunity(id) ON DELETE CASCADE,
  constituent_id UUID NOT NULL REFERENCES constituent_master(id) ON DELETE CASCADE,

  -- Proposal content
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'sent')),
  amount DECIMAL(10,2) NOT NULL,

  -- Approval workflow
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Sending
  sent_at TIMESTAMPTZ,
  sent_to_email TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Task work item table (work queue and task management)
CREATE TABLE IF NOT EXISTS task_work_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Task details
  type TEXT NOT NULL, -- renewal, proposal_required, cultivation, follow_up, review_required
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  description TEXT NOT NULL,

  -- Assignment
  assigned_user_id UUID,
  assigned_role TEXT, -- major_gifts, ticketing, corporate

  -- Related records
  constituent_id UUID REFERENCES constituent_master(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunity(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES proposal(id) ON DELETE SET NULL,

  -- Dates
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scores table (constituent scoring)
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituent_id UUID NOT NULL REFERENCES constituent_master(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Scores
  renewal_risk TEXT CHECK (renewal_risk IN ('high', 'medium', 'low')),
  ask_readiness TEXT CHECK (ask_readiness IN ('ready', 'not_ready')),
  ticket_propensity INT CHECK (ticket_propensity BETWEEN 0 AND 100),
  corporate_propensity INT CHECK (corporate_propensity BETWEEN 0 AND 100),
  capacity_estimate DECIMAL(10,2),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint (one score per constituent per day)
  UNIQUE(constituent_id, as_of_date)
);

-- Interaction log table (touch tracking)
CREATE TABLE IF NOT EXISTS interaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituent_id UUID NOT NULL REFERENCES constituent_master(id) ON DELETE CASCADE,

  -- Interaction details
  type TEXT NOT NULL, -- email, call, meeting, event, proposal_sent
  notes TEXT,
  interaction_date TIMESTAMPTZ DEFAULT now(),

  -- Related records
  opportunity_id UUID REFERENCES opportunity(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES proposal(id) ON DELETE SET NULL,

  -- User who logged interaction
  logged_by_user_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log table (audit trail)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Audit details
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,

  -- User
  user_id UUID,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User role assignment table (role-based access control)
CREATE TABLE IF NOT EXISTS user_role_assignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('executive', 'major_gifts', 'ticketing', 'corporate', 'marketing', 'revenue_ops', 'admin')),

  -- Assignment details
  assigned_by_user_id UUID,
  assigned_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint (one role per user)
  UNIQUE(user_id, role)
);

-- ============================================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================================

-- Check if current user is executive
CREATE OR REPLACE FUNCTION is_exec()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_role_assignment
    WHERE user_id = auth.uid() AND role = 'executive'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user has a specific role
CREATE OR REPLACE FUNCTION has_role(check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_role_assignment
    WHERE user_id = auth.uid() AND role = check_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE household ENABLE ROW LEVEL SECURITY;
ALTER TABLE constituent_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_work_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignment ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- BASIC RLS POLICIES (will be enhanced in migration 0002)
-- ============================================================================

-- Allow all for authenticated users (temporary - will be restricted in 0002)
CREATE POLICY "allow_all_authenticated" ON constituent_master FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "allow_all_authenticated" ON opportunity FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "allow_all_authenticated" ON proposal FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "allow_all_authenticated" ON task_work_item FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "allow_all_authenticated" ON scores FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "allow_all_authenticated" ON interaction_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "allow_all_authenticated" ON household FOR ALL USING (auth.role() = 'authenticated');

-- Audit log: Read-only for all authenticated users
CREATE POLICY "read_only_authenticated" ON audit_log FOR SELECT USING (auth.role() = 'authenticated');

-- User roles: Users can read their own roles
CREATE POLICY "read_own_roles" ON user_role_assignment FOR SELECT USING (user_id = auth.uid());

-- Admin can manage all roles
CREATE POLICY "admin_manage_roles" ON user_role_assignment FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_role_assignment WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_household_updated_at BEFORE UPDATE ON household
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_constituent_updated_at BEFORE UPDATE ON constituent_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_opportunity_updated_at BEFORE UPDATE ON opportunity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposal_updated_at BEFORE UPDATE ON proposal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_updated_at BEFORE UPDATE ON task_work_item
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scores_updated_at BEFORE UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
