# Dashboard Data & Work Queue Edge Functions

Provides aggregated dashboard metrics and prioritized work queues for KSU CSOS teams.

## Overview

Two functions for data visualization and task management:
1. **dashboard_data**: Aggregated metrics for executive and team dashboards
2. **work_queue**: Prioritized task work items with claiming and status updates

---

## Function 1: dashboard_data

Provides cached, aggregated data for dashboards with 15-minute TTL.

### Endpoint

`GET /functions/v1/dashboard_data?type=executive|major_gifts|ticketing|corporate`

### Authentication

**Executive Dashboard**: Requires admin, executive, or revenue_ops role
**Team Dashboards**: Requires admin, executive, revenue_ops, or respective team role

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Dashboard type (default: executive) |

### Dashboard Types

#### 1. Executive Dashboard (`type=executive`)

**Returns**:
```json
{
  "pipeline": {
    "by_type": {
      "major_gift": {
        "count": 150,
        "total_value": 5000000,
        "by_status": {
          "active": { "count": 100, "total_value": 3500000 },
          "won": { "count": 30, "total_value": 1200000 },
          "lost": { "count": 20, "total_value": 300000 }
        }
      },
      "ticket": { ... },
      "corporate": { ... }
    },
    "by_status": {
      "active": { "count": 250, "total_value": 7500000 },
      "won": { "count": 80, "total_value": 2000000 }
    },
    "total_count": 350,
    "total_value": 10000000
  },
  "renewal_risks": [
    {
      "constituent_id": "c123",
      "renewal_risk": "high",
      "days_since_touch": 200,
      "constituent": {
        "first_name": "John",
        "last_name": "Donor",
        "lifetime_ticket_spend": 15000,
        "sport_affinity": "Football"
      }
    }
  ],
  "ask_ready_prospects": [
    {
      "constituent_id": "c456",
      "ask_readiness": "ready",
      "capacity_estimate": 500000,
      "constituent": {
        "first_name": "Jane",
        "last_name": "Prospect",
        "lifetime_giving": 50000,
        "opportunity": [
          {
            "id": "opp-789",
            "type": "major_gift",
            "amount": 100000,
            "status": "active"
          }
        ]
      }
    }
  ],
  "recent_activity": {
    "proposals": [
      {
        "id": "prop-123",
        "type": "major_gift",
        "amount": 75000,
        "status": "sent",
        "sent_at": "2026-02-20T10:00:00Z"
      }
    ],
    "interactions": [
      {
        "id": "int-456",
        "type": "meeting",
        "occurred_at": "2026-02-24T14:30:00Z",
        "constituent": {
          "first_name": "Bob",
          "last_name": "Smith"
        }
      }
    ]
  },
  "performance": {
    "won_this_month": {
      "count": 15,
      "total_value": 450000
    }
  },
  "cache_timestamp": "2026-02-25T10:00:00Z"
}
```

**Metrics**:
- Pipeline by type and status
- Top 20 renewal risks (high risk only)
- Top 20 ask-ready prospects (sorted by capacity)
- Recent proposals (last 7 days)
- Recent interactions (last 7 days)
- Won deals this month

---

#### 2. Major Gifts Dashboard (`type=major_gifts`)

**Returns**:
```json
{
  "pipeline": [
    {
      "id": "opp-123",
      "amount": 150000,
      "status": "active",
      "constituent": {
        "first_name": "Major",
        "last_name": "Donor",
        "email": "major@example.com"
      }
    }
  ],
  "ask_ready": [
    {
      "constituent_id": "c123",
      "ask_readiness": "ready",
      "capacity_estimate": 1000000,
      "last_touch_date": "2026-02-20T10:00:00Z",
      "constituent": {
        "first_name": "Jane",
        "last_name": "Prospect",
        "lifetime_giving": 100000,
        "sport_affinity": "Basketball"
      }
    }
  ],
  "my_proposals": [
    {
      "id": "prop-456",
      "type": "major_gift",
      "amount": 75000,
      "status": "draft",
      "created_at": "2026-02-24T09:00:00Z",
      "constituent": {
        "first_name": "Bob",
        "last_name": "Smith"
      }
    }
  ]
}
```

**Metrics**:
- Active major gift pipeline (all active opportunities)
- Top 50 ask-ready prospects
- My proposals (draft and pending approval)

---

#### 3. Ticketing Dashboard (`type=ticketing`)

**Returns**:
```json
{
  "renewal_risks": [
    {
      "constituent_id": "c789",
      "renewal_risk": "high",
      "days_since_touch": 150,
      "ticket_propensity": 75,
      "constituent": {
        "first_name": "Season",
        "last_name": "Ticket",
        "email": "season@example.com",
        "phone": "555-0100",
        "lifetime_ticket_spend": 25000,
        "sport_affinity": "Football"
      }
    }
  ],
  "premium_holders": [
    {
      "constituent_id": "c890",
      "ticket_propensity": 95,
      "constituent": {
        "first_name": "Premium",
        "last_name": "Holder",
        "lifetime_ticket_spend": 45000,
        "sport_affinity": "All Sports"
      }
    }
  ]
}
```

**Metrics**:
- Top 100 renewal risks (high and medium)
- Top 50 premium ticket holders (propensity ≥50)

---

#### 4. Corporate Dashboard (`type=corporate`)

**Returns**:
```json
{
  "active_partnerships": [
    {
      "id": "opp-901",
      "amount": 200000,
      "status": "active",
      "expected_close_date": "2026-06-30",
      "constituent": {
        "company_name": "Tech Corp",
        "first_name": "Contact",
        "last_name": "Name",
        "email": "contact@techcorp.com"
      }
    }
  ],
  "prospects": [
    {
      "constituent_id": "c1001",
      "corporate_propensity": 100,
      "constituent": {
        "company_name": "Big Company",
        "is_corporate": true
      }
    }
  ]
}
```

**Metrics**:
- Active corporate partnerships
- Corporate propensity prospects (propensity = 100)

---

## Function 2: work_queue

Manages prioritized task work items with claiming and status updates.

### Endpoint

**GET**: Fetch work queue
```
GET /functions/v1/work_queue?assigned_to=combined&status=pending&page=1&limit=50
```

**POST**: Claim task or update status
```
POST /functions/v1/work_queue
Body: { "action": "claim", "taskId": "task-123" }
```

### Authentication

Requires authenticated user (any role).

### GET Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `assigned_to` | string | combined | user, role, or combined |
| `user_id` | string | current user | Specific user ID (admin only) |
| `role` | string | - | Role to filter (required if assigned_to=role) |
| `status` | string | pending | Task status: pending, in_progress, completed, all |
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Items per page (max 100) |

### GET Response

```json
{
  "work_queue": {
    "tasks": [
      {
        "id": "task-123",
        "type": "renewal",
        "constituent_id": "c123",
        "opportunity_id": "opp-456",
        "assigned_role": "ticketing",
        "assigned_user_id": null,
        "priority": "high",
        "status": "pending",
        "due_at": "2026-02-28T00:00:00Z",
        "notes": "High-value season ticket holder - renewal at risk",
        "constituent": {
          "first_name": "John",
          "last_name": "Donor",
          "email": "john@example.com",
          "sport_affinity": "Football"
        },
        "opportunity": {
          "type": "ticket",
          "amount": 15000,
          "status": "active"
        }
      }
    ],
    "grouped": {
      "renewal": [ ... ],
      "proposal_required": [ ... ],
      "cultivation": [ ... ],
      "follow_up": [ ... ],
      "review_required": [ ... ],
      "other": [ ... ]
    },
    "claimed": [ ... ],      // Tasks assigned to me
    "unclaimed": [ ... ],    // Team tasks available to claim
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 120,
      "total_pages": 3
    }
  },
  "assigned_to": "combined",
  "user_roles": ["major_gifts", "revenue_ops"]
}
```

### POST Actions

#### Claim Task
```json
{
  "action": "claim",
  "taskId": "task-123"
}
```

**Response**:
```json
{
  "task": {
    "id": "task-123",
    "assigned_user_id": "user-456",
    "updated_at": "2026-02-25T10:00:00Z"
  },
  "message": "Task claimed successfully"
}
```

#### Update Task Status
```json
{
  "action": "update_status",
  "taskId": "task-123",
  "status": "completed",
  "notes": "Called and renewed - $15k confirmed"
}
```

**Response**:
```json
{
  "task": {
    "id": "task-123",
    "status": "completed",
    "completed_at": "2026-02-25T10:00:00Z",
    "notes": "Called and renewed - $15k confirmed"
  },
  "message": "Task status updated successfully"
}
```

---

## Task Types

| Type | Description | Typical Source |
|------|-------------|----------------|
| `renewal` | Ticket renewal calls | Routing engine, scoring |
| `proposal_required` | Generate/send proposal | Routing engine |
| `cultivation` | Relationship building | Routing engine |
| `follow_up` | Follow up after action | Proposal send, routing |
| `review_required` | Manual review needed | Default routing |

## Task Priorities

| Priority | Due Date | Description |
|----------|----------|-------------|
| `high` | 3 days | Urgent action required |
| `medium` | 7 days | Standard priority |
| `low` | 14 days | Low urgency |

## Task Statuses

| Status | Description |
|--------|-------------|
| `pending` | Not started, available to claim |
| `in_progress` | Claimed and being worked on |
| `completed` | Finished |
| `cancelled` | No longer needed |

---

## Caching Strategy

**Dashboard Data**:
- 15-minute TTL (Time-To-Live)
- Cached per dashboard type
- Automatic refresh on cache miss
- Manual refresh: wait 15 minutes or clear cache

**Work Queue**:
- No caching (real-time)
- Always queries latest data
- Pagination for performance

---

## Use Cases

### 1. Executive Dashboard

```bash
curl -X GET "http://localhost:54321/functions/v1/dashboard_data?type=executive" \
  -H "Authorization: Bearer <jwt-token>"
```

**Use for**:
- Morning briefings
- Board reports
- Revenue tracking
- Risk monitoring

### 2. Team Dashboard

```bash
# Major gifts team
curl -X GET "http://localhost:54321/functions/v1/dashboard_data?type=major_gifts" \
  -H "Authorization: Bearer <jwt-token>"
```

### 3. My Work Queue

```bash
curl -X GET "http://localhost:54321/functions/v1/work_queue?assigned_to=user&status=pending" \
  -H "Authorization: Bearer <jwt-token>"
```

### 4. Team Work Queue (Available Tasks)

```bash
curl -X GET "http://localhost:54321/functions/v1/work_queue?assigned_to=role&role=ticketing" \
  -H "Authorization: Bearer <jwt-token>"
```

### 5. Claim Task

```bash
curl -X POST "http://localhost:54321/functions/v1/work_queue" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "action": "claim",
    "taskId": "task-123"
  }'
```

### 6. Complete Task

```bash
curl -X POST "http://localhost:54321/functions/v1/work_queue" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "action": "update_status",
    "taskId": "task-123",
    "status": "completed",
    "notes": "Renewal confirmed - $15k"
  }'
```

---

## Integration Examples

### Dashboard Auto-Refresh

```typescript
// Auto-refresh dashboard every 5 minutes
setInterval(async () => {
  const data = await fetch('/functions/v1/dashboard_data?type=executive', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const dashboard = await data.json()
  updateDashboardUI(dashboard)
}, 5 * 60 * 1000)
```

### Work Queue Widget

```typescript
// Load my work queue on page load
const response = await fetch('/functions/v1/work_queue?assigned_to=combined&status=pending&limit=10', {
  headers: { Authorization: `Bearer ${token}` }
})
const { work_queue } = await response.json()

// Display grouped by type
renderWorkQueue(work_queue.grouped)
```

### Claim and Start Task

```typescript
async function claimAndStart(taskId: string) {
  // Claim task
  await fetch('/functions/v1/work_queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'claim',
      taskId
    })
  })

  // Update to in_progress
  await fetch('/functions/v1/work_queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'update_status',
      taskId,
      status: 'in_progress'
    })
  })
}
```

---

## Performance

**Dashboard Data**:
- Cached: <10ms (in-memory cache hit)
- Uncached: 100-500ms (database queries + aggregation)
- 15-minute cache reduces DB load by ~97%

**Work Queue**:
- Query time: 50-200ms
- Pagination: 50 items default, 100 max
- Indexes on assigned_user_id, assigned_role, status, priority, due_at

---

## Troubleshooting

### Issue: Dashboard showing old data

**Cause**: Cache not expired yet
**Solution**:
- Wait 15 minutes for auto-refresh
- Restart function to clear cache
- Implement manual refresh endpoint (future)

### Issue: Work queue empty but tasks exist

**Cause**: Status filter or role mismatch
**Solution**:
- Check status parameter (try status=all)
- Verify user has correct role assigned
- Check assigned_to parameter (try assigned_to=combined)

### Issue: Can't claim task

**Cause**: Task already claimed by another user
**Solution**:
- Refresh work queue to get latest
- Check task.assigned_user_id
- Task must have assigned_user_id=null to claim

### Issue: Performance slow

**Cause**: Large result sets, missing indexes
**Solution**:
- Use pagination (limit=50 or less)
- Ensure indexes exist (0004_indexes.sql)
- Use filtered queries (status=pending instead of status=all)

---

## Future Enhancements

1. **Real-time Updates**: WebSocket for live dashboard updates
2. **Custom Dashboards**: User-configurable widgets and metrics
3. **Export**: CSV/PDF export of dashboard data
4. **Alerts**: Push notifications for high-priority tasks
5. **Analytics**: Trending, forecasting, comparative metrics
6. **Task Assignment**: Assign tasks to specific users
7. **Task Templates**: Pre-configured task types with checklists
8. **SLA Tracking**: Monitor task completion times

---

## Related Functions

- `routing_engine` - Creates task work items
- `proposal_send` - Creates follow-up tasks
- `scoring_run` - Provides renewal risk and ask readiness data for dashboards
