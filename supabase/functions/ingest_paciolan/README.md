# Paciolan CSV Ingestion Edge Function

Imports ticket holder data from Paciolan ticketing system into the KSU CSOS platform.

## Overview

This function processes CSV exports from Paciolan, resolving constituent identities, updating ticket holder information, and creating/updating ticket renewal opportunities.

## Endpoint

`POST /functions/v1/ingest_paciolan`

## Authentication

Requires authentication with one of the following roles:
- `admin`
- `executive`
- `ticketing`
- `revenue_ops`

## Request Body

```json
{
  "csvData": "email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity\njohn@example.com,John,Smith,555-0101,30301,PAC001,5000,football",
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
6. `account_id` - Paciolan account ID
7. `lifetime_spend` - Lifetime ticket spend (numeric)
8. `sport_affinity` - Primary sport (e.g., "football", "basketball")

**Validation Rules**:
- At least one identifier required: `email` OR `phone` OR (`first_name` + `last_name` + `zip`)
- `lifetime_spend` must be non-negative numeric value
- `zip` truncated to 5 digits if longer

**Example CSV**:
```csv
email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
john.smith@example.com,John,Smith,555-0101,30301,PAC001,5000,football
jane.doe@example.com,Jane,Doe,555-0102,30302,PAC002,3500,basketball
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
| `created` | number | New ticket holders created |
| `updated` | number | Existing ticket holders updated |
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
- `is_ticket_holder = true`
- `lifetime_ticket_spend = max(current, new)` (highest value wins)
- `sport_affinity` (if provided)

### 3. Opportunity Creation

Creates or updates active ticket opportunity:
- **New opportunity**: If no active ticket opportunity exists
  - `type = 'ticket'`
  - `status = 'active'`
  - `amount = lifetime_spend`
  - `expected_close_date = next August` (renewal season)

- **Update opportunity**: If active opportunity exists
  - Updates `amount` to latest lifetime_spend
  - Updates `notes` with Paciolan account ID

### 4. Audit Logging

Logs import to `audit_log` table:
- Source: `paciolan`
- Records processed, created, updated
- Error details

## Use Cases

### 1. Annual Renewal Campaign

```bash
# Export season ticket holders from Paciolan
# Import to create renewal opportunities

curl -X POST http://localhost:54321/functions/v1/ingest_paciolan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d @paciolan_export.json
```

### 2. Dry Run Validation

```bash
# Validate CSV before importing

curl -X POST http://localhost:54321/functions/v1/ingest_paciolan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "csvData": "<csv-content>",
    "dryRun": true
  }'
```

### 3. Incremental Updates

```bash
# Import new ticket buyers weekly
# Existing constituents updated, new ones created
```

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
      "error": "Invalid lifetime_spend: abc",
      "data": {
        "email": "bad@example.com",
        "lifetime_spend": "abc"
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

### 1. Use Dry Run First

```typescript
// Validate before importing
const validation = await ingestPaciolan(csvData, { dryRun: true })
if (validation.errors.length === 0) {
  await ingestPaciolan(csvData, { dryRun: false })
}
```

### 2. Handle Errors Gracefully

```typescript
const result = await ingestPaciolan(csvData)

if (result.errors.length > 0) {
  console.warn(`${result.errors.length} rows failed:`)
  result.errors.forEach(err => {
    console.error(`Row ${err.row}: ${err.error}`)
  })
}

console.log(`Successfully processed: ${result.processed}/${result.totalRows}`)
```

### 3. Clean Data Before Import

```typescript
// Normalize data
const cleanedData = csvData
  .split('\n')
  .map(line => {
    const [email, ...rest] = line.split(',')
    return [email.trim().toLowerCase(), ...rest].join(',')
  })
  .join('\n')
```

## Testing

Run unit tests:
```bash
cd supabase/functions/ingest_paciolan
deno test --allow-all
```

Run manual tests:
```bash
./supabase/functions/test-csv-ingestion.sh
```

## Related Functions

- `identity_resolve` - Used for constituent matching
- `ingest_raisers_edge` - Parallel function for donor imports
- `scoring_run` - Calculate renewal risk after import

## Troubleshooting

### Issue: High error rate

**Cause**: Poor data quality
**Solution**:
- Validate CSV format
- Ensure header row matches expected columns
- Check for missing required fields

### Issue: Duplicates created

**Cause**: Identity resolution not matching correctly
**Solution**:
- Provide email addresses when possible
- Normalize phone numbers before export
- Check for typos in names

### Issue: Slow performance

**Cause**: Large batch size
**Solution**:
- Split into batches of 100-500 rows
- Process during off-peak hours
- Use dry run to estimate time

## Audit Trail

Query import history:
```sql
SELECT *
FROM audit_log
WHERE table_name = 'constituent_master'
  AND action = 'ingest_data'
  AND metadata->>'source' = 'paciolan'
ORDER BY created_at DESC;
```
