# Identity Resolution Edge Function

Intelligently matches incoming constituent data to existing records or creates new ones, preventing duplicates while maintaining data integrity.

## Overview

The identity resolution function is critical for data ingestion pipelines. It uses a multi-strategy matching approach to find existing constituents before creating new records:

1. **Email matching** (highest confidence) - Exact match, case-insensitive
2. **Phone matching** (high confidence) - Normalized phone numbers
3. **Name + Zip matching** (lower confidence) - Fuzzy matching with similarity scoring

## Endpoint

`POST /functions/v1/identity_resolve`

## Authentication

This function uses the service role key and bypasses RLS. It should be called server-side only (e.g., from other Edge Functions or ingestion pipelines).

## Request Body

```json
{
  "email": "john.smith@example.com",
  "phone": "555-123-4567",
  "first_name": "John",
  "last_name": "Smith",
  "zip": "30301",
  "createIfNotFound": true
}
```

### Parameters

All parameters are optional, but **at least one identification method is required**:
- Email alone
- Phone alone
- First name + Last name + Zip together

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Conditional | Email address (case-insensitive matching) |
| `phone` | string | Conditional | Phone number (will be normalized) |
| `first_name` | string | Conditional* | First name (*required with last_name + zip) |
| `last_name` | string | Conditional* | Last name (*required with first_name + zip) |
| `zip` | string | Conditional* | ZIP/postal code (*required with first_name + last_name) |
| `createIfNotFound` | boolean | Optional | Create new constituent if no match (default: true) |

**Validation Rules**:
- Must provide: `email` OR `phone` OR (`first_name` AND `last_name` AND `zip`)
- If creating new constituent: `first_name` and `last_name` are required

## Response

### Success (200)

```json
{
  "success": true,
  "data": {
    "constituent_id": "c1",
    "matched": true,
    "matched_by": "email",
    "created": false,
    "household_id": "h1"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `constituent_id` | string | UUID of matched or created constituent |
| `matched` | boolean | `true` if existing constituent was found |
| `matched_by` | string | Matching strategy used: `email`, `phone`, or `name_zip` |
| `created` | boolean | `true` if new constituent was created |
| `household_id` | string | UUID of associated household (if applicable) |

### Error (400/500)

```json
{
  "error": "Must provide either email, phone, or (first_name + last_name + zip)"
}
```

## Matching Strategies

### 1. Email Matching (Highest Priority)

**Confidence**: High
**Method**: Exact match, case-insensitive

```typescript
// Matches:
{ email: "john.smith@example.com" }
// Against database:
// "john.smith@example.com" ✓
// "JOHN.SMITH@EXAMPLE.COM" ✓
// "John.Smith@Example.Com" ✓
```

**Performance**: Uses index on `LOWER(email)` (from 0004_indexes.sql)

### 2. Phone Matching (High Priority)

**Confidence**: High
**Method**: Normalized E.164 format

Phone numbers are automatically normalized:
- Removes all non-digit characters
- Adds country code (+1 for US)
- Converts to E.164 format

```typescript
// All of these match the same number:
"555-123-4567"
"(555) 123-4567"
"+1 555-123-4567"
"5551234567"
// All normalize to: "+15551234567"
```

**Performance**: Uses index on `phone` column

### 3. Name + Zip Matching (Lower Priority)

**Confidence**: Medium (fuzzy matching)
**Method**: Last name exact + First name similarity (≥80%)

```typescript
// Database has: "John Smith, 30301"

// Matches:
{ first_name: "John", last_name: "Smith", zip: "30301" } // Exact
{ first_name: "Jon", last_name: "Smith", zip: "30301" }  // Similar (80%+)
{ first_name: "Johnny", last_name: "Smith", zip: "30301" } // Similar

// Does NOT match:
{ first_name: "Jane", last_name: "Smith", zip: "30301" } // First name too different
{ first_name: "John", last_name: "Jones", zip: "30301" } // Different last name
{ first_name: "John", last_name: "Smith", zip: "30302" } // Different zip
```

**Performance**: Uses composite index on `(last_name, first_name, zip)`

## Household Management

When creating a new constituent, the function automatically:

1. **Creates or finds household** based on last name
   - Household name: `"{LastName} Household"`
   - Example: "Smith Household"

2. **Links constituent to household**
   - Sets `household_id` on constituent

3. **Sets primary member**
   - First member created becomes primary
   - Later members join existing household

**Example**:
```typescript
// First constituent creates household
{ first_name: "John", last_name: "Smith", zip: "30301" }
// Creates: "Smith Household" with John as primary

// Second constituent joins household
{ first_name: "Jane", last_name: "Smith", zip: "30301" }
// Joins: "Smith Household" (same last name)
```

## Usage Examples

### Example 1: Match by Email

```bash
curl -X POST http://localhost:54321/functions/v1/identity_resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-role-key>" \
  -d '{
    "email": "john.smith@example.com",
    "first_name": "John",
    "last_name": "Smith"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "constituent_id": "c1",
    "matched": true,
    "matched_by": "email",
    "created": false,
    "household_id": "h1"
  }
}
```

### Example 2: Match by Phone

```bash
curl -X POST http://localhost:54321/functions/v1/identity_resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-role-key>" \
  -d '{
    "phone": "555-123-4567",
    "first_name": "John",
    "last_name": "Smith"
  }'
```

### Example 3: Create New Constituent

```bash
curl -X POST http://localhost:54321/functions/v1/identity_resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-role-key>" \
  -d '{
    "email": "new.person@example.com",
    "phone": "555-999-8888",
    "first_name": "New",
    "last_name": "Person",
    "zip": "30399"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "constituent_id": "c51",
    "matched": false,
    "created": true,
    "household_id": "h11"
  }
}
```

### Example 4: Check for Existence Only

```bash
curl -X POST http://localhost:54321/functions/v1/identity_resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <service-role-key>" \
  -d '{
    "email": "maybe.exists@example.com",
    "createIfNotFound": false
  }'
```

**Response (if not found)**:
```json
{
  "success": true,
  "data": {
    "constituent_id": null,
    "matched": false,
    "created": false
  }
}
```

## TypeScript Integration

```typescript
interface IdentityResolveRequest {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  zip?: string
  createIfNotFound?: boolean
}

interface IdentityResolveResponse {
  constituent_id: string | null
  matched: boolean
  matched_by?: 'email' | 'phone' | 'name_zip'
  created: boolean
  household_id?: string
}

async function resolveIdentity(
  data: IdentityResolveRequest
): Promise<IdentityResolveResponse> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/identity_resolve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify(data)
    }
  )

  const result = await response.json()
  return result.data
}

// Usage:
const constituent = await resolveIdentity({
  email: 'john.smith@example.com',
  first_name: 'John',
  last_name: 'Smith',
  zip: '30301'
})

console.log(`Constituent ID: ${constituent.constituent_id}`)
console.log(`Matched: ${constituent.matched}`)
console.log(`Created: ${constituent.created}`)
```

## Use Cases

### 1. CSV Ingestion
```typescript
// Process each row from CSV
for (const row of csvData) {
  const result = await resolveIdentity({
    email: row.email,
    phone: row.phone,
    first_name: row.firstName,
    last_name: row.lastName,
    zip: row.zip
  })

  // Update constituent with additional data
  await updateConstituent(result.constituent_id, {
    lifetime_ticket_spend: row.lifetimeSpend
  })
}
```

### 2. Form Submission Deduplication
```typescript
// Handle new donor form submission
const result = await resolveIdentity({
  email: formData.email,
  first_name: formData.firstName,
  last_name: formData.lastName,
  zip: formData.zip
})

if (result.created) {
  console.log('New donor created!')
} else {
  console.log('Existing donor found:', result.matched_by)
}
```

### 3. Data Enrichment
```typescript
// Check if constituent exists before enriching
const result = await resolveIdentity({
  email: enrichmentData.email,
  createIfNotFound: false
})

if (result.constituent_id) {
  // Update existing record
  await enrichConstituent(result.constituent_id, enrichmentData)
} else {
  console.log('Constituent not found - skipping enrichment')
}
```

## Performance Considerations

### Index Usage

The function leverages indexes created in `0004_indexes.sql`:
- `idx_constituent_email` - Email lookups (case-insensitive)
- `idx_constituent_phone` - Phone lookups
- `idx_constituent_name_zip` - Name + Zip lookups

**Query Performance**:
- Email match: ~1ms (index scan)
- Phone match: ~1ms (index scan)
- Name + Zip match: ~5-10ms (fuzzy matching on ≤10 records)
- New constituent creation: ~10-15ms (includes household creation)

### Optimization Tips

1. **Provide email when available** - Fastest and most reliable matching
2. **Batch operations** - Call in parallel for multiple records
3. **Use createIfNotFound: false** - For existence checks only (faster)

## Testing

Run unit tests:

```bash
cd supabase/functions/identity_resolve
deno test --allow-all
```

Tests cover:
- Phone normalization (various formats)
- String similarity algorithm
- Input validation
- Integration tests (require Supabase running)

## Error Handling

| Error | Status | Cause |
|-------|--------|-------|
| Missing identification | 400 | No email, phone, or name+zip provided |
| Missing names for creation | 400 | createIfNotFound=true but no first/last name |
| Database error | 500 | Failed to query or insert |

## Security

- Uses **service role key** - Bypasses RLS for administrative operations
- Should only be called **server-side** (not from client applications)
- Validates all inputs before database operations
- Prevents SQL injection through parameterized queries

## Related Functions

- `ingest_paciolan` - Uses identity_resolve for ticket holder imports
- `ingest_raisers_edge` - Uses identity_resolve for donor imports
- See `supabase/functions/_shared/supabase.ts` for client utilities

## Future Enhancements

Potential improvements for future versions:
- Machine learning-based name matching
- Address standardization and geocoding
- Confidence scoring for fuzzy matches
- Duplicate merge suggestions
- Integration with external identity verification services
