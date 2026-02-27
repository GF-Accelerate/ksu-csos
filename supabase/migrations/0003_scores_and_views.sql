-- KSU CSOS - Scores and Materialized Views
-- Performance optimizations for dashboard queries
-- Created: 2026-02-25

-- ============================================================================
-- MATERIALIZED VIEW: Executive Pipeline
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_exec_pipeline AS
SELECT
  o.type,
  o.status,
  COUNT(*) as count,
  COALESCE(SUM(o.amount), 0) as total_amount,
  COALESCE(AVG(o.amount), 0) as avg_amount
FROM opportunity o
GROUP BY o.type, o.status;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_exec_pipeline ON mv_exec_pipeline(type, status);

-- ============================================================================
-- FUNCTION: Refresh Materialized Views
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_exec_pipeline;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Allow authenticated users to read materialized views
GRANT SELECT ON mv_exec_pipeline TO authenticated;

-- Allow service role to refresh views
GRANT EXECUTE ON FUNCTION refresh_materialized_views() TO service_role;
