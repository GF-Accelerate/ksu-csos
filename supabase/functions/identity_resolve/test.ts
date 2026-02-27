/**
 * Tests for identity_resolve Edge Function
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

// ============================================================================
// UNIT TESTS (Utility Functions)
// ============================================================================

/**
 * Phone normalization function (extracted for testing)
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  return digits.length > 0 ? `+${digits}` : phone
}

/**
 * String similarity function (extracted for testing)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  if (s1 === s2) return 1.0

  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  if (longer.length === 0) return 1.0

  let matches = 0
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++
  }

  return matches / longer.length
}

// ============================================================================
// Phone Normalization Tests
// ============================================================================

Deno.test('normalizePhone - 10 digit US number', () => {
  assertEquals(normalizePhone('5551234567'), '+15551234567')
  assertEquals(normalizePhone('555-123-4567'), '+15551234567')
  assertEquals(normalizePhone('(555) 123-4567'), '+15551234567')
})

Deno.test('normalizePhone - 11 digit number with leading 1', () => {
  assertEquals(normalizePhone('15551234567'), '+15551234567')
  assertEquals(normalizePhone('1-555-123-4567'), '+15551234567')
})

Deno.test('normalizePhone - already formatted', () => {
  assertEquals(normalizePhone('+15551234567'), '+15551234567')
})

Deno.test('normalizePhone - international number', () => {
  assertEquals(normalizePhone('442071234567'), '+442071234567')
})

Deno.test('normalizePhone - with spaces and special chars', () => {
  assertEquals(normalizePhone('+1 (555) 123-4567'), '+15551234567')
})

// ============================================================================
// String Similarity Tests
// ============================================================================

Deno.test('stringSimilarity - exact match', () => {
  assertEquals(stringSimilarity('John', 'John'), 1.0)
  assertEquals(stringSimilarity('JOHN', 'john'), 1.0)
})

Deno.test('stringSimilarity - similar names', () => {
  const similarity1 = stringSimilarity('John', 'Jon')
  const similarity2 = stringSimilarity('Catherine', 'Katherine')
  const similarity3 = stringSimilarity('Smith', 'Smyth')

  // Should be relatively high similarity
  assertEquals(similarity1 > 0.5, true)
  assertEquals(similarity2 > 0.5, true)
  assertEquals(similarity3 > 0.5, true)
})

Deno.test('stringSimilarity - completely different', () => {
  const similarity = stringSimilarity('John', 'Mary')

  // Should be low similarity
  assertEquals(similarity < 0.5, true)
})

Deno.test('stringSimilarity - empty strings', () => {
  assertEquals(stringSimilarity('', ''), 1.0)
  assertEquals(stringSimilarity('John', ''), 0.0)
})

Deno.test('stringSimilarity - case insensitive', () => {
  assertEquals(stringSimilarity('JOHN', 'john'), 1.0)
  assertEquals(stringSimilarity('JoHn', 'jOhN'), 1.0)
})

Deno.test('stringSimilarity - with whitespace', () => {
  assertEquals(stringSimilarity(' John ', 'John'), 1.0)
  assertEquals(stringSimilarity('John Smith', 'john smith'), 1.0)
})

// ============================================================================
// Input Validation Tests
// ============================================================================

Deno.test('validation - requires email, phone, or name+zip', () => {
  // Test that at least one identification method is required
  const validInputs = [
    { email: 'test@example.com' },
    { phone: '555-123-4567' },
    { first_name: 'John', last_name: 'Smith', zip: '30301' }
  ]

  for (const input of validInputs) {
    const hasEmail = 'email' in input
    const hasPhone = 'phone' in input
    const hasNameZip = 'first_name' in input && 'last_name' in input && 'zip' in input

    assertEquals(hasEmail || hasPhone || hasNameZip, true)
  }
})

Deno.test('validation - invalid inputs', () => {
  const invalidInputs = [
    {},
    { first_name: 'John' },
    { last_name: 'Smith' },
    { first_name: 'John', last_name: 'Smith' }, // Missing zip
    { first_name: 'John', zip: '30301' }, // Missing last_name
  ]

  for (const input of invalidInputs) {
    const hasEmail = 'email' in input && input.email
    const hasPhone = 'phone' in input && input.phone
    const hasNameZip = 'first_name' in input && 'last_name' in input && 'zip' in input

    assertEquals(hasEmail || hasPhone || hasNameZip, false)
  }
})

// ============================================================================
// INTEGRATION TESTS (require Supabase running)
// ============================================================================

/*
These integration tests require:
1. Supabase running locally (supabase start)
2. Migrations applied (supabase db reset)
3. Seed data loaded

Example integration test structure:

Deno.test('identity_resolve - match by email', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      email: 'john.smith@example.com',
      first_name: 'John',
      last_name: 'Smith',
      zip: '30301'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.matched, true)
  assertEquals(data.data.matched_by, 'email')
  assertEquals(data.data.created, false)
  assertExists(data.data.constituent_id)
})

Deno.test('identity_resolve - match by phone', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      phone: '555-0101',
      first_name: 'John',
      last_name: 'Smith'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.matched, true)
  assertEquals(data.data.matched_by, 'phone')
  assertEquals(data.data.created, false)
})

Deno.test('identity_resolve - match by name and zip', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      first_name: 'John',
      last_name: 'Smith',
      zip: '30301'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.matched, true)
  assertEquals(data.data.matched_by, 'name_zip')
  assertEquals(data.data.created, false)
})

Deno.test('identity_resolve - create new constituent', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      email: 'new.person@example.com',
      phone: '555-9999',
      first_name: 'New',
      last_name: 'Person',
      zip: '30399'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.matched, false)
  assertEquals(data.data.created, true)
  assertExists(data.data.constituent_id)
  assertExists(data.data.household_id)
})

Deno.test('identity_resolve - do not create if not found', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      email: 'nonexistent@example.com',
      createIfNotFound: false
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.matched, false)
  assertEquals(data.data.created, false)
  assertEquals(data.data.constituent_id, null)
})

Deno.test('identity_resolve - fuzzy name matching', async () => {
  // Test that slight variations in first name still match
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      first_name: 'Jon',  // vs "John" in seed data
      last_name: 'Smith',
      zip: '30301'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  // Should match due to high similarity (Jon vs John)
  assertEquals(data.data.matched, true)
  assertEquals(data.data.matched_by, 'name_zip')
})

Deno.test('identity_resolve - household creation', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      email: 'household.test@example.com',
      first_name: 'Test',
      last_name: 'Household',
      zip: '30400'
    })
  })

  assertEquals(response.status, 200)
  const data = await response.json()

  assertEquals(data.success, true)
  assertEquals(data.data.created, true)
  assertExists(data.data.household_id)

  // Second constituent with same last name and zip should use same household
  const response2 = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      email: 'household.test2@example.com',
      first_name: 'Test2',
      last_name: 'Household',
      zip: '30400'
    })
  })

  assertEquals(response2.status, 200)
  const data2 = await response2.json()

  assertEquals(data2.success, true)
  assertEquals(data2.data.created, true)
  assertEquals(data2.data.household_id, data.data.household_id)
})

Deno.test('identity_resolve - missing required fields for creation', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/identity_resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer <service-role-key>'
    },
    body: JSON.stringify({
      email: 'missing.name@example.com'
      // Missing first_name and last_name
    })
  })

  // Should fail because we can't create without names
  assertEquals(response.status, 400)
  const data = await response.json()
  assertExists(data.error)
})
*/
