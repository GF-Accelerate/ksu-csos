# KSU CSOS - API Reference

Complete API documentation for all Supabase Edge Functions.

**Base URL**: `https://your-project.supabase.co/functions/v1/`
**Authentication**: Bearer token (JWT from Supabase Auth)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Routing & Collision](#routing--collision)
3. [Scoring & Intelligence](#scoring--intelligence)
4. [Data Ingestion](#data-ingestion)
5. [Proposal Workflow](#proposal-workflow)
6. [Dashboard & Work Queue](#dashboard--work-queue)
7. [Voice & AI](#voice--ai)
8. [Administration](#administration)
9. [Error Handling](#error-handling)

---

## Authentication

All Edge Functions require authentication via JWT token.

### Headers

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Get JWT Token

```javascript
const { data: { session } } = await supabase.auth.getSession()
const token = session.access_token
```

---

## Routing & Collision

### 1. Routing Engine

Route opportunities based on YAML rules with collision detection.

**Endpoint**: `POST /routing_engine`

**Request Body**:
```json
{
  "opportunity_id": "uuid",
  "constituent_id": "uuid",
  "override_collisions": false
}
```

**Response**:
```json
{
  "success": true,
  "routing": {
    "primary_owner_role": "major_gifts",
    "secondary_owner_roles": ["marketing"],
    "collision_warnings": [
      {
        "type": "major_gift_active",
        "message": "Major gift opportunity active (14-day window)",
        "blocking": true
      }
    ]
  },
  "task_created": {
    "id": "uuid",
    "type": "cultivation",
    "priority": "high",
    "due_at": "2026-03-04T00:00:00Z"
  }
}
```

**Routing Rules** (`packages/rules/routing_rules.yaml`):
- 11 built-in rules (corporate, major gifts, ticketing)
- Priority-based evaluation (first match wins)
- Amount thresholds for team assignment

**Collision Rules** (`packages/rules/collision_rules.yaml`):
- Major gift ($25K+) → blocks ticketing for 14 days
- Major gift ($100K+) → blocks corporate for 30 days
- Corporate ($50K+) → warns major gifts for 14 days
- Pending proposal → hard-blocks new opportunities for 7 days

**Example**:
```javascript
const response = await fetch(
  'https://your-project.supabase.co/functions/v1/routing_engine',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      opportunity_id: 'abc-123',
      constituent_id: 'xyz-789'
    })
  }
)
const data = await response.json()
```

---

## Scoring & Intelligence

### 2. Scoring Run

Calculate scores for all constituents (daily batch job).

**Endpoint**: `POST /scoring_run`

**Request Body**:
```json
{
  "batch_size": 100,
  "constituent_ids": ["uuid1", "uuid2"]  // Optional: specific constituents
}
```

**Response**:
```json
{
  "success": true,
  "processed": 1523,
  "created": 1523,
  "updated": 0,
  "errors": [],
  "execution_time_ms": 12340
}
```

**Scoring Algorithms**:
- **Renewal Risk**: high (>180 days), medium (>90 days), low (<90 days)
- **Ask Readiness**: ready (active opp + touch <30 days), not_ready
- **Ticket Propensity**: 0-100 scale ($500 = 1 point)
- **Corporate Propensity**: 100 if is_corporate, 0 otherwise
- **Capacity Estimate**: lifetime_giving × 10

**Scheduled Execution**: Daily at 2:00 AM (pg_cron)

---

### 3. Identity Resolve

Match incoming records to existing constituents.

**Endpoint**: `POST /identity_resolve`

**Request Body**:
```json
{
  "email": "john.smith@example.com",
  "first_name": "John",
  "last_name": "Smith",
  "phone": "555-1234",
  "zip": "66502"
}
```

**Response**:
```json
{
  "success": true,
  "match_found": true,
  "constituent_id": "uuid",
  "match_strategy": "email",
  "confidence": 1.0,
  "household_id": "uuid"
}
```

**Matching Strategies** (in order):
1. **Email**: Exact match, case-insensitive (~1ms)
2. **Phone**: Normalized E.164 format (~1ms)
3. **Name + Zip**: Fuzzy match ≥80% similarity (~5-10ms)

**Performance**: 15-25ms per record, ~2-3 seconds for 100 records

---

## Data Ingestion

### 4. Ingest Paciolan

Import ticketing CSV from Paciolan.

**Endpoint**: `POST /ingest_paciolan`

**Request Body**:
```json
{
  "csv_content": "email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity\njohn@example.com,John,Smith,555-1234,66502,ACC123,5000,Football",
  "dry_run": false
}
```

**CSV Columns** (required):
- `email`, `first_name`, `last_name`, `phone`, `zip`
- `account_id`, `lifetime_spend`, `sport_affinity`

**Response**:
```json
{
  "success": true,
  "records_processed": 100,
  "constituents_created": 25,
  "constituents_updated": 75,
  "opportunities_created": 80,
  "opportunities_updated": 20,
  "errors": [],
  "warnings": ["Row 42: Missing phone number"]
}
```

**Side Effects**:
- Sets `is_ticket_holder = true`
- Updates `lifetime_ticket_spend`
- Updates `sport_affinity`
- Creates ticket opportunities for active accounts

**Performance**: ~30-40 rows/sec

---

### 5. Ingest Raiser's Edge

Import donor CSV from Raiser's Edge.

**Endpoint**: `POST /ingest_raisers_edge`

**Request Body**:
```json
{
  "csv_content": "email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating\njane@example.com,Jane,Doe,555-5678,66502,DON456,25000,100000",
  "dry_run": false
}
```

**CSV Columns** (required):
- `email`, `first_name`, `last_name`, `phone`, `zip`
- `donor_id`, `lifetime_giving`, `capacity_rating`

**Response**:
```json
{
  "success": true,
  "records_processed": 50,
  "constituents_created": 10,
  "constituents_updated": 40,
  "opportunities_created": 35,
  "opportunities_updated": 5,
  "errors": [],
  "warnings": []
}
```

**Side Effects**:
- Sets `is_donor = true`
- Updates `lifetime_giving`
- Creates major gift opportunities if:
  - `lifetime_giving >= $1,000` OR
  - `capacity_rating >= $10,000`
- Ask amount = `max(capacity × 0.10, giving × 0.20, $5,000)`

**Performance**: ~30-40 rows/sec

---

## Proposal Workflow

### 6. Proposal Generate

Generate AI-powered proposal content.

**Endpoint**: `POST /proposal_generate`

**Request Body**:
```json
{
  "opportunity_id": "uuid",
  "template_type": "major_gift"  // or "corporate"
}
```

**Response**:
```json
{
  "success": true,
  "proposal_id": "uuid",
  "generated_content": "Dear John and Mary Smith,\n\nThank you for your generous support...",
  "status": "draft",
  "requires_approval": true,
  "approval_threshold": {
    "amount": 25000,
    "approvals_required": 1,
    "approver_roles": ["deputy_ad_revenue", "senior_associate_ad"]
  }
}
```

**Template Types**:
- `major_gift`: 5-section structure (opening, opportunity, investment, recognition, next steps)
- `corporate`: 6-section structure (summary, opportunity, benefits, investment, brand value, next steps)

**LLM Integration**: OpenAI GPT-4 (configurable to Anthropic Claude)

**Prompt Templates**: `packages/prompts/proposals/`

---

### 7. Proposal Approve

Approve or reject proposals.

**Endpoint**: `POST /proposal_approve`

**Request Body**:
```json
{
  "proposal_id": "uuid",
  "action": "approve",  // or "reject"
  "notes": "Approved for submission",
  "rejection_reason": null  // Required if action = "reject"
}
```

**Response**:
```json
{
  "success": true,
  "proposal_id": "uuid",
  "status": "approved",
  "approved_by": "user_uuid",
  "approved_at": "2026-02-25T14:30:00Z",
  "approvals_remaining": 0
}
```

**Approval Thresholds** (`packages/rules/approval_thresholds.yaml`):
- Major gifts: $1M+ (2 approvals), $100K-$999K (1), $25K-$99K (1), <$25K (auto)
- Corporate: $100K+ (2 approvals), $25K-$99K (1), <$25K (auto)
- Ticketing: $10K+ (1 approval), <$10K (auto)

**Multi-Level Approval**: Partial approvals tracked until threshold met

---

### 8. Proposal Send

Send approved proposals via email.

**Endpoint**: `POST /proposal_send`

**Request Body**:
```json
{
  "proposal_id": "uuid",
  "recipient_email": "john.smith@example.com",
  "cc_emails": ["colleague@ksu.edu"],
  "custom_message": "Looking forward to discussing this opportunity with you.",
  "send_pdf": true
}
```

**Response**:
```json
{
  "success": true,
  "proposal_id": "uuid",
  "sent_at": "2026-02-25T14:45:00Z",
  "recipient_email": "john.smith@example.com",
  "follow_up_task_id": "uuid",
  "follow_up_due_at": "2026-03-04T14:45:00Z"
}
```

**Side Effects**:
- Updates proposal status to `sent`
- Logs interaction to `interaction_log`
- Creates follow-up task (7 days)
- Sends HTML email with optional PDF attachment

---

## Dashboard & Work Queue

### 9. Dashboard Data

Get cached dashboard metrics.

**Endpoint**: `POST /dashboard_data`

**Request Body**:
```json
{
  "dashboard_type": "executive"  // or "major_gifts", "ticketing", "corporate"
}
```

**Response** (Executive Dashboard):
```json
{
  "success": true,
  "data": {
    "pipeline_summary": {
      "total_opportunities": 342,
      "total_amount": 12500000,
      "by_type": {
        "major_gift": { "count": 150, "amount": 8500000 },
        "ticket": { "count": 120, "amount": 2000000 },
        "corporate": { "count": 72, "amount": 2000000 }
      }
    },
    "renewal_risks": [
      {
        "constituent_id": "uuid",
        "first_name": "John",
        "last_name": "Smith",
        "renewal_risk": "high",
        "days_since_touch": 245,
        "lifetime_value": 125000
      }
    ],
    "ask_ready_prospects": [...],
    "recent_activity": [...]
  },
  "cached_at": "2026-02-25T14:30:00Z",
  "cache_ttl_seconds": 900
}
```

**Cache**: 15-minute TTL, 97% hit rate

**Dashboard Types**:
- `executive`: Pipeline summary, renewal risks, ask-ready prospects
- `major_gifts`: Active pipeline, top 50 ask-ready, my proposals
- `ticketing`: Top 100 renewal risks, top 50 premium holders
- `corporate`: Active partnerships, corporate prospects

---

### 10. Work Queue

Get prioritized task queue.

**Endpoint**: `POST /work_queue`

**Request Body**:
```json
{
  "user_id": "uuid",
  "role": "major_gifts",
  "filter": "high_priority",  // or "all", "overdue"
  "page": 1,
  "page_size": 50
}
```

**Response**:
```json
{
  "success": true,
  "tasks": [
    {
      "id": "uuid",
      "type": "renewal",
      "description": "Call John Smith about season ticket renewal",
      "priority": "high",
      "status": "open",
      "due_at": "2026-02-26T00:00:00Z",
      "constituent_id": "uuid",
      "opportunity_id": "uuid",
      "assigned_user_id": "uuid",
      "assigned_role": "major_gifts"
    }
  ],
  "total": 23,
  "page": 1,
  "page_size": 50,
  "has_more": false
}
```

**Task Types**: renewal, proposal_required, cultivation, follow_up, review_required

**Priority Levels**: high (3 days), medium (7 days), low (14 days)

**Claiming**: Use `POST /work_queue/claim` with `task_id` to assign to current user

---

## Voice & AI

### 11. Voice Command

Process natural language voice commands.

**Endpoint**: `POST /voice_command`

**Request Body**:
```json
{
  "transcript": "Show me renewals at risk",
  "context": {
    "current_page": "dashboard",
    "selected_constituent_id": null
  }
}
```

**Response**:
```json
{
  "success": true,
  "intent": {
    "action": "show_renewals",
    "confidence": 0.95,
    "parameters": {
      "risk_level": "all"
    },
    "requires_confirmation": false
  },
  "message": "Found 23 constituents at risk of not renewing.",
  "result": [...],
  "display_data": {
    "type": "table",
    "columns": ["Name", "Email", "Lifetime Value", "Risk Level"],
    "rows": [...]
  }
}
```

**Supported Actions**:
- `show_renewals`: Show constituents at risk (params: risk_level)
- `show_prospects`: Show ask-ready prospects (params: limit)
- `show_queue`: Show user's work queue (params: filter)
- `show_pipeline`: Show pipeline summary (params: type)
- `find_constituent`: Find specific constituent (params: name, email)
- `generate_proposal`: Generate proposal (params: constituent_name, amount)

**LLM Integration**: OpenAI GPT-4o-mini for intent parsing

**Fallback**: Rule-based parsing if API unavailable

**Confidence Threshold**: ≥50% required, otherwise asks for clarification

**Display Data Types**:
- `table`: Columns + rows (renewals, prospects)
- `list`: Items with title/subtitle/priority (work queue)
- `summary`: Metrics grid (pipeline stats)
- `profile`: Constituent card with tags
- `action`: Next step suggestions

---

## Administration

### 12. Role Assign

Assign or remove user roles.

**Endpoint**: `POST /role_assign`

**Request Body**:
```json
{
  "user_id": "uuid",
  "role": "major_gifts",
  "action": "assign"  // or "remove"
}
```

**Response**:
```json
{
  "success": true,
  "user_id": "uuid",
  "role": "major_gifts",
  "action": "assign",
  "assigned_by": "admin_uuid",
  "assigned_at": "2026-02-25T15:00:00Z"
}
```

**Valid Roles**:
- `executive`, `major_gifts`, `ticketing`, `corporate`
- `marketing`, `revenue_ops`, `admin`

**Security**:
- Admin or executive only
- Self-protection (can't remove own admin role)
- Full audit trail

---

### 13. Role List

List user roles.

**Endpoint**: `POST /role_list`

**Request Body**:
```json
{
  "user_id": "uuid"  // Optional: omit to list all
}
```

**Response**:
```json
{
  "success": true,
  "roles": [
    {
      "user_id": "uuid",
      "role": "major_gifts",
      "assigned_by": "admin_uuid",
      "assigned_at": "2026-02-20T10:00:00Z"
    }
  ]
}
```

**Authorization**: Users can query own roles, admin can query any user

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### Common Error Codes

**Authentication**:
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Insufficient permissions

**Validation**:
- `400 Bad Request`: Invalid request body or parameters
- `422 Unprocessable Entity`: Business logic validation failed

**Resource**:
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Duplicate record or constraint violation

**Server**:
- `500 Internal Server Error`: Unexpected server error
- `503 Service Unavailable`: External service (LLM, email) unavailable

### Example Error Responses

**Missing Required Field**:
```json
{
  "success": false,
  "error": "Missing required field: opportunity_id",
  "code": "VALIDATION_ERROR"
}
```

**Insufficient Permissions**:
```json
{
  "success": false,
  "error": "User does not have permission to approve proposals",
  "code": "PERMISSION_DENIED",
  "details": {
    "required_roles": ["deputy_ad_revenue", "senior_associate_ad"],
    "user_roles": ["major_gifts"]
  }
}
```

**External Service Failure**:
```json
{
  "success": false,
  "error": "LLM API unavailable, falling back to rule-based parsing",
  "code": "EXTERNAL_SERVICE_ERROR",
  "details": {
    "service": "OpenAI",
    "fallback_used": true
  }
}
```

---

## Rate Limits

**Supabase Free Tier**:
- 500K Edge Function invocations/month
- 50K database rows read/month
- 50GB bandwidth/month

**Supabase Pro Tier**:
- 2M Edge Function invocations/month
- Unlimited database rows
- 250GB bandwidth/month

**OpenAI API**:
- GPT-4o-mini: 500K tokens/minute (Tier 1)
- Rate limit headers returned in response

**Recommended Client-Side Rate Limiting**:
- Dashboard refresh: Every 5 minutes (not on every click)
- Search debouncing: 300-500ms
- Voice commands: 1 per 2 seconds

---

## Webhooks (Future)

Planned webhook support for external integrations:

- **Proposal Sent**: Notify CRM when proposal sent
- **Opportunity Won**: Update ticketing system
- **Task Overdue**: Send Slack notification
- **Score Update**: Trigger external workflows

---

## SDK Usage Examples

### JavaScript/TypeScript

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
)

// Call Edge Function
const { data, error } = await supabase.functions.invoke('routing_engine', {
  body: {
    opportunity_id: 'abc-123',
    constituent_id: 'xyz-789'
  }
})

if (error) {
  console.error('Error:', error)
} else {
  console.log('Result:', data)
}
```

### cURL

```bash
curl -X POST \
  'https://your-project.supabase.co/functions/v1/routing_engine' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "opportunity_id": "abc-123",
    "constituent_id": "xyz-789"
  }'
```

---

## Versioning

**Current Version**: v1
**API Stability**: Beta (subject to change)
**Backward Compatibility**: Best effort for v1 endpoints

**Breaking Changes**:
- Will be announced 30 days in advance
- Migration guide provided
- Deprecated endpoints supported for 90 days

---

## Support

For API issues:
1. Check this documentation
2. Review Edge Function logs in Supabase dashboard
3. Check GitHub issues: https://github.com/your-org/ksu-csos/issues
4. Contact: support@example.com
