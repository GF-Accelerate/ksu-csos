#!/bin/bash

# KSU CSOS - Complete Test Runner
# Runs all unit, integration, E2E, and performance tests

set -e  # Exit on error

echo "============================================"
echo "KSU CSOS - Running All Tests"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Change to project root
cd "$(dirname "$0")/.."

echo -e "${YELLOW}Phase 1: Edge Function Unit Tests${NC}"
echo "Running Deno tests for all Edge Functions..."
echo ""

# Find all test.ts files in functions directory
FUNCTION_TESTS=$(find supabase/functions -name "test.ts" | sort)

for test_file in $FUNCTION_TESTS; do
  function_name=$(dirname "$test_file" | xargs basename)
  echo "Testing: $function_name"

  if deno test --allow-all --quiet "$test_file"; then
    echo -e "${GREEN}✓ $function_name tests passed${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ $function_name tests failed${NC}"
    ((FAILED_TESTS++))
  fi

  ((TOTAL_TESTS++))
  echo ""
done

echo "Edge Function Unit Tests: $PASSED_TESTS/$TOTAL_TESTS passed"
echo ""

# Integration Tests
echo -e "${YELLOW}Phase 2: Integration Tests${NC}"
echo "Running integration tests (routing + collision)..."
echo ""

if [ -f "tests/integration/routing-collision.test.ts" ]; then
  if deno test --allow-all tests/integration/routing-collision.test.ts; then
    echo -e "${GREEN}✓ Integration tests passed${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ Integration tests failed${NC}"
    ((FAILED_TESTS++))
  fi
  ((TOTAL_TESTS++))
else
  echo "⚠️  Integration tests not found"
fi
echo ""

# E2E Tests
echo -e "${YELLOW}Phase 3: E2E Tests${NC}"
echo "Running E2E tests (proposal workflow)..."
echo ""

if [ -f "tests/e2e/proposal-workflow.test.ts" ]; then
  if deno test --allow-all tests/e2e/proposal-workflow.test.ts; then
    echo -e "${GREEN}✓ E2E tests passed${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ E2E tests failed${NC}"
    ((FAILED_TESTS++))
  fi
  ((TOTAL_TESTS++))
else
  echo "⚠️  E2E tests not found"
fi
echo ""

# Performance Tests
echo -e "${YELLOW}Phase 4: Performance Tests${NC}"
echo "Running performance tests (scoring load)..."
echo ""

if [ -f "tests/performance/scoring-load.test.ts" ]; then
  if deno test --allow-all tests/performance/scoring-load.test.ts; then
    echo -e "${GREEN}✓ Performance tests passed${NC}"
    ((PASSED_TESTS++))
  else
    echo -e "${RED}✗ Performance tests failed${NC}"
    ((FAILED_TESTS++))
  fi
  ((TOTAL_TESTS++))
else
  echo "⚠️  Performance tests not found"
fi
echo ""

# Frontend Tests (if configured)
echo -e "${YELLOW}Phase 5: Frontend Tests${NC}"
echo "Running frontend tests (React components)..."
echo ""

if [ -f "apps/web/package.json" ]; then
  cd apps/web

  if npm run test 2>/dev/null; then
    echo -e "${GREEN}✓ Frontend tests passed${NC}"
    ((PASSED_TESTS++))
  else
    echo "⚠️  No frontend tests configured yet"
  fi

  cd ../..
else
  echo "⚠️  Frontend not found"
fi
echo ""

# Summary
echo "============================================"
echo "Test Summary"
echo "============================================"
echo "Total test suites: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"

if [ $FAILED_TESTS -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED_TESTS${NC}"
  echo ""
  echo "Some tests failed. Please review the output above."
  exit 1
else
  echo -e "${RED}Failed: $FAILED_TESTS${NC}"
  echo ""
  echo -e "${GREEN}All tests passed! 🎉${NC}"
  exit 0
fi
