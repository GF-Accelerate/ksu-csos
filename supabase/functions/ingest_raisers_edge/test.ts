/**
 * Tests for ingest_raisers_edge Edge Function
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// ============================================================================
// UNIT TESTS (Validation Logic)
// ============================================================================

interface RaisersEdgeRow {
  email: string
  first_name: string
  last_name: string
  phone: string
  zip: string
  donor_id: string
  lifetime_giving: string
  capacity_rating: string
}

/**
 * Validation function (extracted for testing)
 */
function validateRaisersEdgeRow(row: any, rowIndex: number): { valid: boolean; error?: string; data?: RaisersEdgeRow } {
  if (!row.email && !row.phone && !(row.first_name && row.last_name && row.zip)) {
    return {
      valid: false,
      error: 'Row must have email, phone, or (first_name + last_name + zip)'
    }
  }

  const lifetimeGiving = parseFloat(row.lifetime_giving || '0')
  if (isNaN(lifetimeGiving) || lifetimeGiving < 0) {
    return {
      valid: false,
      error: `Invalid lifetime_giving: ${row.lifetime_giving}`
    }
  }

  const capacityRating = parseFloat(row.capacity_rating || '0')
  if (isNaN(capacityRating) || capacityRating < 0) {
    return {
      valid: false,
      error: `Invalid capacity_rating: ${row.capacity_rating}`
    }
  }

  return {
    valid: true,
    data: {
      email: row.email?.trim() || '',
      first_name: row.first_name?.trim() || '',
      last_name: row.last_name?.trim() || '',
      phone: row.phone?.trim() || '',
      zip: row.zip?.trim()?.substring(0, 5) || '',
      donor_id: row.donor_id?.trim() || '',
      lifetime_giving: lifetimeGiving.toString(),
      capacity_rating: capacityRating.toString()
    }
  }
}

Deno.test('validateRaisersEdgeRow - valid row with all fields', () => {
  const row = {
    email: 'donor@example.com',
    first_name: 'Major',
    last_name: 'Donor',
    phone: '555-123-4567',
    zip: '30301',
    donor_id: 'RE123',
    lifetime_giving: '50000',
    capacity_rating: '500000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, true)
  assertExists(result.data)
  assertEquals(result.data?.email, 'donor@example.com')
  assertEquals(result.data?.lifetime_giving, '50000')
  assertEquals(result.data?.capacity_rating, '500000')
})

Deno.test('validateRaisersEdgeRow - valid row with email only', () => {
  const row = {
    email: 'donor@example.com',
    donor_id: 'RE124',
    lifetime_giving: '25000',
    capacity_rating: '250000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, true)
})

Deno.test('validateRaisersEdgeRow - invalid: missing all identifiers', () => {
  const row = {
    donor_id: 'RE125',
    lifetime_giving: '10000',
    capacity_rating: '100000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validateRaisersEdgeRow - invalid: negative lifetime_giving', () => {
  const row = {
    email: 'test@example.com',
    lifetime_giving: '-1000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validateRaisersEdgeRow - invalid: negative capacity_rating', () => {
  const row = {
    email: 'test@example.com',
    lifetime_giving: '1000',
    capacity_rating: '-50000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validateRaisersEdgeRow - invalid: non-numeric values', () => {
  const row = {
    email: 'test@example.com',
    lifetime_giving: 'invalid',
    capacity_rating: 'also invalid'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validateRaisersEdgeRow - default values for missing fields', () => {
  const row = {
    email: 'test@example.com'
    // Missing most fields
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, true)
  assertEquals(result.data?.lifetime_giving, '0')
  assertEquals(result.data?.capacity_rating, '0')
  assertEquals(result.data?.donor_id, '')
})

Deno.test('validateRaisersEdgeRow - ZIP code truncation', () => {
  const row = {
    email: 'test@example.com',
    zip: '30301-1234',
    lifetime_giving: '5000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, true)
  assertEquals(result.data?.zip, '30301')
})

Deno.test('validateRaisersEdgeRow - whitespace trimming', () => {
  const row = {
    email: '  donor@example.com  ',
    first_name: '  Jane  ',
    last_name: '  Doe  ',
    donor_id: '  RE999  ',
    lifetime_giving: '10000'
  }

  const result = validateRaisersEdgeRow(row, 1)
  assertEquals(result.valid, true)
  assertEquals(result.data?.email, 'donor@example.com')
  assertEquals(result.data?.first_name, 'Jane')
  assertEquals(result.data?.last_name, 'Doe')
  assertEquals(result.data?.donor_id, 'RE999')
})

// ============================================================================
// INTEGRATION TESTS (require Supabase running)
// ============================================================================

/*
These integration tests require:
1. Supabase running locally (supabase start)
2. Migrations applied (supabase db reset)
3. identity_resolve function deployed

Example integration test structure:

Deno.test('ingest_raisers_edge - successful CSV import', async () => {
  const csvData = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
major.donor@example.com,Major,Donor,555-0201,30301,RE001,100000,1000000
regular.donor@example.com,Regular,Donor,555-0202,30302,RE002,5000,50000`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      csvData,
      dryRun: false
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.result.totalRows, 2)
  assertEquals(data.data.result.processed, 2)
  assertEquals(data.data.result.errors.length, 0)
})

Deno.test('ingest_raisers_edge - creates major gift opportunities', async () => {
  const csvData = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
major.gift@example.com,Major,Gift,555-3333,30301,RE100,50000,500000`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      csvData,
      dryRun: false
    })
  })

  assertEquals(response.status, 200)

  // Verify opportunity was created with correct amount
  // Expected amount = max(capacity * 0.1, lifetime * 0.2, 5000)
  // Expected amount = max(50000, 10000, 5000) = 50000
})

Deno.test('ingest_raisers_edge - skips small donors (no opportunity)', async () => {
  const csvData = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
small.donor@example.com,Small,Donor,555-4444,30301,RE200,500,5000`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      csvData,
      dryRun: false
    })
  })

  assertEquals(response.status, 200)

  // Verify no opportunity was created (giving < $1000 and capacity < $10000)
  // But constituent should still be created/updated
})

Deno.test('ingest_raisers_edge - updates existing donors', async () => {
  // First import
  const csvData1 = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
existing.donor@example.com,Existing,Donor,555-5555,30301,RE300,25000,250000`

  await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({ csvData: csvData1 })
  })

  // Second import with increased giving
  const csvData2 = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
existing.donor@example.com,Existing,Donor,555-5555,30301,RE300,75000,500000`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({ csvData: csvData2 })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.result.updated, 1)
  assertEquals(data.data.result.created, 0)

  // Verify lifetime_giving was updated to $75000
  // Verify opportunity amount was increased
})

Deno.test('ingest_raisers_edge - dry run mode', async () => {
  const csvData = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
dryrun.test@example.com,Dry,Run,555-6666,30399,RE999,10000,100000`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      csvData,
      dryRun: true
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.dryRun, true)
  assertEquals(data.data.result.processed, 1)

  // Verify no records were actually created
})

Deno.test('ingest_raisers_edge - error handling', async () => {
  const csvData = `email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
valid@example.com,Valid,Donor,555-0001,30301,RE001,10000,100000
,,,,,RE002,invalid,invalid
another@example.com,Another,Donor,555-0002,30302,RE003,5000,50000`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_raisers_edge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      csvData,
      dryRun: false
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.result.totalRows, 3)
  assertEquals(data.data.result.processed, 2)
  assertEquals(data.data.result.skipped, 1)
  assertEquals(data.data.result.errors.length, 1)
})
*/
