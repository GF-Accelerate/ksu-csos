-- Performance Indexes for KSU CSOS
-- Created: 2026-02-25

-- ============================================================================
-- CONSTITUENT_MASTER INDEXES
-- ============================================================================

-- Identity resolution indexes (for matching by email, phone, zip)
CREATE INDEX IF NOT EXISTS idx_constituent_email
  ON constituent_master(LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_constituent_phone
  ON constituent_master(phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_constituent_zip
  ON constituent_master(zip)
  WHERE zip IS NOT NULL;

-- Name + Zip for fuzzy matching during identity resolution
CREATE INDEX IF NOT EXISTS idx_constituent_name_zip
  ON constituent_master(LOWER(last_name), LOWER(first_name), zip);

-- Household lookup
CREATE INDEX IF NOT EXISTS idx_constituent_household
  ON constituent_master(household_id)
  WHERE household_id IS NOT NULL;

-- Portfolio ownership (for RLS and routing)
CREATE INDEX IF NOT EXISTS idx_constituent_primary_owner
  ON constituent_master(primary_owner_role, primary_owner_user_id);

-- Flags for segmentation
CREATE INDEX IF NOT EXISTS idx_constituent_flags
  ON constituent_master(is_ticket_holder, is_donor, is_corporate);

-- Sport affinity for ticketing
CREATE INDEX IF NOT EXISTS idx_constituent_sport_affinity
  ON constituent_master(sport_affinity)
  WHERE sport_affinity IS NOT NULL;

-- ============================================================================
-- OPPORTUNITY INDEXES
-- ============================================================================

-- Primary queries: by constituent, type, status
CREATE INDEX IF NOT EXISTS idx_opportunity_constituent
  ON opportunity(constituent_id, type, status);

-- Routing and assignment
CREATE INDEX IF NOT EXISTS idx_opportunity_owner
  ON opportunity(owner_user_id, status, type);

-- Pipeline queries (active opportunities by type)
CREATE INDEX IF NOT EXISTS idx_opportunity_pipeline
  ON opportunity(type, status, expected_close_at)
  WHERE status = 'active';

-- Collision detection (recent touches by constituent)
CREATE INDEX IF NOT EXISTS idx_opportunity_recent_touches
  ON opportunity(constituent_id, type, updated_at)
  WHERE status IN ('active', 'won');

-- Amount-based queries (for approval thresholds)
CREATE INDEX IF NOT EXISTS idx_opportunity_amount
  ON opportunity(amount, type)
  WHERE amount IS NOT NULL;

-- ============================================================================
-- TASK_WORK_ITEM INDEXES
-- ============================================================================

-- Work queue: assigned user + status
CREATE INDEX IF NOT EXISTS idx_task_assigned_user
  ON task_work_item(assigned_user_id, status, priority DESC, due_at ASC);

-- Work queue: assigned role + status
CREATE INDEX IF NOT EXISTS idx_task_assigned_role
  ON task_work_item(assigned_role, status, priority DESC, due_at ASC);

-- Opportunity-related tasks
CREATE INDEX IF NOT EXISTS idx_task_opportunity
  ON task_work_item(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

-- Tasks by due date and status
CREATE INDEX IF NOT EXISTS idx_task_due_date
  ON task_work_item(status, due_at)
  WHERE status IN ('open', 'in_progress');

-- ============================================================================
-- SCORES INDEXES
-- ============================================================================

-- Lookup by constituent (most recent score)
CREATE INDEX IF NOT EXISTS idx_scores_constituent_latest
  ON scores(constituent_id, as_of_date DESC);

-- Renewal risk queries
CREATE INDEX IF NOT EXISTS idx_scores_renewal_risk
  ON scores(renewal_risk, as_of_date DESC)
  WHERE renewal_risk IN ('high', 'medium');

-- Ask readiness queries
CREATE INDEX IF NOT EXISTS idx_scores_ask_readiness
  ON scores(ask_readiness, as_of_date DESC)
  WHERE ask_readiness = 'ready';

-- Propensity scores (for targeting)
CREATE INDEX IF NOT EXISTS idx_scores_propensity
  ON scores(ticket_propensity DESC, corporate_propensity DESC);

-- Composite index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_scores_dashboard
  ON scores(as_of_date DESC, renewal_risk, ask_readiness);

-- ============================================================================
-- PROPOSAL INDEXES
-- ============================================================================

-- Proposal workflow: by status
CREATE INDEX IF NOT EXISTS idx_proposal_status
  ON proposal(status, created_at DESC);

-- Proposals awaiting approval
CREATE INDEX IF NOT EXISTS idx_proposal_pending_approval
  ON proposal(status, amount DESC)
  WHERE status = 'pending_approval';

-- Proposals by opportunity
CREATE INDEX IF NOT EXISTS idx_proposal_opportunity
  ON proposal(opportunity_id);

-- Approved proposals (for reporting)
CREATE INDEX IF NOT EXISTS idx_proposal_approved
  ON proposal(approved_at DESC, approved_by)
  WHERE status = 'approved';

-- ============================================================================
-- INTERACTION_LOG INDEXES
-- ============================================================================

-- Interaction history by constituent (for timeline views)
CREATE INDEX IF NOT EXISTS idx_interaction_constituent
  ON interaction_log(constituent_id, interaction_date DESC);

-- Interaction by opportunity
CREATE INDEX IF NOT EXISTS idx_interaction_opportunity
  ON interaction_log(opportunity_id, interaction_date DESC);

-- User activity tracking
CREATE INDEX IF NOT EXISTS idx_interaction_user
  ON interaction_log(logged_by_user_id, interaction_date DESC);

-- Recent touchpoints (for scoring)
CREATE INDEX IF NOT EXISTS idx_interaction_recent
  ON interaction_log(constituent_id, interaction_date DESC);
  

-- ============================================================================
-- AUDIT_LOG INDEXES
-- ============================================================================

-- Audit trail by table
CREATE INDEX IF NOT EXISTS idx_audit_table
  ON audit_log(table_name, created_at DESC);

-- Audit trail by user
CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_log(user_id, created_at DESC);

-- Recent audit events
CREATE INDEX IF NOT EXISTS idx_audit_recent
  ON audit_log(created_at DESC);

-- ============================================================================
-- HOUSEHOLD INDEXES
-- ============================================================================

-- Household name lookup
CREATE INDEX IF NOT EXISTS idx_household_name
  ON household(LOWER(name));


-- ============================================================================
-- PERFORMANCE NOTES
-- ============================================================================

-- These indexes support:
-- 1. Identity resolution (email, phone, name+zip matching)
-- 2. RLS policies (role-based, portfolio-based filtering)
-- 3. Work queues (assigned_user_id, assigned_role, status, priority)
-- 4. Dashboard queries (pipeline metrics, renewal risk, ask readiness)
-- 5. Collision detection (recent touches by constituent)
-- 6. Approval workflows (proposals by status, amount thresholds)
-- 7. Audit trails (by table, user, timestamp)

-- Maintenance:
-- - Rebuild indexes monthly: REINDEX SCHEMA public;
-- - Monitor index usage: SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';
-- - Remove unused indexes if table scans are faster

COMMENT ON INDEX idx_constituent_email IS 'Identity resolution by email (case-insensitive)';
COMMENT ON INDEX idx_opportunity_recent_touches IS 'Collision detection for 14-day touch windows';
COMMENT ON INDEX idx_task_assigned_user IS 'Work queue performance (user-based)';
COMMENT ON INDEX idx_scores_renewal_risk IS 'Dashboard: Renewals at risk';
COMMENT ON INDEX idx_scores_ask_readiness IS 'Dashboard: Ask-ready prospects';
