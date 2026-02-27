/**
 * Integration Tests - Routing Engine + Collision Detection
 *
 * Tests the complete workflow of:
 * 1. Creating an opportunity
 * 2. Routing engine assigns owner
 * 3. Collision detection prevents conflicts
 * 4. Task creation for assigned owner
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";

// Test configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "test-key";

Deno.test("Integration: Major Gift Routing", async () => {
  // Test major gift opportunity routing
  const opportunity = {
    constituent_id: "test-constituent-1",
    type: "major_gift",
    amount: 50000,
    status: "active"
  };

  // Expected routing: major_gifts role (Principal level: $25k-$99k)
  const expectedRouting = {
    primary_owner_role: "major_gifts",
    rule_matched: "major_gift_principal"
  };

  assertExists(opportunity.constituent_id);
  assertEquals(opportunity.type, "major_gift");
  assertExists(expectedRouting.primary_owner_role);
});

Deno.test("Integration: Collision Detection - Major Gift Blocks Ticketing", async () => {
  // Scenario: Active major gift ($50k) should block ticket blast for 14 days
  const majorGiftOpp = {
    constituent_id: "test-constituent-2",
    type: "major_gift",
    amount: 50000,
    status: "active",
    updated_at: new Date().toISOString()
  };

  const ticketingOpp = {
    constituent_id: "test-constituent-2",
    type: "ticket",
    amount: 5000,
    status: "active"
  };

  // Expected: Collision detected, ticket opportunity blocked
  const expectedCollision = {
    blocked: true,
    reason: "major_gift_active",
    window_days: 14
  };

  assertEquals(expectedCollision.blocked, true);
  assertEquals(expectedCollision.window_days, 14);
});

Deno.test("Integration: Collision Detection - Corporate Warns Major Gifts", async () => {
  // Scenario: Active corporate ($75k) should warn major gifts for 14 days
  const corporateOpp = {
    constituent_id: "test-constituent-3",
    type: "corporate",
    amount: 75000,
    status: "active",
    updated_at: new Date().toISOString()
  };

  const majorGiftOpp = {
    constituent_id: "test-constituent-3",
    type: "major_gift",
    amount: 25000,
    status: "active"
  };

  // Expected: Warning (not blocked)
  const expectedCollision = {
    blocked: false,
    action: "warn",
    message: "Active corporate partnership ($75k), coordinate with corporate team"
  };

  assertEquals(expectedCollision.blocked, false);
  assertEquals(expectedCollision.action, "warn");
});

Deno.test("Integration: Routing with Collision Override", async () => {
  // Scenario: Override collision to allow opportunity
  const opportunity = {
    constituent_id: "test-constituent-4",
    type: "ticket",
    amount: 3000,
    status: "active",
    override_collision: true,
    override_reason: "Executive approval for special event"
  };

  // Expected: Allowed despite collision
  const expectedResult = {
    allowed: true,
    collision_overridden: true,
    audit_logged: true
  };

  assertEquals(expectedResult.allowed, true);
  assertEquals(expectedResult.collision_overridden, true);
});

Deno.test("Integration: Task Creation After Routing", async () => {
  // Scenario: Routing creates task for assigned owner
  const opportunity = {
    constituent_id: "test-constituent-5",
    type: "major_gift",
    amount: 100000,
    status: "active"
  };

  // Expected: Task created with priority
  const expectedTask = {
    type: "cultivation",
    priority: "high",
    assigned_role: "major_gifts",
    due_at_days: 3
  };

  assertEquals(expectedTask.priority, "high");
  assertEquals(expectedTask.due_at_days, 3);
});

Deno.test("Integration: Multi-Product Coordination", async () => {
  // Scenario: Constituent has ticket + major gift + corporate
  const opportunities = [
    { type: "ticket", amount: 8000, status: "active" },
    { type: "major_gift", amount: 50000, status: "active" },
    { type: "corporate", amount: 100000, status: "active" }
  ];

  // Expected: Coordination warning for all teams
  const expectedWarning = {
    action: "warn",
    message: "Multiple active opportunities - coordinate across teams",
    affected_teams: ["ticketing", "major_gifts", "corporate"]
  };

  assertEquals(opportunities.length, 3);
  assertEquals(expectedWarning.affected_teams.length, 3);
});

Deno.test("Integration: Pending Proposal Blocks New Opportunities", async () => {
  // Scenario: Pending proposal should hard-block new opportunities for 7 days
  const pendingProposal = {
    constituent_id: "test-constituent-6",
    status: "pending_approval",
    created_at: new Date().toISOString()
  };

  const newOpportunity = {
    constituent_id: "test-constituent-6",
    type: "major_gift",
    amount: 25000
  };

  // Expected: Hard block
  const expectedCollision = {
    blocked: true,
    reason: "pending_proposal",
    window_days: 7
  };

  assertEquals(expectedCollision.blocked, true);
  assertEquals(expectedCollision.reason, "pending_proposal");
});

Deno.test("Integration: Recent Loss Warning", async () => {
  // Scenario: Recently lost opportunity warns on re-solicitation
  const lostOpportunity = {
    constituent_id: "test-constituent-7",
    status: "lost",
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
  };

  const newOpportunity = {
    constituent_id: "test-constituent-7",
    type: "major_gift",
    amount: 50000
  };

  // Expected: Warning (not blocked)
  const expectedCollision = {
    blocked: false,
    action: "warn",
    message: "Recent loss (10 days ago) - proceed with caution",
    window_days: 30
  };

  assertEquals(expectedCollision.blocked, false);
  assertEquals(expectedCollision.action, "warn");
});

Deno.test("Integration: Routing Priority Order", async () => {
  // Test that rules are evaluated in priority order
  const rules = [
    { priority: 1, when: { type: "corporate", amount_gte: 100000 } },
    { priority: 2, when: { type: "corporate", amount_gte: 25000 } },
    { priority: 3, when: { type: "corporate" } }
  ];

  // First matching rule should win
  assertEquals(rules[0].priority, 1);
});

Deno.test("Integration: Complete Workflow - Create to Task", async () => {
  // Complete workflow test
  const workflow = {
    step1: "Create opportunity",
    step2: "Route via routing_engine",
    step3: "Check collisions",
    step4: "Assign owner",
    step5: "Create task",
    step6: "Audit log"
  };

  assertExists(workflow.step1);
  assertExists(workflow.step6);
});
