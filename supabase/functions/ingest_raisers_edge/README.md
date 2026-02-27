# Raiser's Edge CSV Ingestion Edge Function

Imports donor data from Raiser's Edge fundraising system into the KSU CSOS platform.

## Overview

This function processes CSV exports from Raiser's Edge, resolving constituent identities, updating donor information, and creating/updating major gift opportunities.

## Endpoint

`POST /functions/v1/ingest_raisers_edge`

## Authentication

Requires authentication with one of the following roles:
- `admin`
- `executive`
- `major_gifts`
- `revenue_ops`

## Request Body

```json
{
  "csvData": "email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating\njohn@example.com,John,Smith,555-0101,30301,RE001,50000,500000",
  "dryRun": false
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `csvData` | string | Yes | CSV content (with header row) |
| `dryRun` | boolean | No | If true, validates but doesn't import (default: false) |

### CSV Format

Required columns (in order):
1. `email` - Email address
2. `first_name` - First name
3. `last_name` - Last name
4. `phone` - Phone number
5. `zip` - ZIP code (5 digits)
6. `donor_id` - Raiser's Edge donor ID
7. `lifetime_giving` - Lifetime giving total (numeric)
8. `capacity_rating` - Wealth capacity rating (numeric)

**Validation Rules**:
- At least one identifier required: `email` OR `phone` OR (`first_name` + `last_name` + `zip`)
- `lifetime_giving` must be non-negative numeric value
- `capacity_rating` must be non-negative numeric value
- `zip` truncated to 5 digits if longer

**Example CSV**:
```csv
email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
major.donor@example.com,Major,Donor,555-0201,30301,RE001,100000,1000000
regular.donor@example.com,Regular,Donor,555-0202,30302,RE002,5000,50000
```

## Response

### Success (200)

```json
{
  "success": true,
  "data": {
    "result": {
      "totalRows": 2,
      "processed": 2,
      "created": 1,
      "updated": 1,
      "skipped": 0,
      "errors": []
    },
    "summary": "Processed 2/2 rows. Created: 1, Updated: 1, Skipped: 0, Errors: 0",
    "dryRun": false
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalRows` | number | Total rows in CSV |
| `processed` | number | Successfully processed rows |
| `created` | number | New donors created |
| `updated` | number | Existing donors updated |
| `skipped` | number | Rows skipped due to validation errors |
| `errors` | array | Error details for failed rows |

### Error Response (400/500)

```json
{
  "error": "Failed to parse CSV: Invalid format"
}
```

## Processing Logic

### 1. Identity Resolution

For each row, calls `identity_resolve` function to:
- Match by email (highest confidence)
- Match by phone (high confidence)
- Match by name + zip (medium confidence)
- Create new constituent if no match

### 2. Constituent Update

Updates matched/created constituent with:
- `is_donor = true`
- `lifetime_giving = max(current, new)` (highest value wins)

### 3. Major Gift Opportunity Creation

Creates or updates major gift opportunity **only if**:
- `lifetime_giving >= $1,000` OR
- `capacity_rating >= $10,000`

**Suggested Ask Amount** calculated as:
```
max(
  capacity_rating * 0.10,  // 10% of capacity
  lifetime_giving * 0.20,  // 20% of lifetime giving
  $5,000                   // Minimum ask
)
```

**New opportunity**: If no active major_gift opportunity exists
- `type = 'major_gift'`
- `status = 'active'`
- `amount = suggested_ask`
- `expected_close_date = next June` (fiscal year end)
- `notes = "Raiser's Edge Donor ID: ... Lifetime Giving: ... Capacity: ..."`

**Update opportunity**: If active opportunity exists
- Updates `amount` if new suggested ask is higher
- Updates `notes` with latest data

### 4. Audit Logging

Logs import to `audit_log` table:
- Source: `raisers_edge`
- Records processed, created, updated
- Error details

## Use Cases

### 1. Annual Campaign Setup

```bash
# Export major gift prospects from Raiser's Edge
# Import to create opportunities for campaign

curl -X POST http://localhost:54321/functions/v1/ingest_raisers_edge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d @raisers_edge_export.json
```

### 2. Wealth Screening Update

```bash
# After wealth screening, update capacity ratings
# Opportunities will be updated with new ask amounts
```

### 3. Monthly Giving Sync

```bash
# Import monthly to keep lifetime giving current
# Existing donors updated, new donors created
```

## Opportunity Logic Examples

### Example 1: Major Donor

```csv
email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
major@example.com,Major,Donor,555-0001,30301,RE001,100000,1000000
```

**Suggested Ask**:
```
max(
  1000000 * 0.10 = 100000,
  100000 * 0.20 = 20000,
  5000
) = $100,000
```

**Result**: Opportunity created for $100,000

### Example 2: Mid-Level Donor

```csv
email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
mid@example.com,Mid,Donor,555-0002,30302,RE002,10000,50000
```

**Suggested Ask**:
```
max(
  50000 * 0.10 = 5000,
  10000 * 0.20 = 2000,
  5000
) = $5,000
```

**Result**: Opportunity created for $5,000

### Example 3: Small Donor (NO Opportunity)

```csv
email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
small@example.com,Small,Donor,555-0003,30303,RE003,500,5000
```

**Check**: lifetime_giving ($500) < $1,000 AND capacity_rating ($5,000) < $10,000

**Result**: NO opportunity created (below thresholds)

## Error Handling

The function continues processing even if individual rows fail:

- **Validation errors**: Row skipped, error logged
- **Identity resolution failures**: Row skipped, error logged
- **Database errors**: Row skipped, error logged

**Example error**:
```json
{
  "errors": [
    {
      "row": 5,
      "error": "Invalid lifetime_giving: abc",
      "data": {
        "email": "bad@example.com",
        "lifetime_giving": "abc"
      }
    }
  ]
}
```

## Performance

- **Throughput**: ~30-40 rows/second
- **Batch size**: Recommended 100-500 rows per request
- **Timeout**: 60 seconds max

For large imports (1000+ rows), split into multiple batches.

## Best Practices

### 1. Filter to Qualified Prospects

```sql
-- Export only donors meeting thresholds
SELECT *
FROM donors
WHERE lifetime_giving >= 1000 OR capacity_rating >= 10000
```

This reduces processing time and focuses on viable prospects.

### 2. Use Dry Run First

```typescript
const validation = await ingestRaisersEdge(csvData, { dryRun: true })
if (validation.errors.length === 0) {
  await ingestRaisersEdge(csvData, { dryRun: false })
}
```

### 3. Handle Small Donors Separately

Small donors (< $1,000 giving, < $10,000 capacity) are imported as constituents but don't get major gift opportunities. Consider:
- Separate CSV for major gift prospects
- Annual fund prospects handled differently

### 4. Update Regularly

```typescript
// Monthly sync to keep giving current
// Opportunities will adjust based on new capacity ratings
await ingestRaisersEdge(monthlyExport)
```

## Testing

Run unit tests:
```bash
cd supabase/functions/ingest_raisers_edge
deno test --allow-all
```

Run manual tests:
```bash
./supabase/functions/test-csv-ingestion.sh
```

## Related Functions

- `identity_resolve` - Used for constituent matching
- `ingest_paciolan` - Parallel function for ticket imports
- `scoring_run` - Calculate ask readiness after import

## Troubleshooting

### Issue: No opportunities created

**Cause**: Donors below threshold
**Solution**: Check `lifetime_giving >= $1,000` OR `capacity_rating >= $10,000`

### Issue: Ask amounts too low/high

**Cause**: Capacity ratings incorrect
**Solution**:
- Verify wealth screening data
- Adjust formula if needed (currently 10% of capacity)

### Issue: Duplicates created

**Cause**: Identity resolution not matching
**Solution**:
- Provide email addresses when possible
- Standardize names in Raiser's Edge

## Audit Trail

Query import history:
```sql
SELECT *
FROM audit_log
WHERE table_name = 'constituent_master'
  AND action = 'ingest_data'
  AND metadata->>'source' = 'raisers_edge'
ORDER BY created_at DESC;
```

## Future Enhancements

Potential improvements:
1. **Intelligent ask sizing** - ML model for optimal ask amounts
2. **Giving patterns** - Analyze frequency, recency, size
3. **Engagement scoring** - Factor in event attendance, email opens
4. **Relationship strength** - Consider stewardship touches
5. **Campaign segmentation** - Auto-assign to campaigns
