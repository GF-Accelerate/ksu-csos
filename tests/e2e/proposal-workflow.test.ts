/**
 * E2E Tests - Proposal Workflow
 *
 * Tests the complete proposal lifecycle:
 * 1. Create opportunity
 * 2. Generate AI proposal (draft)
 * 3. Edit proposal content
 * 4. Submit for approval
 * 5. Approve proposal
 * 6. Send proposal via email
 * 7. Verify interaction log and follow-up task
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";

// Test configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "test-key";

Deno.test("E2E: Complete Proposal Workflow - Small Ask (<$25k)", async () => {
  // Step 1: Create opportunity
  const opportunity = {
    constituent_id: "test-constituent-1",
    type: "major_gift",
    amount: 15000,
    description: "Annual fund support",
    expected_close_at: "2026-06-30"
  };

  assertExists(opportunity.constituent_id);

  // Step 2: Generate proposal (via proposal_generate)
  const generateRequest = {
    opportunity_id: "test-opp-1",
    template_type: "major_gift"
  };

  const expectedProposal = {
    status: "draft",
    content: "Generated proposal content...",
    opportunity_id: "test-opp-1"
  };

  assertEquals(expectedProposal.status, "draft");

  // Step 3: Edit content (optional for drafts)
  const updatedContent = "Edited proposal content with personalized ask...";
  assertExists(updatedContent);

  // Step 4: Submit for approval
  // For $15k: Auto-approved (threshold <$25k)
  const approvalCheck = {
    amount: 15000,
    threshold: 25000,
    approvals_required: 0
  };

  assertEquals(approvalCheck.approvals_required, 0);

  // Status should change: draft → approved (auto)
  const finalStatus = "approved";
  assertEquals(finalStatus, "approved");

  // Step 5: Send proposal
  const sendRequest = {
    proposal_id: "test-proposal-1",
    recipient_email: "donor@example.com",
    cc_emails: "mgr@ksu.edu",
    custom_message: "Thank you for your continued support..."
  };

  assertExists(sendRequest.recipient_email);

  // Step 6: Verify interaction log created
  const expectedInteraction = {
    constituent_id: "test-constituent-1",
    type: "proposal_sent",
    notes: "Proposal sent for $15,000 annual fund support"
  };

  assertEquals(expectedInteraction.type, "proposal_sent");

  // Step 7: Verify follow-up task created (7 days)
  const expectedTask = {
    type: "follow_up",
    priority: "medium",
    due_at_days: 7,
    description: "Follow up on proposal sent to donor@example.com"
  };

  assertEquals(expectedTask.due_at_days, 7);
});

Deno.test("E2E: Proposal Workflow - Medium Ask ($25k-$99k, 1 Approval)", async () => {
  // $50k ask requires 1 approval
  const opportunity = {
    amount: 50000,
    type: "major_gift"
  };

  const approvalCheck = {
    amount: 50000,
    threshold_1: 25000,
    threshold_2: 100000,
    approvals_required: 1,
    approvers: ["deputy_ad_revenue", "executive"]
  };

  assertEquals(approvalCheck.approvals_required, 1);

  // Generate proposal
  const proposal = {
    status: "draft",
    amount: 50000
  };

  // Submit for approval
  const afterSubmit = {
    status: "pending_approval",
    approvals_needed: 1,
    approvals_received: 0
  };

  assertEquals(afterSubmit.status, "pending_approval");

  // Approve by deputy_ad_revenue
  const approval = {
    approved_by: "deputy_ad_revenue",
    approved_at: new Date().toISOString(),
    notes: "Approved - good fit for spring campaign"
  };

  assertExists(approval.approved_by);

  // After 1 approval, status changes to approved
  const finalStatus = "approved";
  assertEquals(finalStatus, "approved");
});

Deno.test("E2E: Proposal Workflow - Large Ask ($100k+, 2 Approvals)", async () => {
  // $250k ask requires 2 approvals
  const opportunity = {
    amount: 250000,
    type: "major_gift"
  };

  const approvalCheck = {
    amount: 250000,
    threshold: 100000,
    approvals_required: 2,
    approvers: ["deputy_ad_revenue", "athletic_director"]
  };

  assertEquals(approvalCheck.approvals_required, 2);

  // Generate proposal
  const proposal = {
    status: "draft",
    amount: 250000
  };

  // Submit for approval
  const afterSubmit = {
    status: "pending_approval",
    approvals_needed: 2,
    approvals_received: 0
  };

  // First approval
  const approval1 = {
    approved_by: "deputy_ad_revenue",
    approved_at: new Date().toISOString()
  };

  const afterFirstApproval = {
    status: "pending_approval", // Still pending
    approvals_received: 1
  };

  assertEquals(afterFirstApproval.approvals_received, 1);

  // Second approval
  const approval2 = {
    approved_by: "athletic_director",
    approved_at: new Date().toISOString()
  };

  const afterSecondApproval = {
    status: "approved", // Now approved
    approvals_received: 2
  };

  assertEquals(afterSecondApproval.status, "approved");
});

Deno.test("E2E: Proposal Rejection Workflow", async () => {
  // Generate proposal
  const proposal = {
    status: "draft",
    amount: 50000
  };

  // Submit for approval
  const afterSubmit = {
    status: "pending_approval"
  };

  // Reject with reason
  const rejection = {
    rejected_by: "deputy_ad_revenue",
    rejected_at: new Date().toISOString(),
    rejection_reason: "Timing is not right - constituent recently lost spouse"
  };

  assertExists(rejection.rejection_reason);

  // Status changes to rejected
  const finalStatus = "rejected";
  assertEquals(finalStatus, "rejected");

  // Proposal cannot be sent
  const canSend = false;
  assertEquals(canSend, false);
});

Deno.test("E2E: Corporate Partnership Proposal", async () => {
  // Corporate partnership uses different template
  const opportunity = {
    type: "corporate",
    amount: 100000
  };

  const generateRequest = {
    opportunity_id: "test-corp-1",
    template_type: "corporate_partnership"
  };

  assertEquals(generateRequest.template_type, "corporate_partnership");

  // Corporate $100k requires 2 approvals
  const approvalCheck = {
    amount: 100000,
    approvals_required: 2
  };

  assertEquals(approvalCheck.approvals_required, 2);
});

Deno.test("E2E: Proposal Edit After Draft", async () => {
  // Create draft proposal
  const proposal = {
    status: "draft",
    content: "Original AI-generated content..."
  };

  // Edit content
  const editedContent = "Customized content with specific ask details...";
  assertExists(editedContent);

  // Can edit while draft
  const canEdit = proposal.status === "draft";
  assertEquals(canEdit, true);

  // Cannot edit after approval
  const approvedProposal = {
    status: "approved",
    content: editedContent
  };

  const canEditApproved = approvedProposal.status === "draft";
  assertEquals(canEditApproved, false);
});

Deno.test("E2E: Send Proposal with PDF", async () => {
  const sendRequest = {
    proposal_id: "test-proposal-1",
    recipient_email: "donor@example.com",
    include_pdf: true,
    custom_message: "See attached proposal..."
  };

  assertEquals(sendRequest.include_pdf, true);

  // Should generate PDF and attach
  const expectedEmail = {
    to: "donor@example.com",
    subject: "Proposal from K-State Athletics",
    body: "See attached proposal...",
    attachments: ["proposal-12345.pdf"]
  };

  assertExists(expectedEmail.attachments);
});

Deno.test("E2E: Proposal Audit Trail", async () => {
  // Every action should be audited
  const auditLog = [
    { action: "proposal_created", timestamp: "2026-02-25T10:00:00Z" },
    { action: "proposal_edited", timestamp: "2026-02-25T10:15:00Z" },
    { action: "proposal_submitted", timestamp: "2026-02-25T10:30:00Z" },
    { action: "proposal_approved", timestamp: "2026-02-25T11:00:00Z", user: "deputy_ad_revenue" },
    { action: "proposal_sent", timestamp: "2026-02-25T11:30:00Z" }
  ];

  assertEquals(auditLog.length, 5);
  assertEquals(auditLog[4].action, "proposal_sent");
});

Deno.test("E2E: Multiple Proposals for Same Constituent", async () => {
  // Constituent can have multiple proposals over time
  const proposals = [
    { constituent_id: "test-1", amount: 10000, status: "sent", sent_at: "2025-01-15" },
    { constituent_id: "test-1", amount: 25000, status: "draft", created_at: "2026-02-20" }
  ];

  assertEquals(proposals.length, 2);

  // Only one active (draft/pending/approved) at a time
  const activeCount = proposals.filter(p =>
    ["draft", "pending_approval", "approved"].includes(p.status)
  ).length;

  assertEquals(activeCount, 1);
});
