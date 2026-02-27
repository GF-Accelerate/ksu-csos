# KSU CSOS - Testing Strategy

Comprehensive testing guidelines for the KSU CSOS platform.

**Test Coverage Goal**: >80%
**Test Frameworks**: Deno Test (backend), Vitest (frontend)
**CI Integration**: All tests run on PR

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [Performance Testing](#performance-testing)
6. [Security Testing](#security-testing)
7. [Manual Testing Checklist](#manual-testing-checklist)
8. [Test Data Management](#test-data-management)

---

## Testing Philosophy

### Pyramid Structure

```
        ┌────────────┐
        │    E2E     │ 5-10%
        ├────────────┤
        │Integration │ 15-20%
        ├────────────┤
        │    Unit    │ 70-75%
        └────────────┘
```

**Principles**:
1. **Fast Feedback**: Unit tests run in <5 seconds
2. **Isolation**: Tests don't depend on external services
3. **Deterministic**: Same input always produces same output
4. **Maintainable**: Clear test names, minimal mocking

---

## Unit Testing

### Backend (Edge Functions)

#### Setup Deno Tests

Each Edge Function should have a `test.ts` file:

**Example**: `supabase/functions/routing_engine/test.ts`

```typescript
import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts"

// Import functions to test
import { evaluateRules } from "./index.ts"

Deno.test("routing_engine: major gift >$1M routes to major_gifts", () => {
  const opportunity = {
    type: "major_gift",
    amount: 1500000,
    status: "active"
  }

  const result = evaluateRules(opportunity, mockRules)

  assertEquals(result.primary_owner_role, "major_gifts")
  assertEquals(result.priority, "high")
})

Deno.test("routing_engine: corporate >$100K routes to corporate", () => {
  const opportunity = {
    type: "corporate",
    amount: 150000,
    status: "active"
  }

  const result = evaluateRules(opportunity, mockRules)

  assertEquals(result.primary_owner_role, "corporate")
})

const mockRules = [
  {
    name: "major_gift_transformational",
    when: {
      opportunity_type: "major_gift",
      amount_gte: 1000000
    },
    then: {
      primary_owner_role: "major_gifts",
      priority: "high"
    }
  }
  // ... more rules
]
```

#### Run Deno Tests

```bash
# Run all tests in a function
deno test supabase/functions/routing_engine/test.ts --allow-all

# Run all function tests
for dir in supabase/functions/*/; do
  if [ -f "${dir}test.ts" ]; then
    deno test "${dir}test.ts" --allow-all
  fi
done

# Run with coverage
deno test --coverage=coverage/ --allow-all
deno coverage coverage/
```

---

### Frontend (React Components)

#### Setup Vitest

**Install**:
```bash
cd apps/web
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Configure**: `apps/web/vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

**Setup**: `apps/web/src/test/setup.ts`
```typescript
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

afterEach(() => {
  cleanup()
})
```

#### Component Tests

**Example**: `apps/web/src/components/StatusBadge.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('renders status text', () => {
    render(<StatusBadge status="active" />)
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('applies correct variant for high risk', () => {
    render(<StatusBadge status="high risk" />)
    const badge = screen.getByText('high risk')
    expect(badge).toHaveClass('badge-danger')
  })

  it('uses custom color map', () => {
    render(<StatusBadge
      status="custom"
      colorMap={{ custom: 'primary' }}
    />)
    expect(screen.getByText('custom')).toHaveClass('badge-primary')
  })
})
```

#### Service Tests

**Example**: `apps/web/src/services/constituentService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConstituents } from './constituentService'
import { supabase } from '@/lib/supabase'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('constituentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getConstituents returns data', async () => {
    const mockData = [
      { id: '1', first_name: 'John', last_name: 'Smith' }
    ]

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: mockData,
          error: null
        })
      })
    } as any)

    const result = await getConstituents()

    expect(result.data).toEqual(mockData)
    expect(supabase.from).toHaveBeenCalledWith('constituent_master')
  })

  it('getConstituents handles errors', async () => {
    const mockError = { message: 'Database error' }

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: mockError
        })
      })
    } as any)

    await expect(getConstituents()).rejects.toThrow('Database error')
  })
})
```

#### Run Frontend Tests

```bash
cd apps/web

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test StatusBadge.test.tsx
```

---

## Integration Testing

### Database Integration Tests

Test Edge Functions with real database (local Supabase).

**Setup**:
```bash
# Start local Supabase
supabase start

# Apply migrations
supabase db reset

# Run integration tests
deno test --allow-all supabase/functions/routing_engine/integration.test.ts
```

**Example**: `supabase/functions/routing_engine/integration.test.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseKey = 'eyJhbGc...'  // Local anon key

Deno.test("routing_engine: end-to-end with database", async () => {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Create test constituent
  const { data: constituent } = await supabase
    .from('constituent_master')
    .insert({
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com'
    })
    .select()
    .single()

  // 2. Create test opportunity
  const { data: opportunity } = await supabase
    .from('opportunity')
    .insert({
      constituent_id: constituent.id,
      type: 'major_gift',
      amount: 50000,
      status: 'active'
    })
    .select()
    .single()

  // 3. Call routing engine
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      opportunity_id: opportunity.id,
      constituent_id: constituent.id
    })
  })

  const result = await response.json()

  // 4. Verify routing
  assertEquals(result.success, true)
  assertEquals(result.routing.primary_owner_role, 'major_gifts')

  // 5. Verify task created
  const { data: tasks } = await supabase
    .from('task_work_item')
    .select()
    .eq('opportunity_id', opportunity.id)

  assertEquals(tasks.length, 1)
  assertEquals(tasks[0].type, 'cultivation')

  // Cleanup
  await supabase.from('task_work_item').delete().eq('id', tasks[0].id)
  await supabase.from('opportunity').delete().eq('id', opportunity.id)
  await supabase.from('constituent_master').delete().eq('id', constituent.id)
})
```

---

### API Integration Tests

Test full API workflows.

**Example**: Proposal Workflow Integration Test

```typescript
Deno.test("proposal workflow: generate -> approve -> send", async () => {
  // 1. Generate proposal
  const generateResponse = await fetch('http://localhost:54321/functions/v1/proposal_generate', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      opportunity_id: testOpportunityId,
      template_type: 'major_gift'
    })
  })
  const { proposal_id } = await generateResponse.json()

  // 2. Approve proposal
  const approveResponse = await fetch('http://localhost:54321/functions/v1/proposal_approve', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      proposal_id,
      action: 'approve',
      notes: 'Test approval'
    })
  })
  const approveResult = await approveResponse.json()
  assertEquals(approveResult.status, 'approved')

  // 3. Send proposal
  const sendResponse = await fetch('http://localhost:54321/functions/v1/proposal_send', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      proposal_id,
      recipient_email: 'test@example.com'
    })
  })
  const sendResult = await sendResponse.json()
  assertEquals(sendResult.success, true)

  // 4. Verify interaction logged
  const { data: interactions } = await supabase
    .from('interaction_log')
    .select()
    .eq('constituent_id', testConstituentId)
    .order('created_at', { ascending: false })
    .limit(1)

  assertEquals(interactions[0].type, 'proposal_sent')
})
```

---

## End-to-End Testing

Use Playwright for full browser automation.

### Setup Playwright

```bash
cd apps/web
npm install -D @playwright/test
npx playwright install
```

**Configure**: `apps/web/playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
})
```

### E2E Test Examples

**Example**: `apps/web/e2e/proposal-workflow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Proposal Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@ksu.edu')
    await page.fill('input[type="password"]', 'password')
    await page.click('button:text("Sign In")')
    await expect(page).toHaveURL('/dashboard')
  })

  test('create and generate proposal', async ({ page }) => {
    // Navigate to major gifts
    await page.click('a:text("Major Gifts")')
    await expect(page).toHaveURL('/major-gifts')

    // Find constituent
    await page.fill('input[placeholder="Search"]', 'John Smith')
    await page.press('input[placeholder="Search"]', 'Enter')

    // Create opportunity
    await page.click('button:text("Create Opportunity")')
    await page.fill('input[name="amount"]', '50000')
    await page.fill('textarea[name="description"]', 'Test opportunity')
    await page.click('button:text("Create")')

    // Generate proposal
    await page.click('button:text("Generate Proposal")')
    await page.waitForSelector('text=Proposal generated successfully')

    // Verify proposal in list
    await page.goto('/proposals')
    await expect(page.locator('text=John Smith')).toBeVisible()
    await expect(page.locator('text=$50K')).toBeVisible()
  })

  test('approve and send proposal', async ({ page }) => {
    await page.goto('/proposals')

    // Filter by pending approval
    await page.selectOption('select', 'pending_approval')

    // Review first proposal
    await page.click('button:text("Review")').first()

    // Approve
    await page.fill('textarea[placeholder*="notes"]', 'Approved for submission')
    await page.click('button:text("Approve Proposal")')
    await page.click('button:text("Approve this proposal?")') // Confirm dialog

    // Send
    await page.fill('input[type="email"]', 'recipient@example.com')
    await page.click('button:text("Send Proposal")')
    await page.click('button:text("Send proposal")') // Confirm dialog

    // Verify sent
    await expect(page.locator('text=Proposal sent successfully')).toBeVisible()
  })
})
```

**Run E2E Tests**:
```bash
# Run all E2E tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test
npx playwright test proposal-workflow

# Debug mode
npx playwright test --debug
```

---

## Performance Testing

### Load Testing with k6

**Install k6**: https://k6.io/docs/get-started/installation/

**Example**: `tests/load/routing_engine.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 10 },    // Stay at 10 users
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests <500ms
    http_req_failed: ['rate<0.01'],    // <1% failure rate
  },
};

const BASE_URL = 'https://abc123.supabase.co/functions/v1';
const TOKEN = 'eyJhbGc...';

export default function () {
  const payload = JSON.stringify({
    opportunity_id: 'test-id',
    constituent_id: 'test-id',
  });

  const params = {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/routing_engine`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Run Load Tests**:
```bash
k6 run tests/load/routing_engine.js

# Expected output:
# ✓ status is 200
# ✓ response time < 500ms
# http_req_duration..........: avg=234ms min=89ms med=218ms max=487ms p(95)=412ms
```

### Database Performance Testing

**Scoring Run Performance**:
```sql
-- Time scoring calculation for 1000 constituents
EXPLAIN ANALYZE
WITH scored_constituents AS (
  SELECT
    cm.id,
    -- Renewal risk calculation
    CASE
      WHEN il.last_touch IS NULL OR il.last_touch < NOW() - INTERVAL '180 days' THEN 'high'
      WHEN il.last_touch < NOW() - INTERVAL '90 days' THEN 'medium'
      ELSE 'low'
    END AS renewal_risk
    -- ... other scores
  FROM constituent_master cm
  LEFT JOIN (
    SELECT constituent_id, MAX(interaction_date) as last_touch
    FROM interaction_log
    GROUP BY constituent_id
  ) il ON cm.id = il.constituent_id
  LIMIT 1000
)
SELECT COUNT(*) FROM scored_constituents;

-- Target: <500ms for 1000 constituents
```

---

## Security Testing

### Authentication Tests

```typescript
Deno.test("authentication: rejects unauthenticated requests", async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })

  assertEquals(response.status, 401)
})

Deno.test("authentication: rejects invalid tokens", async () => {
  const response = await fetch('http://localhost:54321/functions/v1/routing_engine', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer invalid-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  })

  assertEquals(response.status, 401)
})
```

### RLS Policy Tests

```sql
-- Test RLS as different users
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims.sub = 'major-gifts-user-id';

  -- Should see only major_gifts portfolio
  SELECT COUNT(*) FROM constituent_master
  WHERE primary_owner_role = 'major_gifts';
  -- Expected: >0

  SELECT COUNT(*) FROM constituent_master
  WHERE primary_owner_role = 'ticketing';
  -- Expected: 0 (blocked by RLS)

ROLLBACK;
```

### SQL Injection Tests

```typescript
Deno.test("SQL injection: sanitizes inputs", async () => {
  const maliciousInput = "'; DROP TABLE constituent_master; --"

  const response = await fetch('http://localhost:54321/functions/v1/voice_command', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      transcript: maliciousInput
    })
  })

  const result = await response.json()

  // Should handle safely, not execute SQL
  assertEquals(result.success, false)
  assertStringIncludes(result.message, "didn't understand")
})
```

---

## Manual Testing Checklist

### Pre-Release Checklist

**Authentication & Authorization**:
- [ ] Login with email/password works
- [ ] Logout clears session
- [ ] Protected routes redirect to login
- [ ] Each role sees only authorized data
- [ ] Admin can assign/remove roles

**Major Gifts Module**:
- [ ] View ask-ready prospects
- [ ] Search constituents by name/email
- [ ] Create new opportunity (routing works)
- [ ] Generate AI proposal
- [ ] Proposal content is relevant
- [ ] Work queue shows assigned tasks

**Ticketing Module**:
- [ ] View renewal risks (high/medium/low)
- [ ] Filter by sport affinity
- [ ] View season ticket holders
- [ ] Work queue shows renewal tasks

**Corporate Module**:
- [ ] View active partnerships
- [ ] Pricing calculator computes correctly
- [ ] Create corporate opportunity
- [ ] Work queue shows corporate tasks

**Proposals**:
- [ ] List proposals by status
- [ ] Edit draft proposal
- [ ] Approve proposal (if authorized)
- [ ] Reject proposal with reason
- [ ] Send approved proposal via email
- [ ] Email received successfully

**Data Import**:
- [ ] Upload Paciolan CSV
- [ ] Upload Raiser's Edge CSV
- [ ] Dry run validation works
- [ ] Import creates/updates constituents
- [ ] Errors/warnings displayed correctly

**Voice Console**:
- [ ] Microphone capture works (Chrome)
- [ ] Transcription appears in input
- [ ] "Show renewals at risk" command works
- [ ] "Show prospects" command works
- [ ] "What's in my queue?" command works
- [ ] Results display correctly

**Executive Dashboard**:
- [ ] Pipeline metrics accurate
- [ ] Renewal risks list populated
- [ ] Ask-ready prospects list populated
- [ ] Recent activity shows interactions
- [ ] Auto-refresh works (5 min)

**Admin**:
- [ ] Role assignment works
- [ ] Role removal works
- [ ] Self-protection prevents admin removal
- [ ] Audit log records changes

---

### Browser Compatibility

Test in all major browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Safari
- [ ] Firefox

**Voice Console**:
- Chrome/Edge: ✅ Fully supported
- Safari: ✅ Fully supported
- Firefox: ⚠️ No Web Speech API (text input fallback)

---

## Test Data Management

### Seed Data

Use migration `0005_seed_data.sql` for development:
- 50 test constituents
- 100 opportunities
- 20 proposals
- 5 test users with roles

**Load seed data**:
```bash
supabase db reset  # Resets DB and applies all migrations including seed
```

### Test Data Generators

**Generate Test Constituents**:
```sql
INSERT INTO constituent_master (first_name, last_name, email, phone, zip)
SELECT
  'Test' || i,
  'User' || i,
  'test' || i || '@example.com',
  '555-' || LPAD(i::text, 4, '0'),
  '66502'
FROM generate_series(1, 1000) AS i;
```

**Generate Test Opportunities**:
```sql
INSERT INTO opportunity (constituent_id, type, amount, status)
SELECT
  c.id,
  (ARRAY['major_gift', 'ticket', 'corporate'])[floor(random() * 3 + 1)],
  (random() * 100000 + 5000)::int,
  (ARRAY['active', 'won', 'lost', 'paused'])[floor(random() * 4 + 1)]
FROM constituent_master c
WHERE c.email LIKE 'test%@example.com';
```

---

## Continuous Testing

### Pre-Commit Hooks

**Setup Husky**:
```bash
cd apps/web
npm install -D husky lint-staged
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run lint && npm run type-check"
```

### CI/CD Integration

All tests run automatically on PR via GitHub Actions:
- ✅ Frontend: lint, type-check, build, test
- ✅ Edge Functions: lint, type-check, test
- ✅ Database: migration validation

See `.github/workflows/` for full configuration.

---

## Test Coverage Goals

**Current Coverage**: (Run `npm test -- --coverage` to check)

**Target Coverage**:
- Unit Tests: >80%
- Integration Tests: >60%
- E2E Tests: Critical workflows only

**Critical Paths** (must have >90% coverage):
- Authentication/authorization
- Proposal workflow
- Routing engine
- Data ingestion

---

## Reporting Bugs

When reporting bugs, include:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Screenshots/video
5. Browser and version
6. Console errors
7. Network tab (if API related)

**Template**:
```markdown
**Bug Description**: Brief summary

**Steps to Reproduce**:
1. Go to ...
2. Click on ...
3. See error

**Expected**: What should happen

**Actual**: What actually happens

**Environment**:
- Browser: Chrome 120
- OS: Windows 11
- User Role: major_gifts

**Screenshots**: [Attach here]

**Console Errors**:
```
Error: ...
```

**Additional Context**: Any other relevant info
```

---

## Test Maintenance

**Monthly**:
- Review and update test data
- Remove obsolete tests
- Add tests for new features
- Update snapshots if UI changed

**Quarterly**:
- Review test coverage
- Refactor slow tests
- Update testing dependencies
- Performance regression testing

---

**Testing Status**: ✅ Strategy Complete
**Next Steps**: Implement tests following this strategy
