#!/bin/bash

# Manual Test Script for Proposal Workflow
# Tests proposal generation, approval, and sending

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
echo -e "${YELLOW}Proposal Workflow Test Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$SERVICE_ROLE_KEY" = "YOUR_SERVICE_ROLE_KEY_HERE" ]; then
    echo -e "${RED}ERROR: Please set a valid service role key${NC}"
    echo "Get your service role key by running: supabase status"
    exit 1
fi

# Test 1: Generate proposal for major gift opportunity
echo -e "${BLUE}Test 1: Generate major gift proposal${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "opportunityId": "test-opp-1",
    "templateType": "major_gift"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":"draft"'; then
    PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓ Test 1 PASSED - Proposal generated with ID: ${PROPOSAL_ID}${NC}"
else
    echo -e "${RED}✗ Test 1 FAILED${NC}"
fi
echo ""

# Test 2: Generate corporate partnership proposal
echo -e "${BLUE}Test 2: Generate corporate partnership proposal${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "opportunityId": "test-opp-corporate-1",
    "templateType": "corporate"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":"draft"'; then
    CORP_PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}✓ Test 2 PASSED - Corporate proposal generated with ID: ${CORP_PROPOSAL_ID}${NC}"
else
    echo -e "${RED}✗ Test 2 FAILED${NC}"
fi
echo ""

# Test 3: Auto-detect template type (should detect based on opportunity type)
echo -e "${BLUE}Test 3: Auto-detect template type${NC}"
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "opportunityId": "test-opp-2"
  }')

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Test 3 PASSED - Template auto-detected${NC}"
else
    echo -e "${RED}✗ Test 3 FAILED${NC}"
fi
echo ""

# Test 4: Approve proposal (below threshold - should auto-approve)
echo -e "${BLUE}Test 4: Auto-approve proposal below threshold${NC}"

# First create a low-value proposal
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "opportunityId": "test-opp-low-value"
  }')

LOW_PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Try to approve it
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"proposalId\": \"${LOW_PROPOSAL_ID}\",
    \"action\": \"approve\",
    \"notes\": \"Test approval\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":"approved"'; then
    echo -e "${GREEN}✓ Test 4 PASSED - Proposal auto-approved${NC}"
else
    echo -e "${YELLOW}⚠ Test 4 WARNING - May require manual approval${NC}"
fi
echo ""

# Test 5: Approve proposal requiring approval
echo -e "${BLUE}Test 5: Approve high-value proposal${NC}"

# Create a high-value proposal ($50k major gift)
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "opportunityId": "test-opp-high-value"
  }')

HIGH_PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Approve it
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"proposalId\": \"${HIGH_PROPOSAL_ID}\",
    \"action\": \"approve\",
    \"notes\": \"Approved for testing\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":"approved"' || echo "$RESPONSE" | grep -q '"status":"pending_approval"'; then
    echo -e "${GREEN}✓ Test 5 PASSED - Approval processed${NC}"
else
    echo -e "${RED}✗ Test 5 FAILED${NC}"
fi
echo ""

# Test 6: Reject proposal
echo -e "${BLUE}Test 6: Reject proposal${NC}"

# Create proposal to reject
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d '{
    "opportunityId": "test-opp-reject"
  }')

REJECT_PROPOSAL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Reject it
RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{
    \"proposalId\": \"${REJECT_PROPOSAL_ID}\",
    \"action\": \"reject\",
    \"notes\": \"Not ready yet\"
  }")

echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"status":"rejected"'; then
    echo -e "${GREEN}✓ Test 6 PASSED - Proposal rejected${NC}"
else
    echo -e "${RED}✗ Test 6 FAILED${NC}"
fi
echo ""

# Test 7: Send proposal via email
echo -e "${BLUE}Test 7: Send proposal via email${NC}"

# Use the first approved proposal
if [ -n "$LOW_PROPOSAL_ID" ]; then
    RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_send" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -d "{
        \"proposalId\": \"${LOW_PROPOSAL_ID}\",
        \"deliveryMethod\": \"email\",
        \"emailAddress\": \"test@example.com\",
        \"ccAddresses\": [\"manager@ksu.edu\"],
        \"customMessage\": \"Thank you for your consideration.\"
      }")

    echo "Response: $RESPONSE"
    if echo "$RESPONSE" | grep -q '"status":"sent"'; then
        echo -e "${GREEN}✓ Test 7 PASSED - Proposal sent via email${NC}"
    else
        echo -e "${RED}✗ Test 7 FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test 7 SKIPPED - No approved proposal available${NC}"
fi
echo ""

# Test 8: Send proposal via both email and PDF
echo -e "${BLUE}Test 8: Send proposal via email + PDF${NC}"

if [ -n "$HIGH_PROPOSAL_ID" ]; then
    RESPONSE=$(curl -s -X POST "${FUNCTIONS_URL}/proposal_send" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -d "{
        \"proposalId\": \"${HIGH_PROPOSAL_ID}\",
        \"deliveryMethod\": \"both\"
      }")

    echo "Response: $RESPONSE"
    if echo "$RESPONSE" | grep -q '"status":"sent"'; then
        echo -e "${GREEN}✓ Test 8 PASSED - Proposal sent via both methods${NC}"
    else
        echo -e "${RED}✗ Test 8 FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test 8 SKIPPED - No approved proposal available${NC}"
fi
echo ""

# Test 9: Verify proposals in database
echo -e "${BLUE}Test 9: Verify proposals in database${NC}"
echo "Run this SQL query to verify:"
echo ""
echo "  SELECT p.id, p.type, p.amount, p.status, p.approved_at, p.sent_at,"
echo "         c.first_name, c.last_name"
echo "  FROM proposal p"
echo "  JOIN constituent_master c ON p.constituent_id = c.id"
echo "  WHERE p.created_at > NOW() - INTERVAL '1 hour'"
echo "  ORDER BY p.created_at DESC;"
echo ""
echo "Expected: Multiple proposals with various statuses (draft, approved, rejected, sent)"
echo ""

# Test 10: Verify interaction logs
echo -e "${BLUE}Test 10: Verify interaction logs${NC}"
echo "Run this SQL query to verify:"
echo ""
echo "  SELECT *"
echo "  FROM interaction_log"
echo "  WHERE type = 'proposal_sent'"
echo "  ORDER BY occurred_at DESC"
echo "  LIMIT 10;"
echo ""
echo "Expected: Interaction logs for sent proposals"
echo ""

# Test 11: Verify follow-up tasks created
echo -e "${BLUE}Test 11: Verify follow-up tasks created${NC}"
echo "Run this SQL query to verify:"
echo ""
echo "  SELECT t.*, p.amount"
echo "  FROM task_work_item t"
echo "  LEFT JOIN proposal p ON p.opportunity_id = t.opportunity_id"
echo "  WHERE t.type = 'follow_up'"
echo "    AND t.notes LIKE '%proposal%'"
echo "  ORDER BY t.created_at DESC"
echo "  LIMIT 10;"
echo ""
echo "Expected: Follow-up tasks created 7 days after sending"
echo ""

# Test 12: Verify audit log
echo -e "${BLUE}Test 12: Verify audit log${NC}"
echo "Run this SQL query to check audit trail:"
echo ""
echo "  SELECT *"
echo "  FROM audit_log"
echo "  WHERE action IN ('proposal_generated', 'proposal_approved', 'proposal_rejected', 'proposal_sent')"
echo "  ORDER BY created_at DESC"
echo "  LIMIT 10;"
echo ""

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "Automated tests completed. Run the SQL queries above to verify:"
echo "1. Proposals were generated with correct content"
echo "2. Approval workflow processed correctly"
echo "3. Proposals were sent and status updated"
echo "4. Interaction logs captured sends"
echo "5. Follow-up tasks created"
echo "6. Audit log captured all events"
echo ""
echo "Key workflow to verify:"
echo "- Generate (draft) → Approve (approved) → Send (sent)"
echo "- Multi-level approval for high-value proposals"
echo "- Auto-approval for below-threshold proposals"
echo "- Rejection workflow"
echo ""
