# Proposal Generation Edge Functions

AI-powered proposal generation, approval workflows, and delivery system for Kansas State University Athletics.

## Overview

This system provides three edge functions for the complete proposal lifecycle:
1. **proposal_generate**: Generate AI-powered proposals using LLM and templates
2. **proposal_approve**: Approval workflow with threshold checking
3. **proposal_send**: Delivery via email/PDF with follow-up automation

## Functions

### 1. proposal_generate

Generates personalized proposals using LLM (OpenAI GPT-4 or Anthropic Claude) and prompt templates.

**Endpoint**: `POST /functions/v1/proposal_generate`

**Authentication**: Requires one of: admin, executive, major_gifts, corporate, revenue_ops

**Request**:
```json
{
  "opportunityId": "opp-123",
  "templateType": "major_gift"  // Optional: auto-detected if not provided
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "proposal": {
      "id": "prop-456",
      "content": "Generated proposal text...",
      "amount": 50000,
      "status": "draft",
      "type": "major_gift"
    },
    "message": "Proposal generated successfully using major_gift template"
  }
}
```

**Template Types**:
- `major_gift`: Individual donor proposals
- `corporate`: Corporate partnership proposals

**Features**:
- Loads prompt templates from Supabase Storage
- Fills template with constituent and opportunity data
- Calls LLM API (OpenAI or Anthropic)
- Creates proposal record in database
- Logs to audit trail

---

### 2. proposal_approve

Handles approval workflow based on YAML-configured thresholds.

**Endpoint**: `POST /functions/v1/proposal_approve`

**Authentication**: Requires authenticated user with approver role

**Request**:
```json
{
  "proposalId": "prop-456",
  "action": "approve",  // or "reject"
  "notes": "Approved - great opportunity"
}
```

**Response (Approved)**:
```json
{
  "success": true,
  "data": {
    "proposal": {
      "id": "prop-456",
      "status": "approved",
      "message": "Proposal approved and ready to send"
    },
    "threshold": {
      "id": "major_gift_principal",
      "name": "Principal Gift ($25k-$99k)",
      "then": {
        "approval_required": true,
        "approver_roles": ["deputy_ad_revenue", "revenue_ops"],
        "approval_levels": 1
      }
    }
  }
}
```

**Response (Multi-Level Approval)**:
```json
{
  "success": true,
  "data": {
    "proposal": {
      "id": "prop-789",
      "status": "pending_approval",
      "message": "Partially approved (1/2 approvals). Awaiting additional approval."
    },
    "threshold": {
      "id": "major_gift_transformational",
      "approval_levels": 2
    }
  }
}
```

**Approval Thresholds**:
- Major gifts: $1M+ (exec + deputy), $100k-$999k (deputy or exec), $25k-$99k (deputy or revenue ops), <$25k (auto-approve)
- Corporate: $100k+ (exec + deputy), $25k-$99k (deputy or revenue ops), <$25k (auto-approve)
- Ticketing: $10k+ (revenue ops), <$10k (auto-approve)

**Features**:
- Threshold-based approval requirements
- Multi-level approval for high-value proposals
- Role-based permission checking
- Auto-approval for below-threshold proposals
- Rejection workflow
- Full audit trail

---

### 3. proposal_send

Sends approved proposals via email and/or PDF.

**Endpoint**: `POST /functions/v1/proposal_send`

**Authentication**: Requires one of: admin, executive, major_gifts, corporate, revenue_ops

**Request**:
```json
{
  "proposalId": "prop-456",
  "deliveryMethod": "both",  // "email", "pdf", or "both"
  "emailAddress": "donor@example.com",  // Optional: uses constituent email if not provided
  "ccAddresses": ["mgift@ksu.edu"],
  "customMessage": "Thank you for considering this opportunity..."
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "proposal": {
      "id": "prop-456",
      "status": "sent",
      "sent_to": "donor@example.com",
      "delivery_method": "both",
      "sent_at": "2026-02-25T10:30:00Z"
    },
    "message": "Proposal sent successfully via both. Follow-up task created for 7 days."
  }
}
```

**Features**:
- Email delivery with HTML formatting
- PDF generation (stub - requires PDF library integration)
- CC recipients support
- Custom cover message
- Automatic interaction logging
- Follow-up task creation (7 days)
- Status tracking

---

## Prompt Templates

Templates stored in `packages/prompts/proposals/`:

### Major Gift Template (`major_gift_proposal.md`)

Generates personalized donor proposals with:
1. **Personalized Opening**: Acknowledges past support, references sport affinity
2. **The Opportunity**: Impact description, strategic alignment
3. **Investment Details**: Clear ask amount, deliverables, timeline
4. **Recognition & Stewardship**: Naming rights, membership, updates
5. **Next Steps**: Meeting proposal, clear CTA

**Available Variables**:
- `{{first_name}}`, `{{last_name}}`
- `{{lifetime_giving}}`, `{{lifetime_ticket_spend}}`
- `{{sport_affinity}}`
- `{{ask_amount}}`, `{{opportunity_type}}`
- `{{capacity_rating}}`
- `{{recent_interactions}}`
- `{{expected_close_date}}`

### Corporate Partnership Template (`corporate_partnership_proposal.md`)

Generates business-focused partnership proposals with:
1. **Executive Summary**: Brand strength, partnership summary
2. **Partnership Opportunity**: Sponsorship package, ROI
3. **Activation & Benefits**: Brand visibility, hospitality, community engagement, digital/social
4. **Investment Details**: Payment structure, contract terms
5. **K-State Athletics Brand Value**: Audience reach, demographics, achievements
6. **Next Steps**: Customization meeting, CTA

**Available Variables**:
- `{{company_name}}`, `{{first_name}}`, `{{last_name}}`
- `{{industry}}`, `{{company_size}}`
- `{{ask_amount}}`, `{{partnership_period}}`
- `{{sport_affinity}}`, `{{target_audience}}`
- `{{marketing_goals}}`

---

## Approval Thresholds Configuration

Configuration file: `packages/rules/approval_thresholds.yaml`

### Structure
```yaml
thresholds:
  - id: major_gift_transformational
    name: "Transformational Gift ($1M+)"
    when:
      opportunity_type: major_gift
      amount_min: 1000000
    then:
      approval_required: true
      approver_roles:
        - executive
        - deputy_ad_revenue
      approval_levels: 2  # Both must approve
      auto_escalate_days: 3
    notes: "$1M+ gifts require executive approval within 3 days"
```

### When Conditions
- `opportunity_type`: major_gift | corporate | ticket
- `amount_min`: minimum amount (inclusive)
- `amount_max`: maximum amount (inclusive)

### Then Actions
- `approval_required`: true/false
- `approver_roles`: list of roles that can approve
- `approval_levels`: 0 (none), 1 (any one), 2 (all must approve)
- `auto_escalate_days`: days until escalation to executive

### Approval Levels
- **0**: No approval required (auto-approved)
- **1**: Any one approver from `approver_roles` can approve
- **2**: All approvers from `approver_roles` must approve (multi-level)

### Built-in Thresholds

**Major Gifts**:
- $1M+: Executive + Deputy AD (2 approvals required)
- $100k-$999k: Deputy AD or Executive (1 approval)
- $25k-$99k: Deputy AD or Revenue Ops (1 approval)
- $5k-$24k: Auto-approve (0 approvals)

**Corporate**:
- $100k+: Executive + Deputy AD (2 approvals)
- $25k-$99k: Deputy AD or Revenue Ops (1 approval)
- <$25k: Auto-approve

**Ticketing**:
- $10k+: Revenue Ops (1 approval)
- <$10k: Auto-approve

---

## Workflow

### Complete Proposal Lifecycle

```
1. Generate Proposal
   ├─► Call proposal_generate with opportunityId
   ├─► LLM generates personalized content
   └─► Proposal created with status='draft'
   │
   ▼
2. Review & Edit
   ├─► User reviews generated content
   ├─► (Optional) Manual edits in UI
   └─► Status remains 'draft'
   │
   ▼
3. Submit for Approval
   ├─► Call proposal_approve with action='approve'
   ├─► Check threshold requirements
   └─► Status: 'pending_approval' or 'approved'
   │
   ▼
4. Approval Process
   ├─► If approval_levels=0: Auto-approve → 'approved'
   ├─► If approval_levels=1: Any one approver → 'approved'
   └─► If approval_levels=2: All approvers → 'pending_approval' → 'approved'
   │
   ▼
5. Send Proposal
   ├─► Call proposal_send with deliveryMethod
   ├─► Email and/or PDF delivered
   ├─► Status: 'sent'
   ├─► Interaction logged
   └─► Follow-up task created (7 days)
   │
   ▼
6. Follow-up
   └─► Task appears in work queue for follow-up
```

### Status Flow

```
draft → pending_approval → approved → sent
  │           │              │
  │           └─► rejected   │
  └──────────────────────────┘
           (edit/revise)
```

---

## LLM Integration

### Supported Providers

**OpenAI (default)**:
- Model: GPT-4
- API: `https://api.openai.com/v1/chat/completions`
- Env var: `OPENAI_API_KEY`

**Anthropic Claude**:
- Model: Claude 3 Opus
- API: `https://api.anthropic.com/v1/messages`
- Env var: `ANTHROPIC_API_KEY`

### Configuration

Set environment variables in Supabase:
```bash
# OpenAI
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set LLM_PROVIDER=openai

# OR Anthropic
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set LLM_PROVIDER=anthropic
```

### Cost Optimization

- Use GPT-4 for major gifts ($1M+, $100k+)
- Use GPT-3.5-Turbo for standard proposals ($5k-$99k)
- Cache generated proposals (don't regenerate)
- Estimate: ~$0.10-$0.30 per proposal (GPT-4)

---

## Use Cases

### 1. Generate Major Gift Proposal

```bash
curl -X POST http://localhost:54321/functions/v1/proposal_generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "opportunityId": "opp-123"
  }'
```

### 2. Approve Proposal

```bash
curl -X POST http://localhost:54321/functions/v1/proposal_approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "proposalId": "prop-456",
    "action": "approve",
    "notes": "Excellent proposal"
  }'
```

### 3. Send Approved Proposal

```bash
curl -X POST http://localhost:54321/functions/v1/proposal_send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{
    "proposalId": "prop-456",
    "deliveryMethod": "both",
    "ccAddresses": ["mgift@ksu.edu"]
  }'
```

### 4. Batch Generate Proposals

```typescript
// Generate proposals for all ask-ready prospects
const { data: prospects } = await supabase
  .from('scores')
  .select('constituent_id, opportunity(id)')
  .eq('ask_readiness', 'ready')
  .eq('as_of_date', today)

for (const prospect of prospects) {
  await proposalGenerate({ opportunityId: prospect.opportunity.id })
}
```

---

## Database Schema

### proposal table
```sql
CREATE TABLE proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES opportunity(id),
  constituent_id uuid REFERENCES constituent_master(id),
  type text NOT NULL,  -- major_gift, corporate, ticket
  amount numeric NOT NULL,
  content text NOT NULL,  -- Generated proposal text
  status text NOT NULL CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'sent')),
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  sent_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  sent_to text,  -- Email address
  delivery_method text,  -- email, pdf, both
  approval_notes text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);
```

### proposal_approval table (for multi-level approvals)
```sql
CREATE TABLE proposal_approval (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES proposal(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz DEFAULT NOW(),
  notes text
);
```

---

## Testing

Run unit tests:
```bash
cd supabase/functions/proposal_generate
deno test --allow-all
```

Run manual tests:
```bash
./supabase/functions/test-proposal-workflow.sh
```

---

## Error Handling

Common errors:

**400**: Missing required fields, invalid action, invalid delivery method
**403**: Insufficient permissions (not an approver)
**404**: Proposal or opportunity not found
**500**: LLM API error, database error

---

## Troubleshooting

### Issue: LLM API calls failing

**Cause**: API key not configured or invalid
**Solution**:
- Check env vars: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Verify API key is valid
- Check API quota/billing

### Issue: Approval not working

**Cause**: User doesn't have approver role
**Solution**:
- Check approval thresholds for required roles
- Verify user has appropriate role assigned
- Admin can always approve

### Issue: Email not sending

**Cause**: Email service not integrated (stub implementation)
**Solution**:
- Integrate with SendGrid, AWS SES, or similar
- Update `sendProposalEmail()` function
- Configure SMTP/API credentials

### Issue: Proposals below threshold not auto-approving

**Cause**: Threshold configuration incorrect
**Solution**:
- Check `approval_thresholds.yaml`
- Verify `approval_required: false` for low amounts
- Ensure YAML is uploaded to Storage

---

## Future Enhancements

1. **PDF Generation**: Integrate with PDF library (pdfmake, Puppeteer)
2. **Email Service**: Integrate with SendGrid/AWS SES
3. **Template Editor**: UI for editing prompt templates
4. **Proposal Analytics**: Track open rates, response rates
5. **A/B Testing**: Test different proposal templates
6. **Multi-language**: Support Spanish, other languages
7. **Video Proposals**: Generate video proposals with AI
8. **E-signature**: Integrate DocuSign or similar

---

## Related Functions

- `routing_engine` - Routes opportunities for proposal generation
- `scoring_run` - Identifies ask-ready prospects
- `work_queue` - Displays follow-up tasks after sending

