#!/bin/bash

# Manual Test Script for Identity Resolution Function
# Prerequisites:
# 1. Supabase running locally (supabase start)
# 2. Migrations applied (supabase db reset)
# 3. Seed data loaded (from 0005_seed_data.sql)

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SUPABASE_URL="http://localhost:54321"
FUNCTIONS_URL="${SUPABASE_URL}/functions/v1"

# Get service role key from supabase status
# Note: You need to replace this with actual key or get it dynamically
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Identity Resolution Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid service role key${NC}"
    echo "Get your service role key by running: supabase status"
    echo "Look for 'service_role key'"
    exit 1
fi

# Test 1: Match by email (existing constituent from seed data)
echo -e "${BLUE}Test 1: Match existing constituent by email${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "email": "john.smith@example.com",
    "first_name": "John",
    "last_name": "Smith"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"matched":true' && echo "$RESPONSE" | grep -q '"matched_by":"email"'; then
    echo -e "${GREEN}✓ Test 1 PASSED - Matched by email${NC}"
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Match by phone (existing constituent from seed data)
echo -e "${BLUE}Test 2: Match existing constituent by phone${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "phone": "555-0101",
    "first_name": "John",
    "last_name": "Smith"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"matched":true' && echo "$RESPONSE" | grep -q '"matched_by":"phone"'; then
    echo -e "${GREEN}✓ Test 2 PASSED - Matched by phone${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: Match by name + zip (existing constituent from seed data)
echo -e "${BLUE}Test 3: Match existing constituent by name + zip${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "first_name": "Sarah",
    "last_name": "Johnson",
    "zip": "30302"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"matched":true' && echo "$RESPONSE" | grep -q '"matched_by":"name_zip"'; then
    echo -e "${GREEN}✓ Test 3 PASSED - Matched by name + zip${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# Test 4: Fuzzy name matching (Jon vs John)
echo -e "${BLUE}Test 4: Fuzzy match - Jon vs John${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "first_name": "Jon",
    "last_name": "Smith",
    "zip": "30301"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"matched":true'; then
    echo -e "${GREEN}✓ Test 4 PASSED - Fuzzy matching works${NC}"
else
    echo -e "${YELLOW}⚠ Test 4 WARNING - Fuzzy match may need tuning${NC}"
fi
echo ""

# Test 5: Create new constituent
echo -e "${BLUE}Test 5: Create new constituent${NC}"
RANDOM_EMAIL="test.user.$(date +%s)@example.com"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"email\": \"${RANDOM_EMAIL}\",
    \"phone\": \"555-9999\",
    \"first_name\": \"Test\",
    \"last_name\": \"User\",
    \"zip\": \"30999\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"created":true' && echo "$RESPONSE" | grep -q '"matched":false'; then
    echo -e "${GREEN}✓ Test 5 PASSED - New constituent created${NC}"

    # Extract constituent_id for cleanup
    CONSTITUENT_ID=$(echo "$RESPONSE" | grep -o '"constituent_id":"[^"]*"' | cut -d'"' -f4)
    echo "Created constituent ID: $CONSTITUENT_ID"
else
    echo -e "${RED}✗ Test 5 FAILED${NC}"
fi
echo ""

# Test 6: Phone normalization (different formats)
echo -e "${BLUE}Test 6: Phone normalization - various formats${NC}"
FORMATS=("5551234567" "555-123-4567" "(555) 123-4567" "+1-555-123-4567")
for FORMAT in "${FORMATS[@]}"; do
    RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -d "{
        \"phone\": \"${FORMAT}\",
        \"first_name\": \"Phone\",
        \"last_name\": \"Test\"
      }")

    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Format '${FORMAT}' normalized successfully${NC}"
    else
        echo -e "${RED}✗ Format '${FORMAT}' failed${NC}"
    fi
done
echo ""

# Test 7: Check for existence only (createIfNotFound: false)
echo -e "${BLUE}Test 7: Check existence without creating${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "email": "nonexistent.user@example.com",
    "createIfNotFound": false
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"matched":false' && echo "$RESPONSE" | grep -q '"created":false'; then
    echo -e "${GREEN}✓ Test 7 PASSED - No creation when createIfNotFound=false${NC}"
else
    echo -e "${RED}✗ Test 7 FAILED${NC}"
fi
echo ""

# Test 8: Household creation and linking
echo -e "${BLUE}Test 8: Household creation${NC}"
TIMESTAMP=$(date +%s)
RESPONSE1=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"email\": \"household1.${TIMESTAMP}@example.com\",
    \"first_name\": \"Member1\",
    \"last_name\": \"TestHousehold${TIMESTAMP}\",
    \"zip\": \"30888\"
  }")

HOUSEHOLD_ID1=$(echo "$RESPONSE1" | grep -o '"household_id":"[^"]*"' | cut -d'"' -f4)
echo "First member - Household ID: $HOUSEHOLD_ID1"

RESPONSE2=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"email\": \"household2.${TIMESTAMP}@example.com\",
    \"first_name\": \"Member2\",
    \"last_name\": \"TestHousehold${TIMESTAMP}\",
    \"zip\": \"30888\"
  }")

HOUSEHOLD_ID2=$(echo "$RESPONSE2" | grep -o '"household_id":"[^"]*"' | cut -d'"' -f4)
echo "Second member - Household ID: $HOUSEHOLD_ID2"

if [ "$HOUSEHOLD_ID1" = "$HOUSEHOLD_ID2" ] && [ -n "$HOUSEHOLD_ID1" ]; then
    echo -e "${GREEN}✓ Test 8 PASSED - Both members linked to same household${NC}"
else
    echo -e "${RED}✗ Test 8 FAILED - Household linking issue${NC}"
fi
echo ""

# Test 9: Invalid input (missing all identifiers)
echo -e "${BLUE}Test 9: Invalid input - missing identifiers${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "first_name": "No",
    "last_name": "Identifier"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"error"'; then
    echo -e "${GREEN}✓ Test 9 PASSED - Correctly rejected invalid input${NC}"
else
    echo -e "${RED}✗ Test 9 FAILED${NC}"
fi
echo ""

# Test 10: Case-insensitive email matching
echo -e "${BLUE}Test 10: Case-insensitive email matching${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/identity_resolve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "email": "JOHN.SMITH@EXAMPLE.COM",
    "first_name": "John",
    "last_name": "Smith"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"matched":true' && echo "$RESPONSE" | grep -q '"matched_by":"email"'; then
    echo -e "${GREEN}✓ Test 10 PASSED - Case-insensitive email matching works${NC}"
else
    echo -e "${RED}✗ Test 10 FAILED${NC}"
fi
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Tests completed. Check results above."
echo ""
echo "Next steps:"
echo "1. Verify database records were created correctly"
echo "2. Check household linkages in the database"
echo "3. Review performance with larger datasets"
echo ""
echo "SQL queries to verify:"
echo "  SELECT * FROM constituent_master ORDER BY created_at DESC LIMIT 10;"
echo "  SELECT * FROM household ORDER BY created_at DESC LIMIT 5;"
