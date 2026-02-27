-- KSU CSOS - Enhanced RLS Policies
-- Enterprise-grade role-based + portfolio ownership security
-- Created: 2026-02-25

-- ============================================================================
-- DROP TEMPORARY POLICIES FROM 0001
-- ============================================================================

DROP POLICY IF EXISTS "allow_all_authenticated" ON constituent_master;
DROP POLICY IF EXISTS "allow_all_authenticated" ON opportunity;
DROP POLICY IF EXISTS "allow_all_authenticated" ON proposal;
DROP POLICY IF EXISTS "allow_all_authenticated" ON task_work_item;
DROP POLICY IF EXISTS "allow_all_authenticated" ON scores;
DROP POLICY IF EXISTS "allow_all_authenticated" ON interaction_log;
DROP POLICY IF EXISTS "allow_all_authenticated" ON household;

-- ============================================================================
-- CONSTITUENT_MASTER POLICIES
-- ============================================================================

-- Read: Role-based + portfolio ownership
CREATE POLICY "constituent_role_based_read" ON constituent_master FOR SELECT
  USING (
    is_exec() OR
    (has_role('major_gifts') AND primary_owner_role = 'major_gifts') OR
    (has_role('ticketing') AND primary_owner_role = 'ticketing') OR
    (has_role('corporate') AND primary_owner_role = 'corporate') OR
    (has_role('revenue_ops')) OR
    (has_role('marketing'))
  );

-- Update: Portfolio owner or exec
CREATE POLICY "constituent_owner_update" ON constituent_master FOR UPDATE
  USING (primary_owner_user_id = auth.uid() OR is_exec() OR has_role('revenue_ops'));

-- Insert: Revenue ops or exec
CREATE POLICY "constituent_insert" ON constituent_master FOR INSERT
  WITH CHECK (has_role('revenue_ops') OR is_exec() OR has_role('admin'));

-- Delete: Admin only
CREATE POLICY "constituent_delete" ON constituent_master FOR DELETE
  USING (has_role('admin'));

-- ============================================================================
-- OPPORTUNITY POLICIES
-- ============================================================================

-- Read: Role-based + owner-based
CREATE POLICY "opp_role_read" ON opportunity FOR SELECT
  USING (
    is_exec() OR
    (has_role('major_gifts') AND type = 'major_gift') OR
    (has_role('ticketing') AND type = 'ticket') OR
    (has_role('corporate') AND type = 'corporate') OR
    owner_user_id = auth.uid() OR
    has_role('revenue_ops')
  );

-- Update: Owner or exec
CREATE POLICY "opp_owner_update" ON opportunity FOR UPDATE
  USING (owner_user_id = auth.uid() OR is_exec() OR has_role('revenue_ops'));

-- Insert: Relevant role
CREATE POLICY "opp_insert" ON opportunity FOR INSERT
  WITH CHECK (
    (has_role('major_gifts') AND type = 'major_gift') OR
    (has_role('ticketing') AND type = 'ticket') OR
    (has_role('corporate') AND type = 'corporate') OR
    has_role('revenue_ops') OR
    is_exec()
  );

-- Delete: Exec or revenue ops only
CREATE POLICY "opp_delete" ON opportunity FOR DELETE
  USING (is_exec() OR has_role('revenue_ops'));

-- ============================================================================
-- PROPOSAL POLICIES
-- ============================================================================

-- Read: Revenue teams + exec
CREATE POLICY "proposal_read" ON proposal FOR SELECT
  USING (
    is_exec() OR
    has_role('major_gifts') OR
    has_role('ticketing') OR
    has_role('corporate') OR
    has_role('revenue_ops')
  );

-- Update: Owner or approver
CREATE POLICY "proposal_update" ON proposal FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM opportunity
      WHERE opportunity.id = proposal.opportunity_id
      AND opportunity.owner_user_id = auth.uid()
    ) OR
    is_exec() OR
    has_role('revenue_ops')
  );

-- Insert: Opportunity owner
CREATE POLICY "proposal_insert" ON proposal FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM opportunity
      WHERE opportunity.id = opportunity_id
      AND (opportunity.owner_user_id = auth.uid() OR is_exec() OR has_role('revenue_ops'))
    )
  );

-- Delete: Exec or revenue ops
CREATE POLICY "proposal_delete" ON proposal FOR DELETE
  USING (is_exec() OR has_role('revenue_ops'));

-- ============================================================================
-- TASK_WORK_ITEM POLICIES
-- ============================================================================

-- Read: Assigned user or assigned role or exec
CREATE POLICY "task_read" ON task_work_item FOR SELECT
  USING (
    assigned_user_id = auth.uid() OR
    has_role(assigned_role) OR
    is_exec() OR
    has_role('revenue_ops')
  );

-- Update: Assigned user or exec
CREATE POLICY "task_update" ON task_work_item FOR UPDATE
  USING (
    assigned_user_id = auth.uid() OR
    is_exec() OR
    has_role('revenue_ops')
  );

-- Insert: Anyone authenticated (tasks can be created by workflows)
CREATE POLICY "task_insert" ON task_work_item FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Delete: Exec or revenue ops
CREATE POLICY "task_delete" ON task_work_item FOR DELETE
  USING (is_exec() OR has_role('revenue_ops'));

-- ============================================================================
-- SCORES POLICIES
-- ============================================================================

-- Read: All revenue teams
CREATE POLICY "scores_read" ON scores FOR SELECT
  USING (
    is_exec() OR
    has_role('major_gifts') OR
    has_role('ticketing') OR
    has_role('corporate') OR
    has_role('revenue_ops') OR
    has_role('marketing')
  );

-- Update/Insert: Revenue ops or system (via service role)
CREATE POLICY "scores_write" ON scores FOR ALL
  USING (has_role('revenue_ops') OR is_exec());

-- ============================================================================
-- INTERACTION_LOG POLICIES
-- ============================================================================

-- Read: Anyone who can see the constituent
CREATE POLICY "interaction_read" ON interaction_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM constituent_master cm
      WHERE cm.id = interaction_log.constituent_id
      AND (
        is_exec() OR
        (has_role('major_gifts') AND cm.primary_owner_role = 'major_gifts') OR
        (has_role('ticketing') AND cm.primary_owner_role = 'ticketing') OR
        (has_role('corporate') AND cm.primary_owner_role = 'corporate') OR
        has_role('revenue_ops') OR
        has_role('marketing')
      )
    )
  );

-- Insert: Anyone authenticated
CREATE POLICY "interaction_insert" ON interaction_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Update/Delete: Own interactions or exec
CREATE POLICY "interaction_update" ON interaction_log FOR UPDATE
  USING (logged_by_user_id = auth.uid() OR is_exec() OR has_role('revenue_ops'));

CREATE POLICY "interaction_delete" ON interaction_log FOR DELETE
  USING (logged_by_user_id = auth.uid() OR is_exec() OR has_role('revenue_ops'));

-- ============================================================================
-- HOUSEHOLD POLICIES
-- ============================================================================

-- Read: Anyone who can see at least one constituent in the household
CREATE POLICY "household_read" ON household FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM constituent_master cm
      WHERE cm.household_id = household.id
      AND (
        is_exec() OR
        (has_role('major_gifts') AND cm.primary_owner_role = 'major_gifts') OR
        (has_role('ticketing') AND cm.primary_owner_role = 'ticketing') OR
        (has_role('corporate') AND cm.primary_owner_role = 'corporate') OR
        has_role('revenue_ops') OR
        has_role('marketing')
      )
    )
  );

-- Update/Insert: Revenue ops or exec
CREATE POLICY "household_write" ON household FOR ALL
  USING (has_role('revenue_ops') OR is_exec());
