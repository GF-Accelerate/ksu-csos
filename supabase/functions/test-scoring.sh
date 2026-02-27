#!/bin/bash

# Manual Test Script for Scoring Engine
# Tests scoring calculations and performance

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
echo -e "${YELLOW}Scoring Engine Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid service role key${NC}"
    echo "Get your service role key by running: supabase status"
    exit 1
fi

# Test 1: Score all constituents
echo -e "${BLUE}Test 1: Score all constituents${NC}"
START_TIME=$(date +%s%3N)
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/scoring_run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{}')
END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo "Response: $RESPONSE"
echo "Duration: ${DURATION}ms"

if echo "$RESPONSE" | grep -q '"success":true'; then
    TOTAL=$(echo "$RESPONSE" | grep -o '"totalConstituents":[0-9]*' | cut -d':' -f2)
    SCORED=$(echo "$RESPONSE" | grep -o '"scored":[0-9]*' | cut -d':' -f2)
    echo -e "${GREEN}✓ Test 1 PASSED - Scored ${SCORED}/${TOTAL} constituents in ${DURATION}ms${NC}"

    # Check performance requirement: 1000+ in <30s
    if [ "$TOTAL" -ge 1000 ] && [ "$DURATION" -ge 30000 ]; then
        echo -e "${YELLOW}⚠ WARNING: Performance goal not met (should be <30s for 1000+)${NC}"
    fi
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Score specific constituents
echo -e "${BLUE}Test 2: Score specific constituents${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/scoring_run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentIds": ["c1", "c2", "c3"]
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"totalConstituents":3'; then
    echo -e "${GREEN}✓ Test 2 PASSED - Scored specific constituents${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: Custom batch size
echo -e "${BLUE}Test 3: Custom batch size${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/scoring_run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "batchSize": 10
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Test 3 PASSED - Custom batch size accepted${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# Test 4: Verify scores in database
echo -e "${BLUE}Test 4: Verify scores were saved to database${NC}"
echo "Run this SQL query to verify:"
echo ""
echo "  SELECT COUNT(*) as total_scores,"
echo "         COUNT(DISTINCT constituent_id) as unique_constituents,"
echo "         as_of_date"
echo "  FROM scores"
echo "  WHERE as_of_date = CURRENT_DATE"
echo "  GROUP BY as_of_date;"
echo ""
echo "Expected: total_scores should equal the number scored above"
echo ""

# Test 5: Check scoring distribution
echo -e "${BLUE}Test 5: Check scoring distribution${NC}"
echo "Run these SQL queries to verify scoring logic:"
echo ""
echo "-- Renewal risk distribution"
echo "SELECT renewal_risk, COUNT(*) as count"
echo "FROM scores"
echo "WHERE as_of_date = CURRENT_DATE"
echo "GROUP BY renewal_risk;"
echo ""
echo "-- Ask readiness distribution"
echo "SELECT ask_readiness, COUNT(*) as count"
echo "FROM scores"
echo "WHERE as_of_date = CURRENT_DATE"
echo "GROUP BY ask_readiness;"
echo ""
echo "-- Ticket propensity distribution"
echo "SELECT"
echo "  CASE"
echo "    WHEN ticket_propensity = 0 THEN '0 (No spend)'"
echo "    WHEN ticket_propensity < 20 THEN '1-19 (Low)'"
echo "    WHEN ticket_propensity < 50 THEN '20-49 (Medium)'"
echo "    WHEN ticket_propensity < 100 THEN '50-99 (High)'"
echo "    ELSE '100 (Max)'"
echo "  END as propensity_range,"
echo "  COUNT(*) as count"
echo "FROM scores"
echo "WHERE as_of_date = CURRENT_DATE"
echo "GROUP BY"
echo "  CASE"
echo "    WHEN ticket_propensity = 0 THEN '0 (No spend)'"
echo "    WHEN ticket_propensity < 20 THEN '1-19 (Low)'"
echo "    WHEN ticket_propensity < 50 THEN '20-49 (Medium)'"
echo "    WHEN ticket_propensity < 100 THEN '50-99 (High)'"
echo "    ELSE '100 (Max)'"
echo "  END"
echo "ORDER BY propensity_range;"
echo ""

# Test 6: Verify audit log
echo -e "${BLUE}Test 6: Verify audit log${NC}"
echo "Run this SQL query to check audit trail:"
echo ""
echo "  SELECT *"
echo "  FROM audit_log"
echo "  WHERE action = 'score_calculate'"
echo "  ORDER BY created_at DESC"
echo "  LIMIT 5;"
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Automated tests completed. Run the SQL queries above to verify:"
echo "1. Scores were saved to database"
echo "2. Scoring distribution looks correct"
echo "3. Audit log captured the run"
echo ""
echo "Key metrics to check:"
echo "- Renewal risk: Should have mix of low/medium/high"
echo "- Ask readiness: Most should be 'not_ready' (ready requires active opp + recent touch)"
echo "- Ticket propensity: Distribution based on lifetime_ticket_spend"
echo "- Corporate propensity: 100 for corporate, 0 for others"
