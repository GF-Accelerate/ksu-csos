/**
 * Audit Logging Utilities for KSU CSOS Edge Functions
 * Provides consistent audit trail across all operations
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'role_assign'
  | 'role_remove'
  | 'proposal_generate'
  | 'proposal_approve'
  | 'proposal_send'
  | 'ingest_data'
  | 'score_calculate'
  | 'route_opportunity'
  | 'voice_command'

/**
 * Log an audit event to the audit_log table
 */
export async function logAudit(
  supabase: SupabaseClient,
  params: {
    userId: string | null
    tableName: string
    recordId?: string | null
    action: AuditAction
    oldValues?: Record<string, unknown> | null
    newValues?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
  }
): Promise<void> {
  try {
    const { error } = await supabase
      .from('audit_log')
      .insert({
        user_id: params.userId,
        table_name: params.tableName,
        record_id: params.recordId || null,
        action: params.action,
        old_values: params.oldValues || null,
        new_values: params.newValues || null,
        metadata: params.metadata || null,
      })

    if (error) {
      console.error('Failed to log audit event:', error)
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  } catch (error) {
    console.error('Exception while logging audit event:', error)
  }
}

/**
 * Log a role assignment/removal
 */
export async function logRoleChange(
  supabase: SupabaseClient,
  params: {
    adminUserId: string
    targetUserId: string
    role: string
    action: 'role_assign' | 'role_remove'
  }
): Promise<void> {
  await logAudit(supabase, {
    userId: params.adminUserId,
    tableName: 'user_role',
    recordId: `${params.targetUserId}:${params.role}`,
    action: params.action,
    newValues: params.action === 'role_assign' ? { role: params.role } : null,
    oldValues: params.action === 'role_remove' ? { role: params.role } : null,
    metadata: {
      target_user_id: params.targetUserId,
    },
  })
}

/**
 * Log data ingestion
 */
export async function logDataIngest(
  supabase: SupabaseClient,
  params: {
    userId: string | null
    source: 'paciolan' | 'raisers_edge' | 'manual'
    recordsProcessed: number
    recordsCreated: number
    recordsUpdated: number
    errors?: string[]
  }
): Promise<void> {
  await logAudit(supabase, {
    userId: params.userId,
    tableName: 'constituent_master',
    action: 'ingest_data',
    metadata: {
      source: params.source,
      records_processed: params.recordsProcessed,
      records_created: params.recordsCreated,
      records_updated: params.recordsUpdated,
      errors: params.errors || [],
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Log scoring run
 */
export async function logScoringRun(
  supabase: SupabaseClient,
  params: {
    constituentsScored: number
    duration: number
    errors?: string[]
  }
): Promise<void> {
  await logAudit(supabase, {
    userId: null, // System operation
    tableName: 'scores',
    action: 'score_calculate',
    metadata: {
      constituents_scored: params.constituentsScored,
      duration_ms: params.duration,
      errors: params.errors || [],
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Log opportunity routing decision
 */
export async function logRouting(
  supabase: SupabaseClient,
  params: {
    userId: string | null
    opportunityId: string
    constituentId: string
    assignedRole: string
    ruleApplied: string
    collisionDetected: boolean
  }
): Promise<void> {
  await logAudit(supabase, {
    userId: params.userId,
    tableName: 'opportunity',
    recordId: params.opportunityId,
    action: 'route_opportunity',
    metadata: {
      constituent_id: params.constituentId,
      assigned_role: params.assignedRole,
      rule_applied: params.ruleApplied,
      collision_detected: params.collisionDetected,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Log proposal lifecycle event
 */
export async function logProposalEvent(
  supabase: SupabaseClient,
  params: {
    userId: string
    proposalId: string
    opportunityId: string
    action: 'proposal_generate' | 'proposal_approve' | 'proposal_send'
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await logAudit(supabase, {
    userId: params.userId,
    tableName: 'proposal',
    recordId: params.proposalId,
    action: params.action,
    metadata: {
      opportunity_id: params.opportunityId,
      ...params.metadata,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Log voice command execution
 */
export async function logVoiceCommand(
  supabase: SupabaseClient,
  params: {
    userId: string
    transcript: string
    intent: string
    success: boolean
    result?: unknown
    error?: string
  }
): Promise<void> {
  await logAudit(supabase, {
    userId: params.userId,
    tableName: 'voice_commands', // Virtual table for auditing
    action: 'voice_command',
    metadata: {
      transcript: params.transcript,
      intent: params.intent,
      success: params.success,
      result: params.result,
      error: params.error,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Query audit log for a specific table/record
 */
export async function getAuditTrail(
  supabase: SupabaseClient,
  params: {
    tableName?: string
    recordId?: string
    userId?: string
    limit?: number
  }
): Promise<unknown[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })

  if (params.tableName) {
    query = query.eq('table_name', params.tableName)
  }

  if (params.recordId) {
    query = query.eq('record_id', params.recordId)
  }

  if (params.userId) {
    query = query.eq('user_id', params.userId)
  }

  if (params.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch audit trail: ${error.message}`)
  }

  return data || []
}
