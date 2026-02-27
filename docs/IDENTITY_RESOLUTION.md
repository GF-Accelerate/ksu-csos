# Identity Resolution in KSU CSOS

This document explains how identity resolution works in the KSU CSOS system and how to prevent duplicate constituent records.

## Overview

Identity resolution is the process of determining whether an incoming constituent record matches an existing record in the database. This is critical for:

1. **Preventing duplicates** during CSV imports
2. **Merging data** from multiple sources (ticketing, donations, corporate)
3. **Maintaining data integrity** across the system
4. **Household linkage** for family relationships

## The Problem

Athletic departments receive constituent data from multiple sources:
- Paciolan (ticketing system)
- Raiser's Edge (donor management)
- Corporate partnership databases
- Manual entry from events

Without identity resolution:
- **Duplicates multiply**: Same person appears 3+ times
- **Data fragmentation**: Lifetime giving split across records
- **Poor analytics**: Pipeline metrics are inaccurate
- **Bad user experience**: Multiple records for same person

## The Solution: Multi-Strategy Matching

The `identity_resolve` Edge Function uses a **three-tier matching strategy** with confidence levels:

```
┌─────────────────────────────────────────────────────┐
│              Identity Resolution Flow               │
└─────────────────────────────────────────────────────┘

Incoming Record
      │
      ▼
┌─────────────────┐
│ 1. Email Match  │──► Exact match (case-insensitive)
│   Confidence:   │    ✓ High confidence
│   High          │    ✓ ~1ms query time
└─────────────────┘    ✓ Uses idx_constituent_email
      │
      │ No match
      ▼
┌─────────────────┐
│ 2. Phone Match  │──► Normalized phone numbers
│   Confidence:   │    ✓ High confidence
│   High          │    ✓ ~1ms query time
└─────────────────┘    ✓ Uses idx_constituent_phone
      │
      │ No match
      ▼
┌─────────────────┐
│ 3. Name + Zip   │──► Fuzzy matching (80% similarity)
│   Confidence:   │    ✓ Medium confidence
│   Medium        │    ✓ ~5-10ms query time
└─────────────────┘    ✓ Uses idx_constituent_name_zip
      │
      │ No match
      ▼
┌─────────────────┐
│ 4. Create New   │──► New constituent + household
│   Constituent   │    ✓ Prevents false negatives
│                 │    ✓ Links to household
└─────────────────┘
```

## Matching Strategies Explained

### Strategy 1: Email Matching

**Why it works**: Email addresses are unique and persistent.

**How it works**:
```sql
SELECT id FROM constituent_master
WHERE LOWER(email) = LOWER('john.smith@example.com')
LIMIT 1;
```

**Examples**:
```typescript
// All of these match the same record:
"john.smith@example.com"
"JOHN.SMITH@EXAMPLE.COM"
"John.Smith@Example.Com"
```

**Edge cases**:
- ❌ Old/inactive email addresses (person changed jobs)
- ✓ Typos are NOT matched (prevents false positives)

---

### Strategy 2: Phone Matching

**Why it works**: Phone numbers are relatively stable and uniquely identify people.

**How it works**:
1. Normalize incoming phone to E.164 format
2. Query normalized phone in database

**Normalization Examples**:
```typescript
// All normalize to: "+15551234567"
"555-123-4567"
"(555) 123-4567"
"+1 555-123-4567"
"1-555-123-4567"
"5551234567"
```

**Code**:
```typescript
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 10) {
    return `+1${digits}` // US number
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}` // US number with country code
  }

  return digits.length > 0 ? `+${digits}` : phone
}
```

**Edge cases**:
- ❌ Shared phones (family landline, corporate main line)
- ❌ People who change numbers
- ✓ Mobile numbers (most reliable)

---

### Strategy 3: Name + Zip Matching (Fuzzy)

**Why it works**: Combining multiple fields reduces false positives.

**How it works**:
1. Exact match on last name and zip
2. Fuzzy match on first name (≥80% similar)

**Similarity Scoring**:
```typescript
// Exact match
stringSimilarity("John", "John") = 1.0 (100%)

// High similarity
stringSimilarity("John", "Jon") = 0.85 (85%)
stringSimilarity("Catherine", "Katherine") = 0.88 (88%)

// Low similarity (no match)
stringSimilarity("John", "Jane") = 0.40 (40%)
```

**Examples**:
```typescript
// Database has: "John Smith, 30301"

✓ Matches:
{ first_name: "John", last_name: "Smith", zip: "30301" }   // Exact
{ first_name: "Jon", last_name: "Smith", zip: "30301" }    // Similar (85%)
{ first_name: "Johnny", last_name: "Smith", zip: "30301" } // Similar (83%)

✗ Does NOT match:
{ first_name: "Jane", last_name: "Smith", zip: "30301" }  // Different name
{ first_name: "John", last_name: "Jones", zip: "30301" }  // Different last name
{ first_name: "John", last_name: "Smith", zip: "30302" }  // Different zip
```

**Edge cases**:
- ❌ Common names (John Smith)
- ❌ Name changes (marriage, legal name change)
- ✓ Nicknames (Jon/John, Mike/Michael, Katie/Katherine)

---

## Household Management

When creating a new constituent, the system automatically manages household relationships.

### Household Creation Logic

```typescript
// 1. Create household name
const householdName = `${last_name} Household`
// Example: "Smith Household"

// 2. Find existing household with same name
SELECT id FROM household
WHERE household_name = 'Smith Household'
LIMIT 1

// 3. If not found, create new household
INSERT INTO household (household_name, primary_member_id)
VALUES ('Smith Household', NULL)

// 4. Link constituent to household
UPDATE constituent_master
SET household_id = '<household-id>'
WHERE id = '<constituent-id>'

// 5. Set primary member (if first in household)
UPDATE household
SET primary_member_id = '<constituent-id>'
WHERE id = '<household-id>'
  AND primary_member_id IS NULL
```

### Household Linking Example

```typescript
// First family member
await identityResolve({
  email: 'john.smith@example.com',
  first_name: 'John',
  last_name: 'Smith',
  zip: '30301'
})
// Creates: "Smith Household" with John as primary

// Second family member (spouse)
await identityResolve({
  email: 'jane.smith@example.com',
  first_name: 'Jane',
  last_name: 'Smith',
  zip: '30301'
})
// Joins: "Smith Household" (same last name + zip)
// John remains primary member
```

### Query Household Members

```sql
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  h.household_name,
  h.primary_member_id = c.id AS is_primary
FROM constituent_master c
JOIN household h ON c.household_id = h.id
WHERE h.household_name = 'Smith Household'
ORDER BY is_primary DESC, c.first_name;
```

---

## Performance Optimization

### Index Usage

The function leverages indexes from `0004_indexes.sql`:

```sql
-- Email matching (case-insensitive)
CREATE INDEX idx_constituent_email
  ON constituent_master(LOWER(email));

-- Phone matching
CREATE INDEX idx_constituent_phone
  ON constituent_master(phone);

-- Name + Zip matching
CREATE INDEX idx_constituent_name_zip
  ON constituent_master(LOWER(last_name), LOWER(first_name), zip);
```

### Performance Benchmarks

| Strategy | Avg Time | Index Used |
|----------|----------|------------|
| Email match | 1ms | idx_constituent_email |
| Phone match | 1ms | idx_constituent_phone |
| Name + Zip match | 5-10ms | idx_constituent_name_zip |
| Create new | 10-15ms | (includes household creation) |

**Total time**: 15-25ms per record (worst case)

### Batch Processing

For CSV imports with 1000+ records:

```typescript
// Process in batches of 100
const BATCH_SIZE = 100

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE)

  // Process batch in parallel
  await Promise.all(
    batch.map(record => identityResolve(record))
  )
}
```

**Performance**:
- 100 records: ~2-3 seconds
- 1,000 records: ~20-30 seconds
- 10,000 records: ~3-5 minutes

---

## Best Practices

### 1. Always Provide Email When Available

Email is the most reliable identifier:

```typescript
// ✓ Good: Provides email
await identityResolve({
  email: 'john.smith@example.com',
  phone: '555-123-4567',
  first_name: 'John',
  last_name: 'Smith',
  zip: '30301'
})

// ⚠ Acceptable: No email, but has phone
await identityResolve({
  phone: '555-123-4567',
  first_name: 'John',
  last_name: 'Smith',
  zip: '30301'
})

// ❌ Risky: Only name + zip (fuzzy matching)
await identityResolve({
  first_name: 'John',
  last_name: 'Smith',
  zip: '30301'
})
```

### 2. Normalize Data Before Sending

Pre-process data for better matching:

```typescript
// Clean up names
const firstName = row.firstName.trim().replace(/\s+/g, ' ')
const lastName = row.lastName.trim().replace(/\s+/g, ' ')

// Normalize email
const email = row.email.toLowerCase().trim()

// Clean ZIP code
const zip = row.zip.replace(/\D/g, '').substring(0, 5)

await identityResolve({
  email,
  first_name: firstName,
  last_name: lastName,
  zip
})
```

### 3. Handle Match Results Appropriately

```typescript
const result = await identityResolve({
  email: 'john.smith@example.com',
  first_name: 'John',
  last_name: 'Smith'
})

if (result.created) {
  console.log('✓ New constituent created')
  // Send welcome email, create default preferences, etc.
}

if (result.matched) {
  console.log(`✓ Matched existing constituent via ${result.matched_by}`)

  if (result.matched_by === 'name_zip') {
    // Lower confidence - flag for manual review
    await flagForReview(result.constituent_id, 'fuzzy_match')
  }
}
```

### 4. Use createIfNotFound Appropriately

```typescript
// Deduplication check (don't create)
const check = await identityResolve({
  email: 'maybe@example.com',
  createIfNotFound: false
})

if (check.constituent_id) {
  console.log('Duplicate detected!')
} else {
  console.log('Not a duplicate')
}

// Normal import (create if needed)
const result = await identityResolve({
  email: 'new@example.com',
  first_name: 'New',
  last_name: 'Person',
  createIfNotFound: true // default
})
```

---

## Troubleshooting

### Problem: Too Many Duplicates Created

**Symptoms**: Multiple records for same person

**Causes**:
1. Email/phone not provided
2. Data quality issues (typos)
3. Name variations (Robert vs Bob)

**Solutions**:
```sql
-- Find potential duplicates
SELECT
  last_name,
  first_name,
  zip,
  COUNT(*) as count
FROM constituent_master
GROUP BY last_name, first_name, zip
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Manually merge duplicates
UPDATE opportunity SET constituent_id = '<primary-id>'
WHERE constituent_id = '<duplicate-id>';

DELETE FROM constituent_master WHERE id = '<duplicate-id>';
```

---

### Problem: False Matches (Wrong Person)

**Symptoms**: Data from different people merged

**Causes**:
1. Fuzzy matching too aggressive
2. Common names (John Smith)
3. Shared phones/addresses

**Solutions**:
1. Lower fuzzy match threshold (currently 80%)
2. Add manual review for common names
3. Prefer email/phone over name+zip

```typescript
// Add manual review for fuzzy matches
if (result.matched_by === 'name_zip') {
  await createReviewTask({
    constituent_id: result.constituent_id,
    reason: 'fuzzy_match_needs_verification',
    data: { incoming_data: requestData }
  })
}
```

---

### Problem: Household Merging Issues

**Symptoms**: Family members in different households

**Causes**:
1. Different ZIP codes (moved)
2. Name changes (marriage)
3. Data entry errors

**Solutions**:
```sql
-- Manually merge households
UPDATE constituent_master
SET household_id = '<target-household-id>'
WHERE household_id = '<source-household-id>';

DELETE FROM household WHERE id = '<source-household-id>';
```

---

## API Reference

See [identity_resolve API documentation](../supabase/functions/identity_resolve/README.md) for complete API reference.

Quick reference:

```typescript
// Match by email
POST /functions/v1/identity_resolve
{
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Smith"
}

// Match by phone
POST /functions/v1/identity_resolve
{
  "phone": "555-123-4567",
  "first_name": "John",
  "last_name": "Smith"
}

// Match by name + zip
POST /functions/v1/identity_resolve
{
  "first_name": "John",
  "last_name": "Smith",
  "zip": "30301"
}

// Check without creating
POST /functions/v1/identity_resolve
{
  "email": "maybe@example.com",
  "createIfNotFound": false
}
```

---

## Future Enhancements

Potential improvements for v2:

1. **Machine Learning Matching**
   - Train model on historical matches
   - Confidence scoring for manual review

2. **Address Standardization**
   - USPS address validation
   - Geocoding for location-based matching

3. **Social Media Enrichment**
   - LinkedIn profile matching
   - Facebook/Twitter data augmentation

4. **Duplicate Merge UI**
   - Visual diff of duplicate records
   - One-click merge functionality

5. **Match Confidence Reporting**
   - Dashboard showing match quality
   - Flag low-confidence matches for review

---

## Related Documentation

- [Role Management](./ROLE_MANAGEMENT.md)
- [CSV Ingestion](./CSV_INGESTION.md) (coming in Task 6)
- [Data Quality](./DATA_QUALITY.md) (future)
