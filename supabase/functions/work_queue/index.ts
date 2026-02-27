/**
 * Work Queue Edge Function
 * Returns prioritized work items for users/teams
 *
 * GET /work_queue?assigned_to=user|role&user_id=...&role=...&status=pending&page=1&limit=50
 *
 * Returns:
 * - Prioritized task work items
 * - Grouped by type
 * - Filtered by assignment and status
 * - Paginated results
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, createServiceClient, getUserRoles } from '../_shared/supabase.ts'

/**
 * Get work queue for a specific user
 */
async function getUserWorkQueue(
  supabase: any,
  userId: string,
  status: string,
  page: number,
  limit: number
): Promise<any> {
  const offset = (page - 1) * limit

  // Get tasks assigned to this specific user
  let query = supabase
    .from('task_work_item')
    .select(`
      *,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        phone,
        company_name,
        sport_affinity
      ),
      opportunity:opportunity (
        id,
        type,
        amount,
        status
      )
    `, { count: 'exact' })
    .eq('assigned_user_id', userId)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: tasks, error, count } = await query
    .order('priority', { ascending: false })  // high, medium, low
    .order('due_at', { ascending: true })     // earliest due date first
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(`Failed to fetch user work queue: ${error.message}`)
  }

  // Group by type
  const grouped = {
    renewal: [] as any[],
    proposal_required: [] as any[],
    cultivation: [] as any[],
    follow_up: [] as any[],
    review_required: [] as any[],
    other: [] as any[]
  }

  tasks?.forEach((task: any) => {
    const taskType = task.type as keyof typeof grouped
    if (grouped[taskType]) {
      grouped[taskType].push(task)
    } else {
      grouped.other.push(task)
    }
  })

  return {
    tasks: tasks || [],
    grouped,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit)
    }
  }
}

/**
 * Get work queue for a role/team
 */
async function getRoleWorkQueue(
  supabase: any,
  role: string,
  status: string,
  page: number,
  limit: number
): Promise<any> {
  const offset = (page - 1) * limit

  // Get tasks assigned to this role
  let query = supabase
    .from('task_work_item')
    .select(`
      *,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        phone,
        company_name,
        sport_affinity
      ),
      opportunity:opportunity (
        id,
        type,
        amount,
        status
      )
    `, { count: 'exact' })
    .eq('assigned_role', role)
    .is('assigned_user_id', null)  // Not yet claimed by specific user

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: tasks, error, count } = await query
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(`Failed to fetch role work queue: ${error.message}`)
  }

  // Group by type
  const grouped = {
    renewal: [] as any[],
    proposal_required: [] as any[],
    cultivation: [] as any[],
    follow_up: [] as any[],
    review_required: [] as any[],
    other: [] as any[]
  }

  tasks?.forEach((task: any) => {
    const taskType = task.type as keyof typeof grouped
    if (grouped[taskType]) {
      grouped[taskType].push(task)
    } else {
      grouped.other.push(task)
    }
  })

  return {
    tasks: tasks || [],
    grouped,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit)
    }
  }
}

/**
 * Get combined work queue (both user-assigned and role-assigned)
 */
async function getCombinedWorkQueue(
  supabase: any,
  userId: string,
  userRoles: string[],
  status: string,
  page: number,
  limit: number
): Promise<any> {
  const offset = (page - 1) * limit

  // Get tasks assigned to user OR to any of their roles (not yet claimed)
  let query = supabase
    .from('task_work_item')
    .select(`
      *,
      constituent:constituent_master (
        id,
        first_name,
        last_name,
        email,
        phone,
        company_name,
        sport_affinity
      ),
      opportunity:opportunity (
        id,
        type,
        amount,
        status
      )
    `, { count: 'exact' })

  // Filter: assigned to me OR assigned to my role and unclaimed
  query = query.or(`assigned_user_id.eq.${userId},and(assigned_role.in.(${userRoles.join(',')}),assigned_user_id.is.null)`)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: tasks, error, count } = await query
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(`Failed to fetch combined work queue: ${error.message}`)
  }

  // Separate claimed vs unclaimed
  const claimed = tasks?.filter(t => t.assigned_user_id === userId) || []
  const unclaimed = tasks?.filter(t => !t.assigned_user_id) || []

  // Group by type
  const grouped = {
    renewal: [] as any[],
    proposal_required: [] as any[],
    cultivation: [] as any[],
    follow_up: [] as any[],
    review_required: [] as any[],
    other: [] as any[]
  }

  tasks?.forEach((task: any) => {
    const taskType = task.type as keyof typeof grouped
    if (grouped[taskType]) {
      grouped[taskType].push(task)
    } else {
      grouped.other.push(task)
    }
  })

  return {
    tasks: tasks || [],
    grouped,
    claimed,
    unclaimed,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit)
    }
  }
}

/**
 * Claim a task (assign to current user)
 */
async function claimTask(
  supabase: any,
  taskId: string,
  userId: string
): Promise<any> {
  // Update task to assign to user
  const { data, error } = await supabase
    .from('task_work_item')
    .update({
      assigned_user_id: userId,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .is('assigned_user_id', null)  // Only claim if unclaimed
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to claim task: ${error.message}`)
  }

  if (!data) {
    throw new Error('Task already claimed by another user')
  }

  return data
}

/**
 * Update task status
 */
async function updateTaskStatus(
  supabase: any,
  taskId: string,
  userId: string,
  newStatus: string,
  notes?: string
): Promise<any> {
  // Verify user owns this task
  const { data: task } = await supabase
    .from('task_work_item')
    .select('*')
    .eq('id', taskId)
    .single()

  if (!task) {
    throw new Error('Task not found')
  }

  if (task.assigned_user_id !== userId) {
    throw new Error('You do not own this task')
  }

  // Update status
  const updates: any = {
    status: newStatus,
    updated_at: new Date().toISOString()
  }

  if (notes) {
    updates.notes = notes
  }

  if (newStatus === 'completed') {
    updates.completed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('task_work_item')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update task: ${error.message}`)
  }

  return data
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate
    const { userId, supabase } = await requireAuth(req)

    // Use service client
    const serviceClient = createServiceClient()

    // Parse URL
    const url = new URL(req.url)
    const method = req.method

    // Handle POST requests (claim task, update status)
    if (method === 'POST') {
      const body = await req.json()
      const { action, taskId, status, notes } = body

      if (action === 'claim') {
        if (!taskId) {
          return errorResponse('Missing required field: taskId', 400)
        }

        const claimedTask = await claimTask(serviceClient, taskId, userId)

        return successResponse({
          task: claimedTask,
          message: 'Task claimed successfully'
        })
      } else if (action === 'update_status') {
        if (!taskId || !status) {
          return errorResponse('Missing required fields: taskId, status', 400)
        }

        const updatedTask = await updateTaskStatus(serviceClient, taskId, userId, status, notes)

        return successResponse({
          task: updatedTask,
          message: 'Task status updated successfully'
        })
      } else {
        return errorResponse(`Invalid action: ${action}`, 400)
      }
    }

    // Handle GET requests (fetch work queue)
    const assignedTo = url.searchParams.get('assigned_to') || 'combined'  // user, role, combined
    const specificUserId = url.searchParams.get('user_id')
    const role = url.searchParams.get('role')
    const status = url.searchParams.get('status') || 'pending'
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    // Get user roles
    const userRoles = await getUserRoles(serviceClient, specificUserId || userId)

    let workQueue: any

    if (assignedTo === 'user') {
      // Get tasks assigned to specific user
      const targetUserId = specificUserId || userId
      workQueue = await getUserWorkQueue(serviceClient, targetUserId, status, page, limit)
    } else if (assignedTo === 'role') {
      // Get tasks assigned to a role
      if (!role) {
        return errorResponse('Missing required parameter: role', 400)
      }
      workQueue = await getRoleWorkQueue(serviceClient, role, status, page, limit)
    } else {
      // Combined: both user-assigned and role-assigned
      workQueue = await getCombinedWorkQueue(serviceClient, userId, userRoles, status, page, limit)
    }

    return successResponse({
      work_queue: workQueue,
      assigned_to: assignedTo,
      user_roles: userRoles
    })

  } catch (error) {
    console.error('Work queue error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
