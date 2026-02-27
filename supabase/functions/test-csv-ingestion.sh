#!/bin/bash

# Manual Test Script for CSV Ingestion Functions
# Tests both Paciolan and Raiser's Edge ingestion

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SUPABASE_URL="http://localhost:54321"
FUNCTIONS_URL="${SUPABASE_URL}/functions/v1"
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}CSV Ingestion Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid service role key${NC}"
    echo "Get your service role key by running: supabase status"
    exit 1
fi

# ============================================================================
# PACIOLAN TESTS
# ============================================================================

echo -e "${BLUE}=== PACIOLAN INGESTION TESTS ===${NC}"
echo ""

# Test 1: Valid Paciolan CSV
echo -e "${BLUE}Test 1: Valid Paciolan CSV import${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
test.paciolan1@example.com,Test,User1,555-1001,30301,PAC001,5000,football
test.paciolan2@example.com,Test,User2,555-1002,30302,PAC002,3500,basketball'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_paciolan" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": false
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"processed":2'; then
    echo -e "${GREEN}✓ Test 1 PASSED${NC}"
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Paciolan dry run
echo -e "${BLUE}Test 2: Paciolan dry run mode${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
dryrun.test@example.com,Dry,Run,555-9999,30399,PAC999,10000,football'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_paciolan" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": true
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"dryRun":true' && echo "$RESPONSE" | grep -q '"processed":1'; then
    echo -e "${GREEN}✓ Test 2 PASSED${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: Paciolan with invalid rows
echo -e "${BLUE}Test 3: Paciolan error handling${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,account_id,lifetime_spend,sport_affinity
valid@example.com,Valid,User,555-0001,30301,PAC001,5000,football
,,,,,PAC002,invalid,basketball
another@example.com,Another,User,555-0002,30302,PAC003,3000,baseball'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_paciolan" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": false
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"errors"' && echo "$RESPONSE" | grep -q '"skipped":1'; then
    echo -e "${GREEN}✓ Test 3 PASSED - Errors handled correctly${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# ============================================================================
# RAISER'S EDGE TESTS
# ============================================================================

echo -e "${BLUE}=== RAISER'S EDGE INGESTION TESTS ===${NC}"
echo ""

# Test 4: Valid Raiser's Edge CSV
echo -e "${BLUE}Test 4: Valid Raiser's Edge CSV import${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
test.donor1@example.com,Major,Donor1,555-2001,30301,RE001,50000,500000
test.donor2@example.com,Major,Donor2,555-2002,30302,RE002,25000,250000'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_raisers_edge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": false
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"processed":2'; then
    echo -e "${GREEN}✓ Test 4 PASSED${NC}"
else
    echo -e "${RED}✗ Test 4 FAILED${NC}"
fi
echo ""

# Test 5: Raiser's Edge dry run
echo -e "${BLUE}Test 5: Raiser's Edge dry run mode${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
dryrun.donor@example.com,Dry,RunDonor,555-9998,30399,RE999,10000,100000'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_raisers_edge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": true
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"dryRun":true'; then
    echo -e "${GREEN}✓ Test 5 PASSED${NC}"
else
    echo -e "${RED}✗ Test 5 FAILED${NC}"
fi
echo ""

# Test 6: Small donors (no opportunity creation)
echo -e "${BLUE}Test 6: Small donors - no opportunity created${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
small.donor@example.com,Small,Donor,555-3001,30301,RE200,500,5000'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_raisers_edge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": false
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"processed":1'; then
    echo -e "${GREEN}✓ Test 6 PASSED - Small donor processed${NC}"
    echo -e "${YELLOW}  (Note: No opportunity should be created for this donor)${NC}"
else
    echo -e "${RED}✗ Test 6 FAILED${NC}"
fi
echo ""

# Test 7: Raiser's Edge error handling
echo -e "${BLUE}Test 7: Raiser's Edge error handling${NC}"
CSV_DATA='email,first_name,last_name,phone,zip,donor_id,lifetime_giving,capacity_rating
valid.donor@example.com,Valid,Donor,555-0101,30301,RE301,10000,100000
,,,,,RE302,invalid,invalid
another.donor@example.com,Another,Donor,555-0102,30302,RE303,5000,50000'

RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/ingest_raisers_edge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"csvData\": \"${CSV_DATA}\",
    \"dryRun\": false
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"errors"' && echo "$RESPONSE" | grep -q '"skipped":1'; then
    echo -e "${GREEN}✓ Test 7 PASSED - Errors handled correctly${NC}"
else
    echo -e "${RED}✗ Test 7 FAILED${NC}"
fi
echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "All tests completed. Check results above."
echo ""
echo "Verification queries:"
echo ""
echo "-- Check imported constituents:"
echo "SELECT * FROM constituent_master WHERE email LIKE 'test.%' ORDER BY created_at DESC;"
echo ""
echo "-- Check created opportunities:"
echo "SELECT o.*, c.email FROM opportunity o"
echo "JOIN constituent_master c ON o.constituent_id = c.id"
echo "WHERE c.email LIKE 'test.%' ORDER BY o.created_at DESC;"
echo ""
echo "-- Check audit log:"
echo "SELECT * FROM audit_log WHERE action = 'ingest_data' ORDER BY created_at DESC LIMIT 10;"
