/**
 * YAML Rules Loader for KSU CSOS Edge Functions
 * Loads and parses YAML configuration files from Supabase Storage or local files
 */

import { parse as parseYaml } from 'https://deno.land/std@0.208.0/yaml/mod.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Routing rule structure
 */
export interface RoutingRule {
  name: string
  priority: number
  when: {
    opportunity_type?: string
    status?: string
    amount_min?: number
    amount_max?: number
    constituent_flags?: string[]
  }
  then: {
    assign_to_role: string
    secondary_roles?: string[]
    create_task?: boolean
    task_priority?: 'low' | 'medium' | 'high'
  }
}

/**
 * Collision rule structure
 */
export interface CollisionRule {
  name: string
  priority: number
  when: {
    active_opportunity_type: string
    incoming_opportunity_type: string
  }
  then: {
    action: 'block' | 'warn' | 'allow'
    window_days: number
    message?: string
  }
}

/**
 * Approval threshold structure
 */
export interface ApprovalThreshold {
  opportunity_type: string
  amount_threshold: number
  required_approver_roles: string[]
  auto_approve_below?: boolean
}

/**
 * Cache for YAML rules (5-minute TTL)
 */
const ruleCache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Load YAML file from Supabase Storage
 * Falls back to local file if storage is not available
 */
async function loadYamlFromStorage(
  supabase: SupabaseClient,
  bucketName: string,
  filePath: string
): Promise<unknown> {
  try {
    // Try to download from Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath)

    if (error) {
      throw error
    }

    const text = await data.text()
    return parseYaml(text)
  } catch (error) {
    console.warn(`Failed to load from storage, trying local file: ${error}`)

    // Fallback: try to load from local file system
    try {
      const localPath = `../../packages/rules/${filePath}`
      const text = await Deno.readTextFile(localPath)
      return parseYaml(text)
    } catch (localError) {
      throw new Error(`Failed to load YAML from both storage and local: ${localError}`)
    }
  }
}

/**
 * Load YAML rules with caching
 */
async function loadYamlWithCache(
  supabase: SupabaseClient,
  bucketName: string,
  filePath: string,
  cacheKey: string
): Promise<unknown> {
  // Check cache
  const cached = ruleCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  // Load from storage
  const data = await loadYamlFromStorage(supabase, bucketName, filePath)

  // Update cache
  ruleCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  })

  return data
}

/**
 * Load routing rules from YAML
 */
export async function loadRoutingRules(
  supabase?: SupabaseClient
): Promise<any> {
  const client = supabase || createServiceClient()
  const data = await loadYamlWithCache(
    client,
    'rules',
    'routing_rules.yaml',
    'routing_rules'
  )

  return data
}

/**
 * Load collision rules from YAML
 */
export async function loadCollisionRules(
  supabase?: SupabaseClient
): Promise<any> {
  const client = supabase || createServiceClient()
  const data = await loadYamlWithCache(
    client,
    'rules',
    'collision_rules.yaml',
    'collision_rules'
  )

  return data
}

/**
 * Load approval thresholds from YAML
 */
export async function loadApprovalThresholds(
  supabase?: SupabaseClient
): Promise<any> {
  const client = supabase || createServiceClient()
  const data = await loadYamlWithCache(
    client,
    'rules',
    'approval_thresholds.yaml',
    'approval_thresholds'
  )

  return data
}

/**
 * Create service client helper (if not passed)
 */
function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured')
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * Clear the rules cache (useful for testing or forced refresh)
 */
export function clearRulesCache(): void {
  ruleCache.clear()
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): { key: string; age: number }[] {
  const now = Date.now()
  return Array.from(ruleCache.entries()).map(([key, value]) => ({
    key,
    age: now - value.timestamp,
  }))
}
