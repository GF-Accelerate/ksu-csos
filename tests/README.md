# KSU CSOS - Testing Guide

This directory contains all tests for the KSU College Sports Operating System (CSOS).

## Test Structure

```
tests/
├── integration/              # Integration tests
│   └── routing-collision.test.ts
├── e2e/                      # End-to-end tests
│   └── proposal-workflow.test.ts
├── performance/              # Performance/load tests
│   └── scoring-load.test.ts
├── run-all-tests.sh          # Master test runner
└── README.md                 # This file
```

## Test Categories

### 1. Unit Tests (Edge Functions)

**Location**: `supabase/functions/*/test.ts`

**Purpose**: Test individual Edge Functions in isolation

**Coverage**:
- ✅ `role_assign/test.ts` - Role management
- ✅ `role_list/test.ts` - Role queries
- ✅ `identity_resolve/test.ts` - Constituent matching
- ✅ `ingest_paciolan/test.ts` - Ticketing CSV import
- ✅ `ingest_raisers_edge/test.ts` - Donor CSV import
- ✅ `scoring_run/test.ts` - Scoring algorithms
- ✅ `routing_engine/test.ts` - Routing logic
- ✅ `proposal_generate/test.ts` - Proposal generation
- ✅ `dashboard_data/test.ts` - Dashboard queries
- ✅ `work_queue/test.ts` - Work queue logic

**Run unit tests**:
```bash
# Test single function
deno test --allow-all supabase/functions/role_assign/test.ts

# Test all functions
./tests/run-all-tests.sh
```

### 2. Integration Tests

**Location**: `tests/integration/`

**Purpose**: Test complete workflows across multiple Edge Functions

**Coverage**:
- ✅ Routing engine + collision detection
- Opportunity creation → routing → task creation
- Collision scenarios (major gift blocks ticketing, etc.)
- Override workflows

**Run integration tests**:
```bash
deno test --allow-all tests/integration/routing-collision.test.ts
```

### 3. E2E Tests

**Location**: `tests/e2e/`

**Purpose**: Test complete user workflows from start to finish

**Coverage**:
- ✅ Complete proposal workflow:
  - Create opportunity
  - Generate AI proposal
  - Edit content
  - Submit for approval
  - Approve (single or multi-level)
  - Send via email
  - Verify interaction log and follow-up task

**Run E2E tests**:
```bash
deno test --allow-all tests/e2e/proposal-workflow.test.ts
```

### 4. Performance Tests

**Location**: `tests/performance/`

**Purpose**: Test system performance under load

**Coverage**:
- ✅ Scoring run with 1000+ constituents
- Batch processing optimization
- Memory usage tracking
- Concurrent operations

**Requirements**:
- Scoring 1000 constituents in <30 seconds
- No memory leaks
- Consistent performance across runs

**Run performance tests**:
```bash
deno test --allow-all tests/performance/scoring-load.test.ts
```

## Running All Tests

### Quick Start

Run all tests in one command:

```bash
./tests/run-all-tests.sh
```

This will:
1. Run all Edge Function unit tests
2. Run integration tests
3. Run E2E tests
4. Run performance tests
5. Display summary of results

### Manual Test Execution

#### Edge Function Tests
```bash
# Test specific function
deno test --allow-all supabase/functions/role_assign/test.ts

# Test all functions
find supabase/functions -name "test.ts" -exec deno test --allow-all {} \;
```

#### Integration Tests
```bash
deno test --allow-all tests/integration/*.test.ts
```

#### E2E Tests
```bash
deno test --allow-all tests/e2e/*.test.ts
```

#### Performance Tests
```bash
deno test --allow-all tests/performance/*.test.ts
```

## Test Environment Setup

### Prerequisites

1. **Deno** (for Edge Function tests)
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

2. **Supabase CLI** (for local testing)
   ```bash
   npm install -g supabase
   ```

3. **Local Supabase Instance**
   ```bash
   supabase start
   ```

### Environment Variables

Create `.env.test` for test configuration:

```bash
# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (for proposal generation tests)
OPENAI_API_KEY=your-openai-api-key

# Test Database
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

Load environment:
```bash
export $(cat .env.test | xargs)
```

## Test Data

### Seed Data

The test database is seeded with:
- 7 test users (one per role)
- 50 test constituents
- 100 test opportunities
- 20 test proposals
- Sample interaction logs

**Load seed data**:
```bash
supabase db reset  # Resets and applies all migrations + seed
```

### Test-Specific Data

Some tests create temporary data:
- Integration tests: Create/delete opportunities
- E2E tests: Create proposals and verify cleanup
- Performance tests: Generate 1000+ mock constituents

**Cleanup**: All test data is cleaned up automatically or via transaction rollback.

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Push to main branch

**Workflows**:
- `.github/workflows/ci-functions.yml` - Edge Function tests
- `.github/workflows/ci-web.yml` - Frontend tests

### Manual CI Trigger

```bash
# Trigger CI workflow manually
gh workflow run ci-functions.yml
```

## Writing New Tests

### Edge Function Unit Test Template

```typescript
import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";

Deno.test("Function Name - Test Description", async () => {
  // Arrange
  const input = { /* test data */ };

  // Act
  const result = await yourFunction(input);

  // Assert
  assertEquals(result.status, "success");
  assertExists(result.data);
});
```

### Integration Test Template

```typescript
Deno.test("Integration: Workflow Name", async () => {
  // Step 1: Create initial data
  const opportunity = await createOpportunity({ /* data */ });

  // Step 2: Trigger workflow
  const routing = await routeOpportunity(opportunity.id);

  // Step 3: Verify results
  assertEquals(routing.primary_owner_role, "major_gifts");

  // Step 4: Cleanup
  await deleteOpportunity(opportunity.id);
});
```

## Test Coverage Goals

- **Unit Tests**: 80%+ coverage for Edge Functions
- **Integration Tests**: All critical workflows covered
- **E2E Tests**: All user-facing workflows covered
- **Performance Tests**: All high-load operations validated

## Troubleshooting

### Common Issues

**Issue**: `Deno command not found`
```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Add to PATH
export PATH="$HOME/.deno/bin:$PATH"
```

**Issue**: `Supabase connection failed`
```bash
# Start local Supabase
supabase start

# Check status
supabase status
```

**Issue**: `Tests timing out`
```bash
# Increase timeout
deno test --allow-all --timeout 60000 test.ts
```

**Issue**: `Environment variables not loaded`
```bash
# Load .env.test
export $(cat .env.test | xargs)

# Or use direnv
echo "export SUPABASE_URL=..." > .envrc
direnv allow
```

## Manual Testing

For features not covered by automated tests:

### Manual Test Checklist

- [ ] Login with each role (executive, major_gifts, ticketing, corporate, admin)
- [ ] Upload CSV files (Paciolan, Raiser's Edge)
- [ ] Generate proposal with AI
- [ ] Approve proposal (single and multi-level)
- [ ] Send proposal via email
- [ ] Use voice console commands
- [ ] Check dashboard metrics
- [ ] Verify RLS policies (try accessing data outside portfolio)
- [ ] Test collision detection manually

### Browser Testing

Test in multiple browsers:
- [ ] Chrome/Edge (primary)
- [ ] Safari
- [ ] Firefox (voice console not supported)

## Security Testing

### Penetration Testing

- [ ] SQL injection attempts
- [ ] XSS attacks
- [ ] CSRF attacks
- [ ] Authentication bypass attempts
- [ ] RLS policy bypass attempts

### OWASP Top 10 Checks

- [ ] Broken Access Control
- [ ] Cryptographic Failures
- [ ] Injection
- [ ] Insecure Design
- [ ] Security Misconfiguration
- [ ] Vulnerable Components
- [ ] Authentication Failures
- [ ] Data Integrity Failures
- [ ] Security Logging Failures
- [ ] Server-Side Request Forgery

## Performance Benchmarks

### Target Performance

| Operation | Target | Acceptable | Threshold |
|-----------|--------|------------|-----------|
| Scoring (1000) | <30s | <45s | <60s |
| Dashboard load | <2s | <3s | <5s |
| Proposal gen | <3s | <5s | <10s |
| CSV import (100) | <3s | <5s | <10s |
| Voice command | <1.5s | <2.5s | <5s |

### Load Testing with k6

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Linux

# Run load test
k6 run tests/performance/load-test.js
```

## Continuous Improvement

### Test Maintenance

- Review and update tests monthly
- Add tests for all bug fixes
- Expand coverage for new features
- Archive obsolete tests

### Test Metrics

Track:
- Test coverage percentage
- Test execution time
- Flaky test rate
- Bug escape rate (bugs found in production vs tests)

---

**Last Updated**: 2026-02-25
**Test Coverage**: 22/23 tasks validated (96%)
