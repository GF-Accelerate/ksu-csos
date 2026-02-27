/**
 * Tests for ingest_paciolan Edge Function
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// ============================================================================
// UNIT TESTS (Validation Logic)
// ============================================================================

interface PaciolanRow {
  email: string
  first_name: string
  last_name: string
  phone: string
  zip: string
  account_id: string
  lifetime_spend: string
  sport_affinity: string
}

/**
 * Validation function (extracted for testing)
 */
function validatePaciolanRow(row: any, rowIndex: number): { valid: boolean; error?: string; data?: PaciolanRow } {
  if (!row.email && !row.phone && !(row.first_name && row.last_name && row.zip)) {
    return {
      valid: false,
      error: 'Row must have email, phone, or (first_name + last_name + zip)'
    }
  }

  const lifetimeSpend = parseFloat(row.lifetime_spend || '0')
  if (isNaN(lifetimeSpend) || lifetimeSpend < 0) {
    return {
      valid: false,
      error: `Invalid lifetime_spend: ${row.lifetime_spend}`
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
      account_id: row.account_id?.trim() || '',
      lifetime_spend: lifetimeSpend.toString(),
      sport_affinity: row.sport_affinity?.trim() || ''
    }
  }
}

Deno.test('validatePaciolanRow - valid row with email', () => {
  const row = {
    email: 'john@example.com',
    first_name: 'John',
    last_name: 'Smith',
    phone: '555-123-4567',
    zip: '30301',
    account_id: 'PAC123',
    lifetime_spend: '5000',
    sport_affinity: 'football'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, true)
  assertExists(result.data)
  assertEquals(result.data?.email, 'john@example.com')
  assertEquals(result.data?.lifetime_spend, '5000')
})

Deno.test('validatePaciolanRow - valid row with phone only', () => {
  const row = {
    phone: '555-123-4567',
    first_name: 'John',
    last_name: 'Smith',
    zip: '30301',
    account_id: 'PAC124',
    lifetime_spend: '3000',
    sport_affinity: 'basketball'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, true)
})

Deno.test('validatePaciolanRow - valid row with name + zip only', () => {
  const row = {
    first_name: 'John',
    last_name: 'Smith',
    zip: '30301',
    account_id: 'PAC125',
    lifetime_spend: '2500',
    sport_affinity: 'baseball'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, true)
})

Deno.test('validatePaciolanRow - invalid: missing all identifiers', () => {
  const row = {
    account_id: 'PAC126',
    lifetime_spend: '1000',
    sport_affinity: 'football'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validatePaciolanRow - invalid: negative lifetime_spend', () => {
  const row = {
    email: 'test@example.com',
    lifetime_spend: '-500'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validatePaciolanRow - invalid: non-numeric lifetime_spend', () => {
  const row = {
    email: 'test@example.com',
    lifetime_spend: 'invalid'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, false)
  assertExists(result.error)
})

Deno.test('validatePaciolanRow - zip code truncation', () => {
  const row = {
    email: 'test@example.com',
    zip: '30301-1234', // 9-digit ZIP+4
    lifetime_spend: '1000'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, true)
  assertEquals(result.data?.zip, '30301') // Should truncate to 5 digits
})

Deno.test('validatePaciolanRow - whitespace trimming', () => {
  const row = {
    email: '  john@example.com  ',
    first_name: '  John  ',
    last_name: '  Smith  ',
    lifetime_spend: '1000'
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, true)
  assertEquals(result.data?.email, 'john@example.com')
  assertEquals(result.data?.first_name, 'John')
  assertEquals(result.data?.last_name, 'Smith')
})

Deno.test('validatePaciolanRow - default values for missing fields', () => {
  const row = {
    email: 'test@example.com'
    // Missing most optional fields
  }

  const result = validatePaciolanRow(row, 1)
  assertEquals(result.valid, true)
  assertEquals(result.data?.lifetime_spend, '0')
  assertEquals(result.data?.account_id, '')
  assertEquals(result.data?.sport_affinity, '')
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

Deno.test('ingest_paciolan - successful CSV import', async () => {
  const csvData = `email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
john.smith@example.com,John,Smith,555-0101,30301,PAC001,5000,football
jane.doe@example.com,Jane,Doe,555-0102,30302,PAC002,3500,basketball`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_paciolan', {
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

Deno.test('ingest_paciolan - dry run mode', async () => {
  const csvData = `email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
new.user@example.com,New,User,555-9999,30399,PAC999,10000,football`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_paciolan', {
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

  // Verify no records were actually created (dry run)
  // Query database to confirm
})

Deno.test('ingest_paciolan - error handling for invalid rows', async () => {
  const csvData = `email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
valid@example.com,Valid,User,555-0001,30301,PAC001,5000,football
,,,,,PAC002,invalid,basketball
another@example.com,Another,User,555-0002,30302,PAC003,3000,baseball`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_paciolan', {
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
  assertEquals(data.data.result.processed, 2) // 2 valid rows
  assertEquals(data.data.result.skipped, 1) // 1 invalid row
  assertEquals(data.data.result.errors.length, 1)
})

Deno.test('ingest_paciolan - creates ticket opportunities', async () => {
  const csvData = `email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
ticket.holder@example.com,Ticket,Holder,555-1111,30301,PAC100,7500,football`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_paciolan', {
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

  // Verify opportunity was created
  // Query opportunity table for type='ticket' and constituent
})

Deno.test('ingest_paciolan - updates existing constituents', async () => {
  // First import
  const csvData1 = `email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
existing@example.com,Existing,User,555-2222,30301,PAC200,5000,football`

  await fetch('http://localhost:54321/functions/v1/ingest_paciolan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({ csvData: csvData1 })
  })

  // Second import with updated spend
  const csvData2 = `email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
existing@example.com,Existing,User,555-2222,30301,PAC200,8000,football`

  const response = await fetch('http://localhost:54321/functions/v1/ingest_paciolan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({ csvData: csvData2 })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.data.result.updated, 1) // Should update existing
  assertEquals(data.data.result.created, 0) // Should not create duplicate

  // Verify lifetime_spend was updated to $8000
})
*/
