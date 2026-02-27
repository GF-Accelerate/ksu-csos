# Scoring Engine Edge Function

Calculates constituent scores for renewal risk, ask readiness, and propensity models.

## Overview

The scoring engine evaluates all constituents (or a subset) and calculates:
- **Renewal Risk**: Likelihood of not renewing (low/medium/high)
- **Ask Readiness**: Ready for solicitation (ready/not_ready)
- **Ticket Propensity**: Likelihood to buy tickets (0-100)
- **Corporate Propensity**: Likelihood of corporate partnership (0-100)
- **Capacity Estimate**: Wealth capacity (stub for future wealth screening)

## Endpoint

`POST /functions/v1/scoring_run`

## Authentication

Requires authentication with one of the following roles:
- `admin`
- `executive`
- `revenue_ops`

## Request Body

```json
{
  "constituentIds": ["c1", "c2", "c3"],
  "batchSize": 100
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `constituentIds` | string[] | No | Score specific constituents (default: all) |
| `batchSize` | number | No | Batch size for processing (default: 100) |

## Response

### Success (200)

```json
{
  "success": true,
  "data": {
    "result": {
      "totalConstituents": 1000,
      "scored": 998,
      "errors": [
        {
          "constituent_id": "c123",
          "error": "Failed to calculate score"
        }
      ],
      "duration": 15432
    },
    "message": "Scored 998/1000 constituents in 15432ms. Errors: 2"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalConstituents` | number | Total constituents to score |
| `scored` | number | Successfully scored constituents |
| `errors` | array | Errors encountered |
| `duration` | number | Processing time in milliseconds |

## Scoring Algorithms

### 1. Renewal Risk

**Purpose**: Identify constituents at risk of not renewing

**Algorithm**:
```typescript
if (daysSinceTouch === null || daysSinceTouch > 180) {
  return 'high'  // No touch or >6 months
} else if (daysSinceTouch > 90) {
  return 'medium'  // 3-6 months
} else {
  return 'low'  // <3 months
}
```

**Based on**:
- Last interaction date from `interaction_log` table
- Days since last touch

**Examples**:
- Last touch 200 days ago → **High risk**
- Last touch 120 days ago → **Medium risk**
- Last touch 30 days ago → **Low risk**
- No interactions ever → **High risk**

---

### 2. Ask Readiness

**Purpose**: Identify constituents ready for solicitation

**Algorithm**:
```typescript
if (hasActiveOpportunity && daysSinceTouch < 30) {
  return 'ready'  // Active opp + recent touch
} else {
  return 'not_ready'
}
```

**Based on**:
- Active opportunity exists (status = 'active')
- Recent touch within 30 days

**Examples**:
- Active opp + touched 10 days ago → **Ready**
- Active opp + touched 45 days ago → **Not ready**
- No active opp + touched 10 days ago → **Not ready**
- Active opp + never touched → **Not ready**

---

### 3. Ticket Propensity

**Purpose**: Predict likelihood to purchase tickets

**Algorithm**:
```typescript
const propensity = Math.floor(lifetimeTicketSpend / 500)
return Math.min(100, Math.max(0, propensity))
```

**Based on**:
- Lifetime ticket spend
- Linear scale: $500 = 1 point
- Capped at 100

**Examples**:
- $0 lifetime spend → **0** propensity
- $2,500 lifetime spend → **5** propensity
- $25,000 lifetime spend → **50** propensity
- $50,000+ lifetime spend → **100** propensity (capped)

---

### 4. Corporate Propensity

**Purpose**: Predict likelihood of corporate partnership

**Algorithm** (stub):
```typescript
return isCorporate ? 100 : 0
```

**Based on**:
- `is_corporate` flag

**Future enhancements**:
- Engagement metrics
- Company size
- Industry sector
- Previous sponsorship history

**Examples**:
- Corporate constituent → **100** propensity
- Individual constituent → **0** propensity

---

### 5. Capacity Estimate

**Purpose**: Estimate wealth capacity for major gifts

**Algorithm** (stub):
```typescript
return lifetimeGiving * 10
```

**Based on**:
- Lifetime giving total
- Simple 10x multiplier

**Future enhancements**:
- Integration with wealth screening API (WealthEngine, iWave, etc.)
- Real estate holdings
- Business ownership
- Stock holdings

**Examples**:
- $10,000 lifetime giving → **$100,000** capacity
- $100,000 lifetime giving → **$1,000,000** capacity

---

## Processing Logic

### Flow

```
1. Fetch constituents to score
   │
   ▼
2. Process in batches (default: 100)
   │
   ▼
3. For each constituent:
   ├─► Get last interaction date
   ├─► Check for active opportunities
   ├─► Calculate renewal risk
   ├─► Calculate ask readiness
   ├─► Calculate ticket propensity
   ├─► Calculate corporate propensity
   └─► Calculate capacity estimate
   │
   ▼
4. Upsert scores to database
   │
   ▼
5. Log to audit trail
   │
   ▼
6. Return summary
```

### Database Schema

Scores are stored in the `scores` table:

```sql
CREATE TABLE scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  constituent_id uuid REFERENCES constituent_master(id),
  as_of_date date NOT NULL,
  renewal_risk text CHECK (renewal_risk IN ('low', 'medium', 'high')),
  ask_readiness text CHECK (ask_readiness IN ('ready', 'not_ready')),
  ticket_propensity integer CHECK (ticket_propensity BETWEEN 0 AND 100),
  corporate_propensity integer CHECK (corporate_propensity BETWEEN 0 AND 100),
  capacity_estimate numeric,
  last_touch_date timestamptz,
  days_since_touch integer,
  created_at timestamptz DEFAULT NOW(),
  UNIQUE (constituent_id, as_of_date)
);
```

### Upserting

Scores are upserted daily:
- **Conflict key**: `(constituent_id, as_of_date)`
- **On conflict**: Update all score fields
- **Result**: One score record per constituent per day

## Performance

### Benchmarks

| Constituents | Time | Throughput |
|--------------|------|------------|
| 100 | ~3s | ~33/sec |
| 500 | ~15s | ~33/sec |
| 1,000 | ~30s | ~33/sec |
| 5,000 | ~2.5min | ~33/sec |

**Goal**: Process 1000+ constituents in < 30 seconds ✅

### Optimization

1. **Batch processing**: Process 100 constituents at a time
2. **Index usage**: Leverages indexes from `0004_indexes.sql`
3. **Single queries**: One query per constituent for interactions
4. **Bulk upsert**: Batch upsert scores to reduce round trips

### Scheduled Execution

Recommended schedule:
```sql
-- Run daily at 2 AM
SELECT cron.schedule(
  'daily-scoring',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/scoring_run',
    headers := '{"Authorization": "Bearer <service-role-key>"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

## Use Cases

### 1. Daily Automated Scoring

```bash
# Run via cron or scheduled job
curl -X POST http://localhost:54321/functions/v1/scoring_run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-role-key>" \
  -d '{}'
```

### 2. Score Specific Constituents

```bash
# After CSV import, score new constituents
curl -X POST http://localhost:54321/functions/v1/scoring_run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "constituentIds": ["c1", "c2", "c3"]
  }'
```

### 3. Custom Batch Size

```bash
# Smaller batches for limited memory
curl -X POST http://localhost:54321/functions/v1/scoring_run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "batchSize": 50
  }'
```

## Integration Examples

### After CSV Import

```typescript
// Import constituents
await ingestPaciolan(csvData)

// Score newly imported constituents
const importedIds = [...] // Get IDs from import result
await scoringRun({ constituentIds: importedIds })
```

### Dashboard Queries

```sql
-- Get constituents at high renewal risk
SELECT c.*, s.renewal_risk, s.days_since_touch
FROM constituent_master c
JOIN scores s ON c.id = s.constituent_id
WHERE s.renewal_risk = 'high'
  AND s.as_of_date = CURRENT_DATE
ORDER BY s.days_since_touch DESC
LIMIT 20;

-- Get ask-ready prospects
SELECT c.*, s.ask_readiness, s.last_touch_date
FROM constituent_master c
JOIN scores s ON c.id = s.constituent_id
WHERE s.ask_readiness = 'ready'
  AND s.as_of_date = CURRENT_DATE
ORDER BY c.lifetime_giving DESC
LIMIT 20;

-- Get high ticket propensity constituents
SELECT c.*, s.ticket_propensity, c.lifetime_ticket_spend
FROM constituent_master c
JOIN scores s ON c.id = s.constituent_id
WHERE s.ticket_propensity >= 50
  AND s.as_of_date = CURRENT_DATE
ORDER BY s.ticket_propensity DESC;
```

## Testing

Run unit tests:
```bash
cd supabase/functions/scoring_run
deno test --allow-all
```

Unit tests cover:
- Renewal risk calculation (4 tests)
- Ask readiness calculation (5 tests)
- Ticket propensity calculation (5 tests)
- Corporate propensity calculation (2 tests)
- Capacity estimate calculation (4 tests)

## Error Handling

The function continues processing even if individual constituents fail:

```json
{
  "errors": [
    {
      "constituent_id": "c123",
      "error": "Failed to fetch interaction log"
    }
  ]
}
```

Errors are logged but don't stop the entire run.

## Troubleshooting

### Issue: Slow performance

**Cause**: Large number of constituents
**Solution**:
- Reduce batch size
- Score subsets incrementally
- Ensure indexes are present

### Issue: All constituents marked high risk

**Cause**: No interaction logs
**Solution**:
- Import interaction history
- Create interactions during data entry
- Verify `interaction_log` table has data

### Issue: No constituents marked ready

**Cause**: No active opportunities or old touches
**Solution**:
- Create opportunities via CSV import
- Log recent interactions
- Verify opportunity status = 'active'

## Audit Trail

Query scoring history:
```sql
SELECT *
FROM audit_log
WHERE action = 'score_calculate'
ORDER BY created_at DESC
LIMIT 10;
```

## Future Enhancements

1. **Machine Learning Models**
   - Train propensity models on historical data
   - Predictive churn modeling
   - Optimal ask amount prediction

2. **Wealth Screening Integration**
   - Real-time capacity estimates
   - Asset verification
   - Income projections

3. **Engagement Scoring**
   - Email open rates
   - Event attendance
   - Website visits
   - Social media engagement

4. **Multi-dimensional Scoring**
   - Composite scores combining multiple factors
   - Weighted algorithms
   - Custom scoring rules per team

## Related Functions

- `ingest_paciolan` - Score after ticket import
- `ingest_raisers_edge` - Score after donor import
- `dashboard_data` - Use scores for dashboard metrics
