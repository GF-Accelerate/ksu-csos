#!/bin/bash

# Manual Test Script for Dashboard Data and Work Queue
# Tests dashboard metrics and work queue operations

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
echo -e "${YELLOW}Dashboard & Work Queue Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid service role key${NC}"
    echo "Get your service role key by running: supabase status"
    exit 1
fi

# ====================
# DASHBOARD DATA TESTS
# ====================

echo -e "${BLUE}=== DASHBOARD DATA TESTS ===${NC}"
echo ""

# Test 1: Get executive dashboard
echo -e "${BLUE}Test 1: Get executive dashboard${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/dashboard_data?type=executive" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"pipeline"'; then
    echo -e "${GREEN}✓ Test 1 PASSED - Executive dashboard returned${NC}"
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Get major gifts dashboard
echo -e "${BLUE}Test 2: Get major gifts dashboard${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/dashboard_data?type=major_gifts" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"ask_ready"'; then
    echo -e "${GREEN}✓ Test 2 PASSED - Major gifts dashboard returned${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: Get ticketing dashboard
echo -e "${BLUE}Test 3: Get ticketing dashboard${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/dashboard_data?type=ticketing" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"renewal_risks"'; then
    echo -e "${GREEN}✓ Test 3 PASSED - Ticketing dashboard returned${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# Test 4: Get corporate dashboard
echo -e "${BLUE}Test 4: Get corporate dashboard${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/dashboard_data?type=corporate" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"active_partnerships"'; then
    echo -e "${GREEN}✓ Test 4 PASSED - Corporate dashboard returned${NC}"
else
    echo -e "${RED}✗ Test 4 FAILED${NC}"
fi
echo ""

# Test 5: Verify caching (second request should be faster)
echo -e "${BLUE}Test 5: Verify dashboard caching${NC}"
START=$(date +%s%3N)
RESPONSE1=$(curl -s -X GET "${FUNCTIONS_URL}/dashboard_data?type=executive" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")
END1=$(date +%s%3N)
DURATION1=$((END1 - START))

# Wait 1 second then fetch again
sleep 1

START=$(date +%s%3N)
RESPONSE2=$(curl -s -X GET "${FUNCTIONS_URL}/dashboard_data?type=executive" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")
END2=$(date +%s%3N)
DURATION2=$((END2 - START))

echo "First request: ${DURATION1}ms"
echo "Second request (cached): ${DURATION2}ms"

if [ "$DURATION2" -lt "$DURATION1" ]; then
    echo -e "${GREEN}✓ Test 5 PASSED - Caching is working (second request faster)${NC}"
else
    echo -e "${YELLOW}⚠ Test 5 WARNING - Cache may not be working (second request not faster)${NC}"
fi
echo ""

# ====================
# WORK QUEUE TESTS
# ====================

echo -e "${BLUE}=== WORK QUEUE TESTS ===${NC}"
echo ""

# Test 6: Get combined work queue
echo -e "${BLUE}Test 6: Get combined work queue${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/work_queue?assigned_to=combined&status=pending" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"tasks"'; then
    TASK_COUNT=$(echo "$RESPONSE" | grep -o '"total":[0-9]*' | head -1 | cut -d':' -f2)
    echo -e "${GREEN}✓ Test 6 PASSED - Work queue returned (${TASK_COUNT} tasks)${NC}"
else
    echo -e "${RED}✗ Test 6 FAILED${NC}"
fi
echo ""

# Test 7: Get role-specific work queue
echo -e "${BLUE}Test 7: Get role-specific work queue (major_gifts)${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/work_queue?assigned_to=role&role=major_gifts&status=pending" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"tasks"'; then
    echo -e "${GREEN}✓ Test 7 PASSED - Role work queue returned${NC}"
else
    echo -e "${RED}✗ Test 7 FAILED${NC}"
fi
echo ""

# Test 8: Get work queue with pagination
echo -e "${BLUE}Test 8: Get work queue with pagination${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/work_queue?assigned_to=combined&status=pending&page=1&limit=10" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:200}..."
if echo "$RESPONSE" | grep -q '"total_pages"'; then
    echo -e "${GREEN}✓ Test 8 PASSED - Pagination working${NC}"
else
    echo -e "${RED}✗ Test 8 FAILED${NC}"
fi
echo ""

# Test 9: Claim a task
echo -e "${BLUE}Test 9: Claim a task${NC}"

# First get an unclaimed task
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/work_queue?assigned_to=role&role=major_gifts&status=pending&limit=1" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

TASK_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$TASK_ID" ]; then
    # Try to claim it
    RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/work_queue" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -d "{
        \"action\": \"claim\",
        \"taskId\": \"${TASK_ID}\"
      }")

    echo "Response: $RESPONSE"
    if echo "$RESPONSE" | grep -q '"message":"Task claimed successfully"' || echo "$RESPONSE" | grep -q 'already claimed'; then
        echo -e "${GREEN}✓ Test 9 PASSED - Task claim processed${NC}"
    else
        echo -e "${RED}✗ Test 9 FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test 9 SKIPPED - No unclaimed tasks available${NC}"
fi
echo ""

# Test 10: Update task status
echo -e "${BLUE}Test 10: Update task status${NC}"

if [ -n "$TASK_ID" ]; then
    RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/work_queue" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -d "{
        \"action\": \"update_status\",
        \"taskId\": \"${TASK_ID}\",
        \"status\": \"in_progress\",
        \"notes\": \"Started working on this task\"
      }")

    echo "Response: $RESPONSE"
    if echo "$RESPONSE" | grep -q '"message":"Task status updated successfully"' || echo "$RESPONSE" | grep -q 'do not own'; then
        echo -e "${GREEN}✓ Test 10 PASSED - Status update processed${NC}"
    else
        echo -e "${RED}✗ Test 10 FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test 10 SKIPPED - No task ID available${NC}"
fi
echo ""

# Test 11: Get work queue grouped by type
echo -e "${BLUE}Test 11: Verify work queue grouping${NC}"
RESPONSE=$(curl -s -X GET "${FUNCTIONS_URL}/work_queue?assigned_to=combined&status=all" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo "Response snippet: ${RESPONSE:0:300}..."
if echo "$RESPONSE" | grep -q '"grouped"'; then
    echo -e "${GREEN}✓ Test 11 PASSED - Work queue grouped by type${NC}"
else
    echo -e "${RED}✗ Test 11 FAILED${NC}"
fi
echo ""

# ====================
# DATABASE VERIFICATION
# ====================

echo -e "${BLUE}=== DATABASE VERIFICATION ===${NC}"
echo ""

# Test 12: Verify dashboard data in database
echo -e "${BLUE}Test 12: Verify dashboard data sources${NC}"
echo "Run these SQL queries to verify dashboard data:"
echo ""
echo "-- Pipeline summary"
echo "SELECT type, status, COUNT(*) as count, SUM(amount) as total_value"
echo "FROM opportunity"
echo "GROUP BY type, status;"
echo ""
echo "-- Renewal risks"
echo "SELECT COUNT(*) as high_risk_count"
echo "FROM scores"
echo "WHERE renewal_risk = 'high'"
echo "  AND as_of_date = CURRENT_DATE;"
echo ""
echo "-- Ask-ready prospects"
echo "SELECT COUNT(*) as ready_count"
echo "FROM scores"
echo "WHERE ask_readiness = 'ready'"
echo "  AND as_of_date = CURRENT_DATE;"
echo ""

# Test 13: Verify work queue in database
echo -e "${BLUE}Test 13: Verify work queue tasks${NC}"
echo "Run these SQL queries to verify work queue:"
echo ""
echo "-- Tasks by status"
echo "SELECT status, COUNT(*) as count"
echo "FROM task_work_item"
echo "GROUP BY status;"
echo ""
echo "-- Tasks by type"
echo "SELECT type, priority, COUNT(*) as count"
echo "FROM task_work_item"
echo "WHERE status = 'pending'"
echo "GROUP BY type, priority"
echo "ORDER BY priority DESC, count DESC;"
echo ""
echo "-- Unclaimed tasks by role"
echo "SELECT assigned_role, COUNT(*) as count"
echo "FROM task_work_item"
echo "WHERE assigned_user_id IS NULL"
echo "  AND status = 'pending'"
echo "GROUP BY assigned_role;"
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Automated tests completed. Run the SQL queries above to verify:"
echo ""
echo "Dashboard Data:"
echo "1. Executive dashboard shows all opportunity types"
echo "2. Team dashboards show relevant filtered data"
echo "3. Caching reduces response time"
echo "4. Renewal risks and ask-ready prospects populated"
echo ""
echo "Work Queue:"
echo "5. Combined queue shows user and role tasks"
echo "6. Role queue shows unclaimed team tasks"
echo "7. Pagination works correctly"
echo "8. Task claiming assigns to user"
echo "9. Status updates work"
echo "10. Grouping by type works"
echo ""
echo "Integration:"
echo "- Routing engine creates tasks → work queue displays them"
echo "- Scoring engine provides data → dashboards display it"
echo "- Proposal send creates follow-ups → work queue shows them"
echo ""
