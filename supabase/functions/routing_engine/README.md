# Routing Engine Edge Function

Automatically routes opportunities to appropriate teams and detects collisions to prevent conflicting constituent touches.

## Overview

The routing engine evaluates YAML-based rules to:
- **Assign ownership**: Determine which team owns an opportunity (major_gifts, ticketing, corporate)
- **Detect collisions**: Prevent conflicting touches across teams (e.g., major gift solicitation blocks ticket renewal call)
- **Create tasks**: Generate work items for assigned teams
- **Coordinate strategy**: Notify secondary teams when coordination is required

## Endpoint

`POST /functions/v1/routing_engine`

## Authentication

Requires authentication with one of the following roles:
- `admin`
- `executive`
- `revenue_ops`
- `major_gifts`
- `ticketing`
- `corporate`

## Request Body

### Route Existing Opportunity
```json
{
  "opportunityId": "opp-123"
}
```

### Create and Route New Opportunity
```json
{
  "constituentId": "const-456",
  "opportunityType": "major_gift",
  "amount": 50000,
  "status": "active"
}
```

### Override Collision Block
```json
{
  "constituentId": "const-456",
  "opportunityType": "ticket",
  "amount": 5000,
  "override": true
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opportunityId` | string | Conditional | ID of existing opportunity to route |
| `constituentId` | string | Conditional | ID of constituent (for new opportunity) |
| `opportunityType` | string | Conditional | 'ticket', 'major_gift', or 'corporate' |
| `amount` | number | Conditional | Opportunity amount |
| `status` | string | No | Opportunity status (default: 'active') |
| `override` | boolean | No | Override collision block if allowed (default: false) |

**Note**: Either `opportunityId` OR (`constituentId` + `opportunityType` + `amount`) required.

## Response

### Success (200) - No Collisions
```json
{
  "success": true,
  "data": {
    "routing": {
      "matched_rule": "major_gift_principal",
      "primary_owner_role": "major_gifts",
      "secondary_owner_roles": [],
      "tasks_created": ["task-789"]
    },
    "collisions": {
      "collisions": [],
      "blocked": false
    },
    "opportunity_id": "opp-123",
    "message": "Routed to major_gifts. 0 collision(s) detected."
  }
}
```

### Success (200) - Collision Detected (Warning)
```json
{
  "success": true,
  "data": {
    "routing": {
      "matched_rule": "ticket_season_package",
      "primary_owner_role": "ticketing",
      "secondary_owner_roles": [],
      "tasks_created": ["task-790"]
    },
    "collisions": {
      "collisions": [
        {
          "rule_id": "major_gift_blocks_ticketing",
          "rule_name": "Major Gift Blocks Ticketing Touches",
          "action": "warn",
          "blocking_opportunity_id": "opp-456",
          "blocking_opportunity_type": "major_gift",
          "window_days": 14,
          "days_remaining": 9,
          "can_override": true,
          "message": "Active major gift solicitation in progress - coordinate with major gifts team"
        }
      ],
      "blocked": false
    },
    "opportunity_id": "opp-791",
    "message": "Routed to ticketing. 1 collision(s) detected."
  }
}
```

### Success (200) - Collision Blocked
```json
{
  "success": true,
  "data": {
    "routing": {
      "matched_rule": "ticket_season_package",
      "primary_owner_role": "ticketing",
      "secondary_owner_roles": []
    },
    "collisions": {
      "collisions": [
        {
          "rule_id": "major_gift_blocks_ticketing",
          "rule_name": "Major Gift Blocks Ticketing Touches",
          "action": "block",
          "blocking_opportunity_id": "opp-456",
          "blocking_opportunity_type": "major_gift",
          "window_days": 14,
          "days_remaining": 12,
          "can_override": true,
          "message": "Active major gift solicitation ($100k+) blocks ticket touches for 12 more days"
        }
      ],
      "blocked": true
    },
    "blocked": true,
    "message": "Opportunity creation blocked due to collision. Set override=true to bypass (if allowed)."
  }
}
```

### Error Response (400/404/500)
```json
{
  "error": "Constituent not found"
}
```

## Routing Rules

Rules are defined in `packages/rules/routing_rules.yaml` and evaluated in priority order (ascending).

### Rule Structure
```yaml
- id: major_gift_principal
  priority: 60
  name: "Principal Gift ($25k-$99k)"
  when:
    opportunity_type: major_gift
    amount_min: 25000
    amount_max: 99999
  then:
    primary_owner_role: major_gifts
    create_task: true
    task_type: proposal_required
    task_priority: medium
  notes: "$25k-$99k principal gifts"
```

### When Conditions

| Condition | Type | Description |
|-----------|------|-------------|
| `opportunity_type` | string | 'ticket', 'major_gift', or 'corporate' |
| `amount_min` | number | Minimum amount (inclusive) |
| `amount_max` | number | Maximum amount (inclusive) |
| `status` | string | Opportunity status |
| `constituent_is_corporate` | boolean | Corporate flag |
| `constituent_is_donor` | boolean | Donor flag |
| `constituent_is_ticket_holder` | boolean | Ticket holder flag |

### Then Actions

| Action | Type | Description |
|--------|------|-------------|
| `primary_owner_role` | string | Team that owns this opportunity |
| `secondary_owner_roles` | string[] | Teams to notify/involve |
| `create_task` | boolean | Create work item for owner |
| `task_type` | string | renewal, proposal_required, cultivation, follow_up, review_required |
| `task_priority` | string | low, medium, high |

### Built-in Routing Rules

**Corporate Partnerships**:
- Large ($100k+): Corporate + executive + marketing
- Medium ($25k-$99k): Corporate + marketing
- Small (<$25k): Corporate only

**Major Gifts**:
- Transformational ($1M+): Major gifts + executive + marketing
- Leadership ($100k-$999k): Major gifts + executive
- Principal ($25k-$99k): Major gifts
- Standard ($5k-$24k): Major gifts

**Ticketing**:
- Premium ($10k+): Ticketing + major gifts (cross-sell potential)
- Season ($2.5k-$9.9k): Ticketing
- Group (<$2.5k): Ticketing

**Fallback**:
- Default: Revenue ops (review required)

## Collision Detection

Collision rules are defined in `packages/rules/collision_rules.yaml`.

### Collision Rule Structure
```yaml
- id: major_gift_blocks_ticketing
  priority: 10
  name: "Major Gift Blocks Ticketing Touches"
  when:
    blocking_opportunity_type: major_gift
    blocking_opportunity_status: active
    blocked_opportunity_type: ticket
    amount_min: 25000
  then:
    action: block
    window_days: 14
    allow_owner_override: true
    notification_required: true
    notification_roles:
      - major_gifts
      - ticketing
      - revenue_ops
  notes: "Active major gift blocks ticket calls for 14 days"
```

### Collision Actions

- **block**: Prevents opportunity creation (user must wait or override)
- **warn**: Allows creation but sends notifications (coordination required)

### Collision Windows

| Scenario | Window | Override |
|----------|--------|----------|
| Major gift ($25k+) blocks ticketing | 14 days | Yes |
| Major gift ($100k+) blocks corporate approach | 30 days | Yes |
| Corporate ($50k+) warns major gifts | 14 days | Yes |
| Corporate ($25k+) blocks ticket blasts | 7 days | Yes |
| Pending proposal blocks new ask | 7 days | No (hard block) |
| Recent loss blocks re-ask | 30 days | Yes |

### Built-in Collision Rules

1. **Major Gift Priority**: Active major gift ($25k+) blocks ticket touches for 14 days
2. **Corporate Coordination**: Corporate deals warn major gifts team about employees
3. **Proposal Lock**: Pending proposal hard-blocks new opportunities for 7 days
4. **Loss Cooldown**: Recent lost opportunity warns against re-solicitation for 30 days
5. **Blended Deal Alert**: Multiple active opportunities trigger coordination warning

## Processing Logic

### Flow
```
1. Load routing rules and collision rules from YAML
   │
   ▼
2. Build evaluation context (opportunity + constituent data)
   │
   ▼
3. Find matching routing rule (first match by priority)
   │
   ▼
4. Check for collisions with existing opportunities
   │
   ├─► If blocked → Return error (unless override=true)
   └─► If warnings → Continue with notifications
   │
   ▼
5. Create or update opportunity with routing decision
   │
   ▼
6. Create task work items for assigned team
   │
   ▼
7. Log to audit trail
   │
   ▼
8. Return routing decision + collision details
```

## Use Cases

### 1. Route New Major Gift Opportunity

```bash
curl -X POST http://localhost:54321/functions/v1/routing_engine \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "constituentId": "const-123",
    "opportunityType": "major_gift",
    "amount": 75000,
    "status": "active"
  }'
```

**Result**: Routed to major_gifts team, task created for proposal

### 2. Check for Collisions Before Ticket Blast

```bash
curl -X POST http://localhost:54321/functions/v1/routing_engine \
  -H "Content-Type": application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "constituentId": "const-456",
    "opportunityType": "ticket",
    "amount": 5000
  }'
```

**Result**: If major gift active, collision detected and opportunity blocked

### 3. Override Collision with Justification

```bash
curl -X POST http://localhost:54321/functions/v1/routing_engine \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "constituentId": "const-456",
    "opportunityType": "ticket",
    "amount": 5000,
    "override": true
  }'
```

**Result**: Collision bypassed, opportunity created with warning logged

### 4. Route Existing Opportunity (Re-routing)

```bash
curl -X POST http://localhost:54321/functions/v1/routing_engine \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "opportunityId": "opp-789"
  }'
```

**Result**: Opportunity re-evaluated and routed to appropriate team

## Task Work Item Creation

When `create_task: true` in routing rule:

**Due Dates by Priority**:
- **High**: 3 days from now
- **Medium**: 7 days from now
- **Low**: 14 days from now

**Task Types**:
- `proposal_required`: Major gift proposals
- `renewal`: Ticket renewals
- `cultivation`: Relationship building
- `follow_up`: General follow-up
- `review_required`: Needs manual review

## Integration Examples

### After CSV Import

```typescript
// Import donors from Raiser's Edge
const result = await ingestRaisersEdge(csvData)

// Route newly created opportunities
for (const opp of result.opportunities) {
  await routingEngine({ opportunityId: opp.id })
}
```

### Work Queue Queries

```sql
-- Get my assigned tasks from routing
SELECT t.*, o.type, c.first_name, c.last_name
FROM task_work_item t
JOIN opportunity o ON t.opportunity_id = o.id
JOIN constituent_master c ON t.constituent_id = c.id
WHERE t.assigned_role = 'major_gifts'
  AND t.status = 'pending'
ORDER BY t.priority DESC, t.due_at ASC;
```

### Collision Report

```sql
-- Query opportunities with collisions in last 7 days
SELECT
  c.first_name,
  c.last_name,
  o1.type as blocking_type,
  o1.amount as blocking_amount,
  o2.type as blocked_type,
  o2.amount as blocked_amount
FROM opportunity o1
JOIN opportunity o2 ON o1.constituent_id = o2.constituent_id
JOIN constituent_master c ON o1.constituent_id = c.id
WHERE o1.status = 'active'
  AND o2.created_at > o1.updated_at
  AND o2.created_at > NOW() - INTERVAL '7 days'
  AND o1.type != o2.type;
```

## Testing

Run unit tests:
```bash
cd supabase/functions/routing_engine
deno test --allow-all
```

Unit tests cover:
- Rule evaluation logic (14 tests)
- Routing priority (3 tests)
- Collision detection (3 tests)

## Error Handling

The function returns detailed errors:

- **404**: Opportunity or constituent not found
- **400**: Missing required fields
- **500**: Rule evaluation failed or database error

Collisions are NOT errors - they return success (200) with `blocked: true` flag.

## Troubleshooting

### Issue: All opportunities route to default (revenue_ops)

**Cause**: Rules not matching
**Solution**:
- Check YAML syntax in `routing_rules.yaml`
- Verify rules uploaded to Supabase Storage
- Check rule priorities (lower = higher precedence)

### Issue: No collisions detected

**Cause**: Collision rules not loaded or don't match
**Solution**:
- Verify `collision_rules.yaml` exists in Storage
- Check `when` conditions match your scenario
- Ensure existing opportunity is `status='active'`

### Issue: Can't override collision block

**Cause**: Rule has `allow_owner_override: false`
**Solution**:
- Hard blocks (pending proposal, etc.) cannot be overridden
- Resolve blocking opportunity first
- Contact revenue ops for manual intervention

### Issue: Tasks not being created

**Cause**: Rule has `create_task: false` or task creation failed
**Solution**:
- Check routing rule `then.create_task` value
- Verify `task_work_item` table permissions
- Check logs for task creation errors

## Audit Trail

All routing decisions logged to `audit_log`:

```sql
SELECT *
FROM audit_log
WHERE action = 'route_opportunity'
ORDER BY created_at DESC
LIMIT 10;
```

Logged details:
- Opportunity ID
- Constituent ID
- Matched routing rule
- Primary owner role
- Collision rule IDs (if any)

## Performance

- **Rule evaluation**: <5ms (in-memory after first load)
- **Collision detection**: 10-20ms (depends on # of active opportunities)
- **Total latency**: Typically 50-100ms

**Optimization**:
- YAML rules cached for 5 minutes
- Indexes on `opportunity(constituent_id, status, updated_at)`
- Batch routing via queue for large imports

## Future Enhancements

1. **Machine Learning Routing**
   - Predict optimal owner based on constituent profile
   - Learn from won/lost patterns
   - Recommend blended deals

2. **Dynamic Collision Windows**
   - Adjust windows based on constituent lifetime value
   - Executive override with shorter windows
   - Seasonal adjustments (campaign periods)

3. **Multi-Team Collaboration**
   - Shared ownership model for blended deals
   - Split commission tracking
   - Coordinated touchpoint calendar

4. **Smart Notifications**
   - Slack/email alerts for collisions
   - Daily digest of routing decisions
   - Escalation for blocked opportunities

## Related Functions

- `ingest_paciolan` - Routes imported ticket opportunities
- `ingest_raisers_edge` - Routes imported major gift opportunities
- `work_queue` - Displays routed tasks
- `proposal_generate` - Uses routing to determine approval chain
