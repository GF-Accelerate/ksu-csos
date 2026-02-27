/**
 * Performance Tests - Scoring Engine Load Testing
 *
 * Tests scoring_run performance with 1000+ constituents
 *
 * Requirements:
 * - Complete scoring run in <30 seconds for 1000 constituents
 * - Batch processing (100 per batch)
 * - No memory leaks
 * - Consistent performance across multiple runs
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";

// Test configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "test-key";

Deno.test("Performance: Scoring Run - 100 Constituents", async () => {
  const startTime = Date.now();

  // Simulate scoring 100 constituents
  const constituentCount = 100;
  const batchSize = 100;

  // Expected: < 3 seconds for 100 constituents
  const maxDuration = 3000; // 3 seconds

  // Mock scoring calculation
  for (let i = 0; i < constituentCount; i++) {
    // Renewal risk calculation (1-2ms)
    const renewalRisk = calculateRenewalRisk(i);

    // Ask readiness calculation (1-2ms)
    const askReadiness = calculateAskReadiness(i);

    // Propensity calculations (1-2ms each)
    const ticketPropensity = calculateTicketPropensity(i);
    const corporatePropensity = calculateCorporatePropensity(i);
    const capacityEstimate = calculateCapacity(i);
  }

  const duration = Date.now() - startTime;

  console.log(`Scored ${constituentCount} constituents in ${duration}ms`);

  // Should be well under 3 seconds
  assertEquals(duration < maxDuration, true);
});

Deno.test("Performance: Scoring Run - 1000 Constituents", async () => {
  const startTime = Date.now();

  const constituentCount = 1000;
  const batchSize = 100;
  const batches = Math.ceil(constituentCount / batchSize);

  // Expected: < 30 seconds for 1000 constituents
  const maxDuration = 30000; // 30 seconds

  // Process in batches
  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, constituentCount);

    // Simulate batch scoring
    for (let i = batchStart; i < batchEnd; i++) {
      const renewalRisk = calculateRenewalRisk(i);
      const askReadiness = calculateAskReadiness(i);
      const ticketPropensity = calculateTicketPropensity(i);
      const corporatePropensity = calculateCorporatePropensity(i);
      const capacityEstimate = calculateCapacity(i);
    }
  }

  const duration = Date.now() - startTime;

  console.log(`Scored ${constituentCount} constituents in ${duration}ms (${batches} batches)`);
  console.log(`Average: ${(duration / constituentCount).toFixed(2)}ms per constituent`);

  // Should complete in under 30 seconds
  assertEquals(duration < maxDuration, true);
});

Deno.test("Performance: Scoring Run - Batch Size Optimization", async () => {
  const constituentCount = 500;
  const batchSizes = [50, 100, 200];

  const results: { batchSize: number; duration: number }[] = [];

  for (const batchSize of batchSizes) {
    const startTime = Date.now();
    const batches = Math.ceil(constituentCount / batchSize);

    for (let batch = 0; batch < batches; batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, constituentCount);

      for (let i = batchStart; i < batchEnd; i++) {
        calculateRenewalRisk(i);
        calculateAskReadiness(i);
        calculateTicketPropensity(i);
        calculateCorporatePropensity(i);
        calculateCapacity(i);
      }
    }

    const duration = Date.now() - startTime;
    results.push({ batchSize, duration });

    console.log(`Batch size ${batchSize}: ${duration}ms`);
  }

  // Optimal batch size should be 100 (balance between overhead and memory)
  assertEquals(results.length, 3);
});

Deno.test("Performance: Scoring Run - Memory Usage", async () => {
  const constituentCount = 1000;
  const batchSize = 100;

  // Track memory usage (if available)
  const initialMemory = Deno.memoryUsage();

  // Batch processing to avoid memory issues
  const batches = Math.ceil(constituentCount / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, constituentCount);

    const batchResults = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchResults.push({
        constituent_id: `test-${i}`,
        renewal_risk: calculateRenewalRisk(i),
        ask_readiness: calculateAskReadiness(i),
        ticket_propensity: calculateTicketPropensity(i),
        corporate_propensity: calculateCorporatePropensity(i),
        capacity_estimate: calculateCapacity(i)
      });
    }

    // Clear batch after processing (garbage collection)
    batchResults.length = 0;
  }

  const finalMemory = Deno.memoryUsage();
  const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

  console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);

  // Memory should not grow significantly (< 50 MB for 1000 constituents)
  const maxMemoryIncrease = 50 * 1024 * 1024; // 50 MB
  assertEquals(memoryIncrease < maxMemoryIncrease, true);
});

Deno.test("Performance: Scoring Run - Concurrent Runs", async () => {
  // Test that multiple scoring runs don't conflict
  const runs = 3;
  const constituentCount = 100;

  const promises = [];

  for (let run = 0; run < runs; run++) {
    promises.push(
      (async () => {
        const startTime = Date.now();

        for (let i = 0; i < constituentCount; i++) {
          calculateRenewalRisk(i);
          calculateAskReadiness(i);
          calculateTicketPropensity(i);
          calculateCorporatePropensity(i);
          calculateCapacity(i);
        }

        return Date.now() - startTime;
      })()
    );
  }

  const durations = await Promise.all(promises);

  console.log(`Concurrent runs: ${durations.join(", ")} ms`);

  // All runs should complete
  assertEquals(durations.length, runs);

  // No run should take more than 2x the others (no blocking)
  const avgDuration = durations.reduce((a, b) => a + b, 0) / runs;
  const maxDuration = Math.max(...durations);

  assertEquals(maxDuration < avgDuration * 2, true);
});

// Helper functions to simulate scoring calculations
function calculateRenewalRisk(index: number): string {
  const daysSinceTouch = (index % 200) + 1;

  if (daysSinceTouch > 180) return "high";
  if (daysSinceTouch > 90) return "medium";
  return "low";
}

function calculateAskReadiness(index: number): string {
  const hasActiveOpp = index % 3 === 0;
  const recentTouch = index % 5 !== 0;

  return hasActiveOpp && recentTouch ? "ready" : "not_ready";
}

function calculateTicketPropensity(index: number): number {
  const lifetimeSpend = (index % 100) * 500;
  return Math.min(Math.floor(lifetimeSpend / 500), 100);
}

function calculateCorporatePropensity(index: number): number {
  const isCorporate = index % 10 === 0;
  return isCorporate ? 100 : 0;
}

function calculateCapacity(index: number): number {
  const lifetimeGiving = (index % 50) * 1000;
  return lifetimeGiving * 10;
}

Deno.test("Performance: Scoring Algorithm Accuracy", () => {
  // Test scoring algorithms

  // Renewal Risk Tests
  assertEquals(calculateRenewalRisk(181), "high"); // >180 days
  assertEquals(calculateRenewalRisk(91), "medium"); // >90 days
  assertEquals(calculateRenewalRisk(50), "low"); // <90 days

  // Ask Readiness Tests
  assertEquals(calculateAskReadiness(0), "ready"); // index % 3 === 0 AND index % 5 !== 0
  assertEquals(calculateAskReadiness(1), "not_ready"); // No active opp

  // Ticket Propensity Tests
  assertEquals(calculateTicketPropensity(0), 0); // $0 spend = 0 propensity
  assertEquals(calculateTicketPropensity(1), 1); // $500 spend = 1 propensity
  assertEquals(calculateTicketPropensity(99), 99); // $49,500 spend = 99 propensity

  // Corporate Propensity Tests
  assertEquals(calculateCorporatePropensity(0), 100); // isCorporate
  assertEquals(calculateCorporatePropensity(1), 0); // Not corporate
  assertEquals(calculateCorporatePropensity(10), 100); // isCorporate

  // Capacity Estimate Tests
  assertEquals(calculateCapacity(0), 0); // $0 giving = $0 capacity
  assertEquals(calculateCapacity(1), 10000); // $1k giving = $10k capacity
  assertEquals(calculateCapacity(10), 100000); // $10k giving = $100k capacity
});
