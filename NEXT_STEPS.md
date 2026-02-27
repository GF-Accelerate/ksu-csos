# KSU CSOS - Next Steps Guide

## Quick Start for Continuing Implementation

This guide provides a roadmap for continuing the implementation from where we left off.

---

## ✅ What's Been Completed (Tasks 1-3)

1. **Project Structure** - Complete directory layout, git initialized
2. **Database Migrations** - Performance indexes (0004) and seed data (0005)
3. **Shared Utilities** - CORS, Supabase client, YAML loader, audit logging

**Git Commit**: `807ff66`

---

## 🎯 Next Immediate Steps (Tasks 4-10)

### Priority 1: Core Edge Functions (Backend Logic)

These Edge Functions form the backbone of the Revenue Intelligence Engine:

#### 1. Role Management (Task 4)
```bash
cd supabase/functions
mkdir role_assign role_list
# Create index.ts in each directory
```

**Key Functions**:
- `role_assign`: Assign/remove roles (admin-only)
- `role_list`: Get user roles

**Example Structure**:
```typescript
// supabase/functions/role_assign/index.ts
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole } from '../_shared/supabase.ts'
import { logRoleChange } from '../_shared/audit.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest()

  try {
    // Require admin role
    const { userId, supabase } = await requireAuth(req)
    await requireRole(supabase, userId, ['admin', 'executive'])

    // Your logic here
    const { targetUserId, role, action } = await req.json()

    // ... implementation ...

    return successResponse({ message: 'Role updated' })
  } catch (error) {
    return errorResponse(error.message, 400)
  }
})
```

---

#### 2. Identity Resolution (Task 5)
```bash
cd supabase/functions
mkdir identity_resolve
```

**Algorithm**:
1. Try exact email match (case-insensitive)
2. Try exact phone match (normalized)
3. Try fuzzy name + zip match
4. If no match, create new constituent
5. Link to household (create or find)

**Performance**: Use indexes created in 0004_indexes.sql

---

#### 3. CSV Ingestion (Task 6)
```bash
cd supabase/functions
mkdir ingest_paciolan ingest_raisers_edge
```

**CSV Columns**:
- **Paciolan**: email, first_name, last_name, phone, zip, account_id, lifetime_spend, sport_affinity
- **Raiser's Edge**: email, first_name, last_name, phone, zip, donor_id, lifetime_giving, capacity_rating

**Flow**:
1. Parse CSV (use Deno CSV parser)
2. For each row:
   - Call `identity_resolve` function
   - Upsert to `constituent_master`
   - Create/update opportunity
3. Log to `audit_log`

---

#### 4. Scoring Engine (Task 7)
```bash
cd supabase/functions
mkdir scoring_run
```

**Scoring Logic**:
```typescript
// Renewal risk calculation
function calculateRenewalRisk(lastTouch: Date): 'low' | 'medium' | 'high' {
  const daysSinceTouch = (Date.now() - lastTouch.getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceTouch > 180) return 'high'
  if (daysSinceTouch > 90) return 'medium'
  return 'low'
}

// Ask readiness calculation
function calculateAskReadiness(
  hasActiveOpp: boolean,
  lastTouch: Date
): 'ready' | 'not_ready' {
  const daysSinceTouch = (Date.now() - lastTouch.getTime()) / (1000 * 60 * 60 * 24)
  return hasActiveOpp && daysSinceTouch < 30 ? 'ready' : 'not_ready'
}

// Ticket propensity (0-100 scale)
function calculateTicketPropensity(lifetimeSpend: number): number {
  return Math.min(100, Math.floor(lifetimeSpend / 500))
}
```

**Performance**:
- Batch process constituents (100 at a time)
- Use prepared statements for upserts
- Refresh materialized view after completion

---

#### 5. Routing Engine (Task 8)
```bash
cd supabase/functions
mkdir routing_engine
```

**YAML Rule Evaluation**:
```typescript
import { loadRoutingRules, loadCollisionRules } from '../_shared/yaml-loader.ts'

// Evaluate routing rules
const rules = await loadRoutingRules(supabase)
const matchedRule = rules
  .sort((a, b) => b.priority - a.priority)
  .find(rule => evaluateCondition(rule.when, opportunity))

// Check for collisions
const collisions = await checkCollisions(supabase, constituentId, opportunityType)
```

**Collision Detection**:
```sql
SELECT * FROM opportunity
WHERE constituent_id = $1
  AND type = 'major_gift'
  AND status = 'active'
  AND updated_at > NOW() - INTERVAL '14 days'
```

---

#### 6. Proposal Generation (Task 9)
```bash
cd supabase/functions
mkdir proposal_approve proposal_send
# Modify existing proposal_generate
```

**LLM Integration**:
```typescript
// In proposal_generate/index.ts
import OpenAI from 'https://esm.sh/openai@4'

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')
})

const prompt = `Generate a major gift proposal for:
Name: ${constituent.first_name} ${constituent.last_name}
Lifetime Giving: $${constituent.lifetime_giving}
Ask Amount: $${opportunity.amount}
Sport Affinity: ${constituent.sport_affinity}
...`

const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
})

const proposalContent = completion.choices[0].message.content
```

**Approval Workflow**:
```typescript
// In proposal_approve/index.ts
const thresholds = await loadApprovalThresholds(supabase)
const threshold = thresholds.find(t => t.opportunity_type === opportunityType)

if (amount > threshold.amount_threshold) {
  // Require approval from specific roles
  await requireRole(supabase, userId, threshold.required_approver_roles)
}
```

---

#### 7. Dashboard & Work Queue (Task 10)
```bash
cd supabase/functions
mkdir dashboard_data work_queue
```

**Dashboard Queries**:
```sql
-- Pipeline metrics
SELECT type, status, COUNT(*), SUM(amount)
FROM mv_exec_pipeline
GROUP BY type, status

-- Renewals at risk (top 20)
SELECT c.*, s.renewal_risk
FROM constituent_master c
JOIN scores s ON c.id = s.constituent_id
WHERE s.renewal_risk = 'high'
ORDER BY c.lifetime_ticket_spend DESC
LIMIT 20

-- Ask-ready prospects (top 20)
SELECT c.*, s.ask_readiness
FROM constituent_master c
JOIN scores s ON c.id = s.constituent_id
WHERE s.ask_readiness = 'ready'
ORDER BY c.lifetime_giving DESC
LIMIT 20
```

**Work Queue**:
```sql
SELECT * FROM task_work_item
WHERE (assigned_user_id = $1 OR assigned_role = $2)
  AND status = 'pending'
ORDER BY priority DESC, due_at ASC
```

---

## 🎨 Frontend Setup (Tasks 11-20)

### Priority 2: React Application Foundation

#### 1. Initialize React App (Task 11)
```bash
cd apps/web
npm init vite@latest . -- --template react-ts
npm install @supabase/supabase-js react-router-dom
```

**Key Files**:
- `package.json` - Dependencies
- `vite.config.ts` - Vite configuration
- `tsconfig.json` - TypeScript config
- `src/main.tsx` - Entry point
- `src/App.tsx` - Root component

---

#### 2. TypeScript Types (Task 12)
```typescript
// apps/web/src/types.ts
export type AppRole = 'executive' | 'major_gifts' | 'ticketing' | 'corporate' | 'marketing' | 'revenue_ops' | 'admin'

export interface Constituent {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  zip: string
  household_id: string | null
  is_ticket_holder: boolean
  is_donor: boolean
  is_corporate: boolean
  lifetime_ticket_spend: number
  lifetime_giving: number
  sport_affinity: string | null
  primary_owner_role: string | null
  primary_owner_user_id: string | null
  created_at: string
  updated_at: string
}

// ... more types ...
```

---

#### 3. Service Layer (Task 12)
```typescript
// apps/web/src/services/constituentService.ts
import { supabase } from '../lib/supabase'
import type { Constituent } from '../types'

export const constituentService = {
  async getAll(): Promise<Constituent[]> {
    const { data, error } = await supabase
      .from('constituent_master')
      .select('*')

    if (error) throw error
    return data
  },

  async getById(id: string): Promise<Constituent> {
    const { data, error } = await supabase
      .from('constituent_master')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // ... more methods ...
}
```

---

## 📋 Prerequisites Before Starting

### 1. Copy Existing Migrations
You mentioned migrations 0001, 0002, 0003 already exist. Make sure to copy them:
```bash
# Copy from scaffold location to ksu-csos/supabase/migrations/
cp <scaffold-path>/0001_init.sql ./supabase/migrations/
cp <scaffold-path>/0002_rls_enterprise.sql ./supabase/migrations/
cp <scaffold-path>/0003_scores_and_views.sql ./supabase/migrations/
```

---

### 2. Create YAML Rule Files
```bash
cd packages/rules

# Create routing_rules.yaml
cat > routing_rules.yaml <<'EOF'
- name: "High-value major gift"
  priority: 100
  when:
    opportunity_type: "major_gift"
    amount_min: 50000
  then:
    assign_to_role: "major_gifts"
    create_task: true
    task_priority: "high"

- name: "Standard major gift"
  priority: 90
  when:
    opportunity_type: "major_gift"
  then:
    assign_to_role: "major_gifts"
    create_task: true
    task_priority: "medium"

- name: "Ticket renewal"
  priority: 80
  when:
    opportunity_type: "ticket"
  then:
    assign_to_role: "ticketing"
    create_task: true
    task_priority: "medium"

- name: "Corporate partnership"
  priority: 85
  when:
    opportunity_type: "corporate"
  then:
    assign_to_role: "corporate"
    create_task: true
    task_priority: "high"
EOF

# Create collision_rules.yaml
cat > collision_rules.yaml <<'EOF'
- name: "Major gift blocks ticketing"
  priority: 100
  when:
    active_opportunity_type: "major_gift"
    incoming_opportunity_type: "ticket"
  then:
    action: "block"
    window_days: 14
    message: "Major gift active - ticketing touch blocked for 14 days"

- name: "Corporate blocks ticketing"
  priority: 90
  when:
    active_opportunity_type: "corporate"
    incoming_opportunity_type: "ticket"
  then:
    action: "warn"
    window_days: 14
    message: "Corporate partnership active - coordinate with corporate team"
EOF

# Create approval_thresholds.yaml
cat > approval_thresholds.yaml <<'EOF'
- opportunity_type: "major_gift"
  amount_threshold: 25000
  required_approver_roles:
    - "executive"
  auto_approve_below: true

- opportunity_type: "corporate"
  amount_threshold: 50000
  required_approver_roles:
    - "executive"
  auto_approve_below: false

- opportunity_type: "ticket"
  amount_threshold: 100000
  required_approver_roles:
    - "executive"
    - "ticketing"
  auto_approve_below: true
EOF
```

---

### 3. Set Up Local Supabase
```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase (requires Docker)
cd ksu-csos
supabase start

# Apply migrations
supabase db reset

# Get local credentials
supabase status
# Copy SUPABASE_URL and SUPABASE_ANON_KEY to .env
```

---

### 4. Environment Variables
```bash
# Create .env from template
cp .env.example .env

# Edit .env with your values:
# - VITE_SUPABASE_URL (from supabase status)
# - VITE_SUPABASE_ANON_KEY (from supabase status)
# - SUPABASE_SERVICE_ROLE_KEY (from supabase status)
# - OPENAI_API_KEY (your OpenAI key)
```

---

## 🧪 Testing Strategy

### Unit Tests (Edge Functions)
```bash
# Test a specific function
cd supabase/functions/scoring_run
deno test --allow-all

# Test all functions
cd supabase/functions
find . -name "test.ts" -exec deno test --allow-all {} \;
```

### Integration Tests
```typescript
// Test routing engine with collision detection
const result = await routingEngine({
  opportunityId: 'o1',
  constituentId: 'c1',
  type: 'ticket'
})

// Should be blocked if major_gift is active
assert(result.blocked === true)
assert(result.reason === 'major_gift_active')
```

### E2E Tests (Proposal Workflow)
```typescript
// 1. Generate proposal
const proposal = await generateProposal({ opportunityId: 'o1' })
assert(proposal.status === 'draft')

// 2. Approve proposal
const approved = await approveProposal({ proposalId: proposal.id })
assert(approved.status === 'approved')

// 3. Send proposal
const sent = await sendProposal({ proposalId: proposal.id })
assert(sent.status === 'sent')
assert(sent.sent_at !== null)
```

---

## 📊 Definition of Done (Sprint 1-2)

Before moving to Sprint 3-4, verify:

- [ ] All 10 Edge Functions deployed and tested
- [ ] Role management working (assign/remove roles)
- [ ] CSV ingestion tested with sample data (Paciolan + Raiser's Edge)
- [ ] Scoring engine runs successfully (1000+ constituents in < 30s)
- [ ] Routing engine applies YAML rules correctly
- [ ] Collision detection prevents overlapping touches
- [ ] Proposal workflow complete (generate → approve → send)
- [ ] Work queues populate for each role
- [ ] Dashboard queries return correct metrics
- [ ] All migrations applied successfully
- [ ] Audit logging captures all operations
- [ ] RLS policies tested with multiple user roles
- [ ] Local Supabase running and accessible
- [ ] Git commits with clear messages

---

## 💡 Development Tips

### Debugging Edge Functions
```bash
# View logs in real-time
supabase functions logs --tail

# Test function locally
supabase functions serve scoring_run

# Deploy single function
supabase functions deploy scoring_run
```

### Database Queries
```bash
# Connect to local database
supabase db start
psql postgresql://postgres:postgres@localhost:54322/postgres

# Check RLS policies
\d+ constituent_master
```

### Frontend Development
```bash
cd apps/web
npm run dev
# Visit http://localhost:5173
```

---

## 📞 Need Help?

- **Supabase Docs**: https://supabase.com/docs
- **Deno Docs**: https://deno.land/manual
- **React Router**: https://reactrouter.com/
- **OpenAI API**: https://platform.openai.com/docs

---

**Next Task to Start**: Task #4 - Implement role management Edge Functions

**Estimated Time**:
- Tasks 4-10 (Backend): ~2-3 weeks
- Tasks 11-20 (Frontend): ~3-4 weeks
- Tasks 21-23 (CI/CD, Docs, Tests): ~1-2 weeks

**Total Sprint 1-6**: ~6-9 weeks (target: 90 days with buffer)

Good luck! 🚀
