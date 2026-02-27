/**
 * WorkQueue Component
 *
 * Reusable work queue widget for displaying and managing tasks.
 */

import { useState, useEffect } from 'react'
import { getMyWorkQueue, completeTask } from '@/services/taskService'
import type { WorkQueueResponse, Task } from '@/types'

interface WorkQueueProps {
  title?: string
  limit?: number
  showEmptyState?: boolean
  onTaskClick?: (task: Task) => void
  className?: string
}

export function WorkQueue({
  title = 'My Work Queue',
  limit = 20,
  showEmptyState = true,
  onTaskClick,
  className = '',
}: WorkQueueProps) {
  const [queue, setQueue] = useState<WorkQueueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadQueue()
  }, [])

  const loadQueue = async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await getMyWorkQueue({ page_size: limit })
      setQueue(data)
    } catch (err: any) {
      console.error('Failed to load work queue:', err)
      setError(err.message || 'Failed to load work queue')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async (taskId: string) => {
    try {
      await completeTask(taskId)
      await loadQueue() // Reload queue
    } catch (err: any) {
      alert(err.message || 'Failed to complete task')
    }
  }

  if (loading) {
    return (
      <div className={`card ${className}`}>
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
        </div>
        <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem' }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`card ${className}`}>
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
        </div>
        <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span className="alert-message">{error}</span>
          </div>
        </div>
      </div>
    )
  }

  const tasks = queue?.tasks || []

  return (
    <div className={`card ${className}`}>
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        {queue && (
          <span className="text-sm text-muted">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        )}
      </div>
      <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
        {tasks.length === 0 && showEmptyState ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h3 className="empty-state-title">All Caught Up!</h3>
            <p className="empty-state-description">You have no pending tasks.</p>
          </div>
        ) : (
          <ul className="work-queue-list">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="work-queue-item"
                onClick={onTaskClick ? () => onTaskClick(task) : undefined}
                style={onTaskClick ? { cursor: 'pointer' } : undefined}
              >
                <div className="work-queue-header">
                  <div className="work-queue-info">
                    <span className="badge badge-secondary">{task.type}</span>
                    <span
                      className={`badge badge-${
                        task.priority === 'high'
                          ? 'danger'
                          : task.priority === 'medium'
                            ? 'warning'
                            : 'info'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleComplete(task.id)
                    }}
                  >
                    Complete
                  </button>
                </div>
                <div className="work-queue-description">{task.description}</div>
                <div className="work-queue-meta text-sm text-muted">
                  Due: {new Date(task.due_at).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
