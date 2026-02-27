/**
 * KSU CSOS - TypeScript Type Definitions
 *
 * Comprehensive types for all entities in the Revenue Intelligence Engine.
 * Aligned with database schema from migrations 0001-0005.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type AppRole =
  | 'executive'
  | 'major_gifts'
  | 'ticketing'
  | 'corporate'
  | 'marketing'
  | 'revenue_ops'
  | 'admin'

export type OpportunityType = 'ticket' | 'major_gift' | 'corporate'

export type OpportunityStatus = 'active' | 'won' | 'lost' | 'paused'

export type ProposalStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'sent'

export type TaskType =
  | 'renewal'
  | 'proposal_required'
  | 'cultivation'
  | 'follow_up'
  | 'review_required'

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type TaskPriority = 'high' | 'medium' | 'low'

export type InteractionType =
  | 'email'
  | 'call'
  | 'meeting'
  | 'event'
  | 'proposal_sent'

export type RenewalRisk = 'low' | 'medium' | 'high'

export type AskReadiness = 'ready' | 'not_ready' | 'under_cultivation'

export type AuditAction =
  | 'insert'
  | 'update'
  | 'delete'
  | 'role_assign'
  | 'role_remove'
  | 'csv_import'
  | 'scoring_run'
  | 'routing'
  | 'proposal_generate'
  | 'proposal_approve'
  | 'proposal_send'
  | 'voice_command'

// ============================================================================
// DATABASE ENTITIES
// ============================================================================

/**
 * Constituent Master Record
 * Single source of truth for all individuals (donors, ticket holders, prospects)
 */
export interface Constituent {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  zip: string | null
  household_id: string | null

  // Flags
  is_ticket_holder: boolean
  is_donor: boolean
  is_corporate: boolean

  // Financial data
  lifetime_ticket_spend: number
  lifetime_giving: number

  // Enrichment
  sport_affinity: string | null

  // Portfolio ownership
  primary_owner_role: string | null
  primary_owner_user_id: string | null
  secondary_owner_roles: string[] | null

  // Timestamps
  created_at: string
  updated_at: string
}

/**
 * Household - Family unit grouping
 */
export interface Household {
  id: string
  household_name: string
  primary_contact_id: string | null
  total_lifetime_giving: number
  total_lifetime_ticket_spend: number
  created_at: string
  updated_at: string
}

/**
 * Opportunity - Active revenue pursuit
 */
export interface Opportunity {
  id: string
  constituent_id: string
  type: OpportunityType
  status: OpportunityStatus
  amount: number
  description: string | null

  // Ownership
  owner_role: string | null
  owner_user_id: string | null

  // Dates
  expected_close_date: string | null
  actual_close_date: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Related data (populated via joins)
  constituent?: Constituent
}

/**
 * Proposal - Formal ask document
 */
export interface Proposal {
  id: string
  opportunity_id: string
  status: ProposalStatus
  generated_content: string
  amount: number

  // Approval workflow
  requires_approval: boolean
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null

  // Delivery
  sent_at: string | null
  sent_to_email: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Related data (populated via joins)
  opportunity?: Opportunity
}

/**
 * Proposal Approval - Multi-level approval tracking
 */
export interface ProposalApproval {
  id: string
  proposal_id: string
  approved_by: string
  approved_at: string
  notes: string | null
}

/**
 * Task Work Item - Action items for revenue teams
 */
export interface TaskWorkItem {
  id: string
  type: TaskType
  status: TaskStatus
  priority: TaskPriority

  // Assignment
  assigned_role: string | null
  assigned_user_id: string | null

  // Details
  title: string
  description: string | null

  // Related entities
  constituent_id: string | null
  opportunity_id: string | null
  proposal_id: string | null

  // Scheduling
  due_at: string | null
  completed_at: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Related data (populated via joins)
  constituent?: Constituent
  opportunity?: Opportunity
  proposal?: Proposal
}

/**
 * Interaction Log - Touch history
 */
export interface InteractionLog {
  id: string
  constituent_id: string
  opportunity_id: string | null
  type: InteractionType
  date: string
  user_id: string | null
  notes: string | null
  created_at: string

  // Related data (populated via joins)
  constituent?: Constituent
}

/**
 * Scores - AI/rule-based constituent scoring
 */
export interface Score {
  id: string
  constituent_id: string
  as_of_date: string

  // Risk & readiness
  renewal_risk: RenewalRisk
  ask_readiness: AskReadiness

  // Propensity scores (0-100)
  ticket_propensity: number
  corporate_propensity: number

  // Capacity
  capacity_estimate: number

  created_at: string

  // Related data (populated via joins)
  constituent?: Constituent
}

/**
 * User Role Assignment
 */
export interface UserRole {
  id: string
  user_id: string
  role: AppRole
  assigned_by: string | null
  assigned_at: string
  created_at: string
}

/**
 * Audit Log - Full activity trail
 */
export interface AuditLog {
  id: string
  table_name: string | null
  record_id: string | null
  action: AuditAction
  user_id: string | null
  changes: Record<string, any> | null
  metadata: Record<string, any> | null
  created_at: string
}

// ============================================================================
// VIEW TYPES (Materialized Views)
// ============================================================================

/**
 * Executive Pipeline View
 * Pre-aggregated pipeline metrics for dashboard
 */
export interface ExecPipelineView {
  opportunity_type: OpportunityType
  opportunity_status: OpportunityStatus
  count: number
  total_amount: number
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Dashboard Data Response
 */
export interface DashboardData {
  executive?: ExecutiveDashboard
  major_gifts?: MajorGiftsDashboard
  ticketing?: TicketingDashboard
  corporate?: CorporateDashboard
}

export interface ExecutiveDashboard {
  pipeline_summary: {
    type: OpportunityType
    status: OpportunityStatus
    count: number
    total_amount: number
  }[]
  renewal_risks: {
    constituent: Constituent
    score: Score
    days_since_touch: number
  }[]
  ask_ready_prospects: {
    constituent: Constituent
    score: Score
    opportunity: Opportunity | null
  }[]
  recent_activity: InteractionLog[]
  performance: {
    won_this_month: number
    won_this_month_amount: number
    active_count: number
    active_total: number
  }
}

export interface MajorGiftsDashboard {
  active_pipeline: Opportunity[]
  ask_ready_top_50: {
    constituent: Constituent
    score: Score
    opportunity: Opportunity | null
  }[]
  my_proposals: Proposal[]
}

export interface TicketingDashboard {
  renewal_risks_top_100: {
    constituent: Constituent
    score: Score
    lifetime_spend: number
  }[]
  premium_holders_top_50: {
    constituent: Constituent
    lifetime_spend: number
    sport_affinity: string | null
  }[]
}

export interface CorporateDashboard {
  active_partnerships: Opportunity[]
  corporate_prospects: {
    constituent: Constituent
    score: Score
    opportunity: Opportunity | null
  }[]
}

/**
 * Work Queue Response
 */
export interface WorkQueueResponse {
  tasks: TaskWorkItem[]
  total: number
  page: number
  page_size: number
  grouped_by_type?: {
    [key in TaskType]?: TaskWorkItem[]
  }
}

/**
 * Identity Resolution Request
 */
export interface IdentityResolveRequest {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  zip?: string
}

/**
 * Identity Resolution Response
 */
export interface IdentityResolveResponse {
  constituent_id: string
  household_id: string
  matched_strategy: 'email' | 'phone' | 'name_zip' | 'created_new'
  confidence: number
  constituent: Constituent
}

/**
 * CSV Ingest Request
 */
export interface CsvIngestRequest {
  file_url: string
  dry_run?: boolean
}

/**
 * CSV Ingest Response
 */
export interface CsvIngestResponse {
  success: boolean
  processed: number
  created: number
  updated: number
  errors: string[]
  dry_run: boolean
}

/**
 * Scoring Run Request
 */
export interface ScoringRunRequest {
  constituent_ids?: string[]
  batch_size?: number
}

/**
 * Scoring Run Response
 */
export interface ScoringRunResponse {
  success: boolean
  processed: number
  errors: string[]
  duration_ms: number
}

/**
 * Routing Engine Request
 */
export interface RoutingEngineRequest {
  opportunity_id?: string
  constituent_id?: string
  opportunity_type?: OpportunityType
  amount?: number
  override_collision?: boolean
}

/**
 * Routing Engine Response
 */
export interface RoutingEngineResponse {
  success: boolean
  routing: {
    primary_owner_role: string
    secondary_owner_roles: string[]
    task_created: boolean
    task_id?: string
  }
  collisions: {
    id: string
    type: string
    action: 'block' | 'warn'
    message: string
    window_days: number
    allow_override: boolean
  }[]
  blocked: boolean
}

/**
 * Proposal Generate Request
 */
export interface ProposalGenerateRequest {
  opportunity_id: string
  template_type?: 'major_gift' | 'corporate'
}

/**
 * Proposal Generate Response
 */
export interface ProposalGenerateResponse {
  success: boolean
  proposal_id: string
  proposal: Proposal
}

/**
 * Proposal Approve Request
 */
export interface ProposalApproveRequest {
  proposal_id: string
  approve: boolean
  notes?: string
}

/**
 * Proposal Approve Response
 */
export interface ProposalApproveResponse {
  success: boolean
  proposal: Proposal
  requires_additional_approval: boolean
  approvals_received: number
  approvals_required: number
}

/**
 * Proposal Send Request
 */
export interface ProposalSendRequest {
  proposal_id: string
  recipient_email: string
  cc_emails?: string[]
  custom_message?: string
  include_pdf?: boolean
}

/**
 * Proposal Send Response
 */
export interface ProposalSendResponse {
  success: boolean
  sent_at: string
  follow_up_task_id: string
}

/**
 * Voice Command Request
 */
export interface VoiceCommandRequest {
  transcript: string
}

/**
 * Voice Command Response
 */
export interface VoiceCommandResponse {
  success: boolean
  message: string
  intent?: {
    action: string
    confidence: number
    requires_confirmation?: boolean
  }
  display_data?: {
    type: 'table' | 'list' | 'summary' | 'profile' | 'action'
    data: any
  }
}

/**
 * Role Assignment Request
 */
export interface RoleAssignRequest {
  user_id: string
  role: AppRole
}

/**
 * Role List Response
 */
export interface RoleListResponse {
  user_id: string
  roles: UserRole[]
}

// ============================================================================
// FORM TYPES (for UI components)
// ============================================================================

/**
 * Constituent Form Data
 */
export interface ConstituentFormData {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  zip?: string
  sport_affinity?: string
}

/**
 * Opportunity Form Data
 */
export interface OpportunityFormData {
  constituent_id: string
  type: OpportunityType
  amount: number
  description?: string
  expected_close_date?: string
}

/**
 * Task Form Data
 */
export interface TaskFormData {
  type: TaskType
  priority: TaskPriority
  title: string
  description?: string
  constituent_id?: string
  opportunity_id?: string
  due_at?: string
}

/**
 * Interaction Form Data
 */
export interface InteractionFormData {
  constituent_id: string
  opportunity_id?: string
  type: InteractionType
  date: string
  notes?: string
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

/**
 * API Error Response
 */
export interface ApiError {
  error: string
  message: string
  details?: any
}

/**
 * Filter Options
 */
export interface FilterOptions {
  type?: OpportunityType | OpportunityType[]
  status?: OpportunityStatus | OpportunityStatus[]
  renewal_risk?: RenewalRisk | RenewalRisk[]
  ask_readiness?: AskReadiness | AskReadiness[]
  min_amount?: number
  max_amount?: number
  owner_user_id?: string
  owner_role?: string
  search?: string
}

/**
 * Sort Options
 */
export interface SortOptions {
  field: string
  direction: 'asc' | 'desc'
}

/**
 * Query Options
 */
export interface QueryOptions {
  filter?: FilterOptions
  sort?: SortOptions
  page?: number
  page_size?: number
}

// ============================================================================
// AUTH TYPES
// ============================================================================

/**
 * Authenticated User
 */
export interface AuthUser {
  id: string
  email: string
  roles: AppRole[]
  metadata?: {
    first_name?: string
    last_name?: string
  }
}

/**
 * Login Credentials
 */
export interface LoginCredentials {
  email: string
  password: string
}

/**
 * Auth State
 */
export interface AuthState {
  user: AuthUser | null
  loading: boolean
  error: string | null
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isOpportunityType(value: string): value is OpportunityType {
  return ['ticket', 'major_gift', 'corporate'].includes(value)
}

export function isOpportunityStatus(value: string): value is OpportunityStatus {
  return ['active', 'won', 'lost', 'paused'].includes(value)
}

export function isProposalStatus(value: string): value is ProposalStatus {
  return ['draft', 'pending_approval', 'approved', 'rejected', 'sent'].includes(value)
}

export function isTaskType(value: string): value is TaskType {
  return ['renewal', 'proposal_required', 'cultivation', 'follow_up', 'review_required'].includes(value)
}

export function isTaskStatus(value: string): value is TaskStatus {
  return ['pending', 'in_progress', 'completed', 'cancelled'].includes(value)
}

export function isTaskPriority(value: string): value is TaskPriority {
  return ['high', 'medium', 'low'].includes(value)
}

export function isAppRole(value: string): value is AppRole {
  return ['executive', 'major_gifts', 'ticketing', 'corporate', 'marketing', 'revenue_ops', 'admin'].includes(value)
}

// Task type alias for component compatibility
export type Task = TaskWorkItem
