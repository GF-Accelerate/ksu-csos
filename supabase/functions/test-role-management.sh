#!/bin/bash

# Manual Test Script for Role Management Functions
# Prerequisites:
# 1. Supabase running locally (supabase start)
# 2. Migrations applied (supabase db reset)
# 3. A valid JWT token for an admin user

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SUPABASE_URL="http://localhost:54321"
FUNCTIONS_URL="${SUPABASE_URL}/functions/v1"

# You need to replace this with a real JWT token from your Supabase instance
# Get it by:
# 1. Running: supabase status
# 2. Copy the anon key or service_role key
# 3. Or generate a test JWT at https://jwt.io using your JWT secret
JWT_TOKEN="YOUR_JWT_TOKEN_HERE"

# Test user IDs (from seed data)
ADMIN_USER_ID="11111111-1111-1111-1111-111111111111"
TEST_USER_ID="22222222-2222-2222-2222-222222222222"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Role Management Functions Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$JWT_TOKEN" = "YOUR_JWT_TOKEN_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid JWT token in this script${NC}"
    echo "Get your JWT token by running: supabase status"
    echo "Look for 'anon key' or 'service_role key'"
    exit 1
fi

# Test 1: Assign a role
echo -e "${YELLOW}Test 1: Assign 'major_gifts' role to user${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/role_assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{
    \"targetUserId\": \"${TEST_USER_ID}\",
    \"role\": \"major_gifts\",
    \"action\": \"assign\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ Test 1 PASSED${NC}"
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Try to assign the same role again (should fail with 409)
echo -e "${YELLOW}Test 2: Try to assign same role again (expect 409)${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/role_assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{
    \"targetUserId\": \"${TEST_USER_ID}\",
    \"role\": \"major_gifts\",
    \"action\": \"assign\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "already has this role"; then
    echo -e "${GREEN}✓ Test 2 PASSED (correctly rejected duplicate)${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: List roles for the user
echo -e "${YELLOW}Test 3: List roles for user${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/role_list?userId=${TEST_USER_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "major_gifts"; then
    echo -e "${GREEN}✓ Test 3 PASSED${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# Test 4: Assign another role
echo -e "${YELLOW}Test 4: Assign 'ticketing' role to user${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/role_assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{
    \"targetUserId\": \"${TEST_USER_ID}\",
    \"role\": \"ticketing\",
    \"action\": \"assign\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ Test 4 PASSED${NC}"
else
    echo -e "${RED}✗ Test 4 FAILED${NC}"
fi
echo ""

# Test 5: List all user-role mappings (admin only)
echo -e "${YELLOW}Test 5: List all user-role mappings${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/role_list" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "totalUsers"; then
    echo -e "${GREEN}✓ Test 5 PASSED${NC}"
else
    echo -e "${RED}✗ Test 5 FAILED${NC}"
fi
echo ""

# Test 6: Remove a role
echo -e "${YELLOW}Test 6: Remove 'ticketing' role from user${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/role_assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{
    \"targetUserId\": \"${TEST_USER_ID}\",
    \"role\": \"ticketing\",
    \"action\": \"remove\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✓ Test 6 PASSED${NC}"
else
    echo -e "${RED}✗ Test 6 FAILED${NC}"
fi
echo ""

# Test 7: Verify role was removed
echo -e "${YELLOW}Test 7: Verify 'ticketing' role was removed${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/role_list?userId=${TEST_USER_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "ticketing"; then
    echo -e "${RED}✗ Test 7 FAILED (role still present)${NC}"
else
    echo -e "${GREEN}✓ Test 7 PASSED (role removed)${NC}"
fi
echo ""

# Test 8: Try to assign invalid role (should fail)
echo -e "${YELLOW}Test 8: Try to assign invalid role (expect error)${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/role_assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{
    \"targetUserId\": \"${TEST_USER_ID}\",
    \"role\": \"invalid_role\",
    \"action\": \"assign\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q "Invalid role"; then
    echo -e "${GREEN}✓ Test 8 PASSED (correctly rejected invalid role)${NC}"
else
    echo -e "${RED}✗ Test 8 FAILED${NC}"
fi
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Tests Complete${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Check audit_log table for role change entries"
echo "2. Verify RLS policies are working correctly"
echo "3. Test with non-admin users (should be rejected)"
