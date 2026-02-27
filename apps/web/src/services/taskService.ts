/**
 * Task Service
 *
 * API service layer for work queue and task operations.
 */

import { supabase, callEdgeFunction } from '@lib/supabase'
import type {
  TaskWorkItem,
  TaskFormData,
  WorkQueueResponse,
  PaginatedResponse,
  QueryOptions,
} from '@/types'

/**
 * Get all tasks with optional filtering, sorting, and pagination
 */
export async function getTasks(
  options?: QueryOptions
): Promise<PaginatedResponse<TaskWorkItem>> {
  let query = supabase
    .from('task_work_item')
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`,
      { count: 'exact' }
    )

  // Apply filters
  if (options?.filter) {
    const { filter } = options

    if (filter.type) {
      if (Array.isArray(filter.type)) {
        query = query.in('type', filter.type)
      } else {
        query = query.eq('type', filter.type)
      }
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        query = query.in('status', filter.status)
      } else {
        query = query.eq('status', filter.status)
      }
    }

    if (filter.owner_user_id) {
      query = query.eq('assigned_user_id', filter.owner_user_id)
    }

    if (filter.owner_role) {
      query = query.eq('assigned_role', filter.owner_role)
    }
  }

  // Apply sorting
  if (options?.sort) {
    query = query.order(options.sort.field, {
      ascending: options.sort.direction === 'asc',
    })
  } else {
    // Default sort by priority and due date
    query = query
      .order('priority', { ascending: false }) // high, medium, low
      .order('due_at', { ascending: true, nullsFirst: false })
  }

  // Apply pagination
  const page = options?.page || 1
  const pageSize = options?.page_size || 50
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  return {
    data: data || [],
    total: count || 0,
    page,
    page_size: pageSize,
    has_more: count ? to < count - 1 : false,
  }
}

/**
 * Get task by ID
 */
export async function getTask(id: string): Promise<TaskWorkItem> {
  const { data, error } = await supabase
    .from('task_work_item')
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Get my work queue (assigned to current user)
 */
export async function getMyWorkQueue(): Promise<WorkQueueResponse> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  return callEdgeFunction<WorkQueueResponse>('work_queue', {
    user_id: user.id,
  })
}

/**
 * Get work queue by role
 */
export async function getWorkQueueByRole(role: string): Promise<WorkQueueResponse> {
  return callEdgeFunction<WorkQueueResponse>('work_queue', {
    role,
  })
}

/**
 * Get unassigned tasks (available to claim)
 */
export async function getUnassignedTasks(): Promise<TaskWorkItem[]> {
  const { data, error } = await supabase
    .from('task_work_item')
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .is('assigned_user_id', null)
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) throw error
  return data || []
}

/**
 * Get overdue tasks
 */
export async function getOverdueTasks(): Promise<TaskWorkItem[]> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('task_work_item')
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .in('status', ['pending', 'in_progress'])
    .lt('due_at', now)
    .order('due_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Create new task
 */
export async function createTask(data: TaskFormData): Promise<TaskWorkItem> {
  const { data: task, error } = await supabase
    .from('task_work_item')
    .insert({
      type: data.type,
      status: 'pending',
      priority: data.priority,
      title: data.title,
      description: data.description || null,
      constituent_id: data.constituent_id || null,
      opportunity_id: data.opportunity_id || null,
      due_at: data.due_at || null,
    })
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .single()

  if (error) throw error
  return task
}

/**
 * Update task
 */
export async function updateTask(
  id: string,
  data: Partial<TaskFormData>
): Promise<TaskWorkItem> {
  const { data: task, error } = await supabase
    .from('task_work_item')
    .update({
      type: data.type,
      priority: data.priority,
      title: data.title,
      description: data.description,
      due_at: data.due_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .single()

  if (error) throw error
  return task
}

/**
 * Claim task (assign to current user)
 */
export async function claimTask(id: string): Promise<TaskWorkItem> {
  return callEdgeFunction<TaskWorkItem>('work_queue', {
    action: 'claim',
    task_id: id,
  })
}

/**
 * Update task status
 */
export async function updateTaskStatus(
  id: string,
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
): Promise<TaskWorkItem> {
  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  }

  // Set completed_at if completed
  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString()
  }

  const { data: task, error } = await supabase
    .from('task_work_item')
    .update(updateData)
    .eq('id', id)
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .single()

  if (error) throw error
  return task
}

/**
 * Complete task
 */
export async function completeTask(id: string): Promise<TaskWorkItem> {
  return updateTaskStatus(id, 'completed')
}

/**
 * Cancel task
 */
export async function cancelTask(id: string): Promise<TaskWorkItem> {
  return updateTaskStatus(id, 'cancelled')
}

/**
 * Delete task
 */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('task_work_item')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Assign task to user
 */
export async function assignTask(
  id: string,
  userId: string
): Promise<TaskWorkItem> {
  const { data: task, error } = await supabase
    .from('task_work_item')
    .update({
      assigned_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(
      `*,
      constituent:constituent_master(*),
      opportunity:opportunity(*),
      proposal:proposal(*)`
    )
    .single()

  if (error) throw error
  return task
}

/**
 * Get task statistics
 */
export async function getTaskStats() {
  const { data, error } = await supabase
    .from('task_work_item')
    .select('type, status, priority')

  if (error) throw error

  const stats = {
    by_type: {} as Record<string, number>,
    by_status: {} as Record<string, number>,
    by_priority: {} as Record<string, number>,
    totals: {
      count: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    },
  }

  data?.forEach((task) => {
    stats.by_type[task.type] = (stats.by_type[task.type] || 0) + 1
    stats.by_status[task.status] = (stats.by_status[task.status] || 0) + 1
    stats.by_priority[task.priority] = (stats.by_priority[task.priority] || 0) + 1

    stats.totals.count += 1
    if (task.status === 'pending') stats.totals.pending += 1
    if (task.status === 'in_progress') stats.totals.in_progress += 1
    if (task.status === 'completed') stats.totals.completed += 1
    if (task.status === 'cancelled') stats.totals.cancelled += 1
  })

  return stats
}
