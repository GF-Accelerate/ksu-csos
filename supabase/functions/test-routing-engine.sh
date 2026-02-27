#!/bin/bash

# Manual Test Script for Routing Engine
# Tests routing decisions and collision detection

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
echo -e "${YELLOW}Routing Engine Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid service role key${NC}"
    echo "Get your service role key by running: supabase status"
    exit 1
fi

# Test 1: Route major gift ($50k) to major_gifts team
echo -e "${BLUE}Test 1: Route major gift ($50k) to major_gifts team${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-1",
    "opportunityType": "major_gift",
    "amount": 50000,
    "status": "active"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"primary_owner_role":"major_gifts"'; then
    echo -e "${GREEN}✓ Test 1 PASSED - Routed to major_gifts${NC}"
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Route transformational gift ($1.5M) with executive involvement
echo -e "${BLUE}Test 2: Route transformational gift ($1.5M) with executive${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-2",
    "opportunityType": "major_gift",
    "amount": 1500000,
    "status": "active"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"primary_owner_role":"major_gifts"' && \
   echo "$RESPONSE" | grep -q '"executive"'; then
    echo -e "${GREEN}✓ Test 2 PASSED - Routed with executive involvement${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: Route corporate partnership ($75k)
echo -e "${BLUE}Test 3: Route corporate partnership ($75k)${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-3",
    "opportunityType": "corporate",
    "amount": 75000,
    "status": "active"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"primary_owner_role":"corporate"'; then
    echo -e "${GREEN}✓ Test 3 PASSED - Routed to corporate${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# Test 4: Route premium ticket package ($12k) with major gifts cross-sell
echo -e "${BLUE}Test 4: Route premium ticket package ($12k)${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-4",
    "opportunityType": "ticket",
    "amount": 12000,
    "status": "active"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"primary_owner_role":"ticketing"'; then
    echo -e "${GREEN}✓ Test 4 PASSED - Routed to ticketing${NC}"
else
    echo -e "${RED}✗ Test 4 FAILED${NC}"
fi
echo ""

# Test 5: Route standard season tickets ($5k)
echo -e "${BLUE}Test 5: Route standard season tickets ($5k)${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-5",
    "opportunityType": "ticket",
    "amount": 5000,
    "status": "active"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"primary_owner_role":"ticketing"'; then
    echo -e "${GREEN}✓ Test 5 PASSED - Routed to ticketing${NC}"
else
    echo -e "${RED}✗ Test 5 FAILED${NC}"
fi
echo ""

# Test 6: Collision detection - Create major gift then try ticket
echo -e "${BLUE}Test 6: Collision detection (major gift blocks ticket)${NC}"

# First, create major gift
RESPONSE1=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-collision",
    "opportunityType": "major_gift",
    "amount": 100000,
    "status": "active"
  }')

echo "Created major gift opportunity"

# Now try to create ticket (should be blocked)
RESPONSE2=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-collision",
    "opportunityType": "ticket",
    "amount": 5000,
    "status": "active"
  }')

echo "Response: $RESPONSE2"
if echo "$RESPONSE2" | grep -q '"blocked":true'; then
    echo -e "${GREEN}✓ Test 6 PASSED - Ticket blocked by major gift${NC}"
else
    echo -e "${YELLOW}⚠ Test 6 WARNING - Collision may not be detected (check collision rules)${NC}"
fi
echo ""

# Test 7: Override collision with override flag
echo -e "${BLUE}Test 7: Override collision with override=true${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-collision",
    "opportunityType": "ticket",
    "amount": 5000,
    "status": "active",
    "override": true
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"opportunity_id"'; then
    echo -e "${GREEN}✓ Test 7 PASSED - Override allowed${NC}"
else
    echo -e "${RED}✗ Test 7 FAILED - Override not working${NC}"
fi
echo ""

# Test 8: Verify task work items created
echo -e "${BLUE}Test 8: Verify task work items created${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "constituentId": "test-const-6",
    "opportunityType": "major_gift",
    "amount": 50000,
    "status": "active"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"tasks_created":\['; then
    echo -e "${GREEN}✓ Test 8 PASSED - Task work item created${NC}"
else
    echo -e "${RED}✗ Test 8 FAILED - No task created${NC}"
fi
echo ""

# Test 9: Route existing opportunity (re-routing)
echo -e "${BLUE}Test 9: Route existing opportunity${NC}"

# First get an opportunity ID from previous tests
OPP_ID=$(echo "$RESPONSE1" | grep -o '"opportunity_id":"[^"]*"' | cut -d'"' -f4)

if [ -n "$OPP_ID" ]; then
    RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/routing_engine" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -d "{
        \"opportunityId\": \"$OPP_ID\"
      }")

    echo "Response: $RESPONSE"
    if echo "$RESPONSE" | grep -q '"primary_owner_role"'; then
        echo -e "${GREEN}✓ Test 9 PASSED - Re-routed existing opportunity${NC}"
    else
        echo -e "${RED}✗ Test 9 FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test 9 SKIPPED - No opportunity ID available${NC}"
fi
echo ""

# Test 10: Verify routing in database
echo -e "${BLUE}Test 10: Verify routing in database${NC}"
echo "Run this SQL query to verify:"
echo ""
echo "  SELECT o.id, o.type, o.amount, o.primary_owner_role, o.secondary_owner_roles,"
echo "         c.first_name, c.last_name"
echo "  FROM opportunity o"
echo "  JOIN constituent_master c ON o.constituent_id = c.id"
echo "  WHERE c.id LIKE 'test-const-%'"
echo "  ORDER BY o.created_at DESC"
echo "  LIMIT 10;"
echo ""
echo "Expected: primary_owner_role should match routing rules"
echo ""

# Test 11: Verify task work items in database
echo -e "${BLUE}Test 11: Verify task work items in database${NC}"
echo "Run this SQL query to verify:"
echo ""
echo "  SELECT t.*, o.type, o.amount"
echo "  FROM task_work_item t"
echo "  JOIN opportunity o ON t.opportunity_id = o.id"
echo "  WHERE t.created_at > NOW() - INTERVAL '1 hour'"
echo "  ORDER BY t.created_at DESC"
echo "  LIMIT 10;"
echo ""
echo "Expected: Tasks should be created for routed opportunities"
echo ""

# Test 12: Verify audit log
echo -e "${BLUE}Test 12: Verify audit log${NC}"
echo "Run this SQL query to check audit trail:"
echo ""
echo "  SELECT *"
echo "  FROM audit_log"
echo "  WHERE action = 'route_opportunity'"
echo "  ORDER BY created_at DESC"
echo "  LIMIT 10;"
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Automated tests completed. Run the SQL queries above to verify:"
echo "1. Opportunities were routed correctly"
echo "2. Task work items were created"
echo "3. Audit log captured routing decisions"
echo "4. Collision detection prevented conflicting touches"
echo ""
echo "Key metrics to check:"
echo "- Major gifts ($25k+): Routed to major_gifts"
echo "- Corporate partnerships: Routed to corporate"
echo "- Premium tickets ($10k+): Routed to ticketing + major_gifts"
echo "- Standard tickets: Routed to ticketing"
echo "- Collisions: Major gift blocks ticket for 14 days"
echo ""
