# KSU CSOS - System Architecture

## Overview

The KSU College Sports Operating System (CSOS) is a revenue intelligence platform for athletic departments, unifying constituent data across ticketing, major gifts, and corporate partnerships.

**Version**: Phase 1 - Revenue Intelligence Engine
**Tech Stack**: React + TypeScript + Supabase (PostgreSQL + Edge Functions)
**Deployment**: Supabase Cloud + Static hosting (Vercel/Netlify)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   React UI   │  │  Voice Input │  │  Service     │              │
│  │  Components  │  │  (Web Speech)│  │  Layer       │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┴──────────────────┘                       │
│                           │                                           │
│                  Supabase Client (JWT Auth)                           │
│                           │                                           │
└───────────────────────────┼───────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SUPABASE BACKEND                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                    Edge Functions                        │        │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │        │
│  │  │  Routing   │  │  Proposal  │  │  Voice     │        │        │
│  │  │  Engine    │  │  Generator │  │  Command   │        │        │
│  │  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘        │        │
│  │         │                │                │              │        │
│  │  ┌──────┴─────┐  ┌──────┴─────┐  ┌──────┴─────┐        │        │
│  │  │  Scoring   │  │  Ingest    │  │ Dashboard  │        │        │
│  │  │  Engine    │  │  CSV       │  │  Data      │        │        │
│  │  └────────────┘  └────────────┘  └────────────┘        │        │
│  └─────────────────────────────────────────────────────────┘        │
│                            │                                          │
│                            ▼                                          │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                   PostgreSQL Database                    │        │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │        │
│  │  │Constituent │  │Opportunity │  │ Proposal   │        │        │
│  │  │  Master    │  │            │  │            │        │        │
│  │  └────────────┘  └────────────┘  └────────────┘        │        │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │        │
│  │  │   Scores   │  │   Tasks    │  │   Audit    │        │        │
│  │  │            │  │            │  │    Log     │        │        │
│  │  └────────────┘  └────────────┘  └────────────┘        │        │
│  └─────────────────────────────────────────────────────────┘        │
│                            │                                          │
│                            ▼                                          │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │                Row-Level Security (RLS)                  │        │
│  │  - Role-based access control (7 roles)                  │        │
│  │  - Portfolio ownership filtering                        │        │
│  │  - User-scoped queries                                  │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   OpenAI     │  │   Paciolan   │  │  Raiser's    │              │
│  │  (GPT-4o)    │  │  Ticketing   │  │    Edge      │              │
│  │  LLM API     │  │   CSV Data   │  │  Donor Data  │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### 1. Frontend Layer (React + TypeScript)

**Technology**: React 18.2, TypeScript 5.3, Vite 5.1

**Modules**:
- **Executive Dashboard**: Pipeline metrics, renewal risks, ask-ready prospects
- **Major Gifts**: Donor management, opportunity tracking, proposal generation
- **Ticketing**: Season ticket holders, renewal risk management
- **Corporate**: Partnership management, pricing calculator
- **Proposals**: Draft, approve, send workflow
- **Data Import**: CSV upload for Paciolan and Raiser's Edge
- **Voice Console**: AI-powered voice commands
- **Admin**: Role management, user administration

**Key Features**:
- Role-based navigation (7 user roles)
- JWT authentication with session persistence
- Real-time data updates
- Web Speech API integration
- Responsive design

**Shared Components**:
- ConstituentTable, WorkQueue, StatusBadge, MetricCard
- EmptyState, LoadingSpinner, SearchBar, PageHeader

---

### 2. Backend Layer (Supabase)

#### 2.1 PostgreSQL Database

**Core Tables**:
- `constituent_master`: Unified constituent records
- `household`: Household relationships
- `opportunity`: Pipeline tracking (major_gift, ticket, corporate)
- `proposal`: Proposal lifecycle management
- `task_work_item`: Work queue and task management
- `scores`: Constituent scoring (renewal risk, ask readiness, propensity)
- `interaction_log`: Touch tracking
- `audit_log`: Audit trail
- `user_role_assignment`: Role-based access control

**Materialized Views**:
- `mv_exec_pipeline`: Executive dashboard aggregations

**Indexes**:
- Constituent identity resolution (email, phone, name+zip)
- Portfolio ownership (primary_owner_role, primary_owner_user_id)
- Opportunity pipeline (type, status, amount)
- Work queue (assigned_user_id, priority)
- Scoring (renewal_risk, ask_readiness)

---

#### 2.2 Edge Functions (Deno Runtime)

**Routing & Collision**:
- `routing_engine`: YAML-based opportunity routing with collision detection
- `collision_rules.yaml`: 14-day major gift window, 7-day corporate window

**Scoring & Intelligence**:
- `scoring_run`: Daily scoring (renewal risk, ask readiness, propensity)
- `identity_resolve`: Multi-strategy constituent matching

**Data Ingestion**:
- `ingest_paciolan`: Ticketing CSV import
- `ingest_raisers_edge`: Donor CSV import

**Proposal Workflow**:
- `proposal_generate`: AI-powered proposal drafting (OpenAI GPT-4)
- `proposal_approve`: Multi-level approval workflow
- `proposal_send`: Email delivery with follow-up task creation

**Dashboard & Work Queue**:
- `dashboard_data`: Cached dashboard queries (15-min TTL)
- `work_queue`: Prioritized task queues

**Voice & AI**:
- `voice_command`: LLM-powered intent parsing and action routing

**Administration**:
- `role_assign`: Role management with audit logging
- `role_list`: User role queries

---

### 3. Security Layer

#### 3.1 Authentication
- **Method**: JWT tokens via Supabase Auth
- **Session**: Persistent with auto-refresh
- **SSO Ready**: Email/password (extensible to SAML/OAuth)

#### 3.2 Authorization (RLS)
- **Roles**: 7 roles (executive, major_gifts, ticketing, corporate, marketing, revenue_ops, admin)
- **Policies**: Role-based + portfolio ownership
- **Scope**: User sees only assigned constituents + team portfolios

**RLS Policy Examples**:
```sql
-- Constituents: Role-based + ownership
CREATE POLICY "role_based_read" ON constituent_master FOR SELECT
  USING (
    is_exec() OR
    (has_role('major_gifts') AND primary_owner_role = 'major_gifts') OR
    (has_role('ticketing') AND primary_owner_role = 'ticketing') OR
    (has_role('corporate') AND primary_owner_role = 'corporate')
  );

-- Opportunities: Role-based + owner-based
CREATE POLICY "opp_role_read" ON opportunity FOR SELECT
  USING (
    is_exec() OR
    (has_role('major_gifts') AND type = 'major_gift') OR
    owner_user_id = auth.uid()
  );
```

---

### 4. External Integrations

#### 4.1 OpenAI API
- **Model**: GPT-4o-mini (cost-effective for parsing)
- **Use Cases**:
  - Voice command intent parsing
  - Proposal content generation
  - Natural language understanding
- **Fallback**: Rule-based parsing if API unavailable

#### 4.2 Data Sources
- **Paciolan**: Ticketing system (CSV export)
- **Raiser's Edge**: Donor management (CSV export)
- **Future**: Wealth screening APIs, CRM integrations

---

## Data Flow

### 1. CSV Import Flow

```
User → Upload CSV → Supabase Storage
  ↓
Edge Function (ingest_paciolan or ingest_raisers_edge)
  ↓
Identity Resolution (email/phone/name+zip matching)
  ↓
Constituent Master (create or update)
  ↓
Opportunity Creation (if qualified)
  ↓
Audit Log
```

**Decision Points**:
- Email match? → Update existing
- Phone match? → Update existing
- Name+Zip match (≥80%)? → Update existing
- No match? → Create new

---

### 2. Proposal Workflow

```
Major Gifts Officer → Create Opportunity
  ↓
Routing Engine (YAML rules)
  ↓
Collision Detection (14-day window)
  ↓
Task Work Item Created
  ↓
Officer → Generate Proposal (AI)
  ↓
Draft Status → Edit Content
  ↓
Submit for Approval
  ↓
Approval Threshold Check (YAML)
  ↓
  ├─ <$25K → Auto-approve
  ├─ $25K-$99K → 1 approval required
  └─ $100K+ → 2 approvals required
  ↓
Approved Status → Preview & Send
  ↓
Email Delivery + PDF
  ↓
Sent Status + Follow-up Task (7 days)
  ↓
Interaction Log
```

---

### 3. Scoring Flow

```
Daily Cron (2:00 AM)
  ↓
scoring_run Edge Function
  ↓
Query All Constituents
  ↓
For Each Constituent:
  ├─ Calculate Renewal Risk (days since last touch)
  ├─ Calculate Ask Readiness (active opp + recent touch)
  ├─ Calculate Ticket Propensity ($500 = 1 point)
  ├─ Calculate Corporate Propensity (binary flag)
  └─ Estimate Capacity (lifetime_giving × 10)
  ↓
Upsert to scores Table
  ↓
Refresh Materialized View (mv_exec_pipeline)
  ↓
Dashboard Cache Invalidation
```

**Scoring Algorithms**:
- **Renewal Risk**: high (>180 days), medium (>90 days), low (<90 days)
- **Ask Readiness**: ready (active opp + touch <30 days), not_ready
- **Ticket Propensity**: 0-100 scale (linear: $500/point)
- **Corporate Propensity**: 100 if is_corporate, 0 otherwise (stub)
- **Capacity Estimate**: lifetime_giving × 10 (stub for wealth API)

---

### 4. Voice Command Flow

```
User → Speak Command
  ↓
Web Speech API (browser)
  ↓
Transcript → voice_command Edge Function
  ↓
LLM Intent Parsing (OpenAI GPT-4o-mini)
  ↓
Structured Intent: { action, confidence, parameters }
  ↓
Confidence ≥ 50%? → Execute Action
  ↓
Action Handler (show_renewals, show_prospects, etc.)
  ↓
Database Query (RLS-filtered)
  ↓
Structured Response: { message, display_data }
  ↓
UI Rendering (table/list/summary/profile/action)
```

---

## Scalability Considerations

### Current Capacity
- **Constituents**: 10K-50K records
- **Opportunities**: 100K+ pipeline items
- **Edge Functions**: 500K+ invocations/month
- **Database**: Supabase Pro plan (25GB+)

### Performance Optimizations
1. **Caching**:
   - Dashboard data: 15-min TTL (97% hit rate)
   - YAML rules: 5-min in-memory cache
   - npm/Deno dependencies: GitHub Actions cache

2. **Indexing**:
   - All foreign keys indexed
   - Search columns (email, phone, name) indexed
   - Composite indexes for common queries

3. **Materialized Views**:
   - Pre-aggregated dashboard metrics
   - Refreshed daily or on-demand

4. **Batch Processing**:
   - CSV ingestion: Batch size 100 records
   - Scoring: Batch size 100 constituents

### Future Scaling
- **Database**: Supabase Enterprise for >100K constituents
- **CDN**: CloudFront/Cloudflare for static assets
- **Edge Functions**: Regional deployment for latency
- **Search**: Elasticsearch for full-text search

---

## Security Model

### Data Protection
- **Encryption at Rest**: Supabase (AES-256)
- **Encryption in Transit**: TLS 1.3
- **Secrets Management**: GitHub Secrets, Supabase environment variables
- **API Keys**: Rotated quarterly, scoped to minimum permissions

### Audit Trail
- All mutations logged to `audit_log` table
- User ID, timestamp, table name, old/new values
- Retention: 1 year (configurable)

### Compliance
- **FERPA**: Educational records protection
- **Data Residency**: US-based Supabase region
- **Backup**: Daily automated backups (30-day retention)

---

## Deployment Topology

### Production
```
Frontend: Vercel/Netlify (CDN)
  ↓
API: Supabase Edge Functions (Deno runtime)
  ↓
Database: Supabase PostgreSQL (US region)
  ↓
Storage: Supabase Storage (CSV imports)
```

### Staging
```
Frontend: Vercel preview deployment
  ↓
API: Supabase staging project
  ↓
Database: Separate Supabase instance (seed data)
```

---

## Technology Choices

### Why React?
- Component-based architecture
- Large ecosystem (Vite, React Router)
- TypeScript support
- Developer familiarity

### Why Supabase?
- PostgreSQL (production-ready RDBMS)
- Built-in auth and RLS
- Edge Functions (serverless Deno)
- Real-time subscriptions (future)
- Cost-effective for startups

### Why TypeScript?
- Type safety reduces bugs
- Better IDE support
- Self-documenting code
- Easier refactoring

### Why Deno (Edge Functions)?
- Modern runtime (secure by default)
- TypeScript native
- No node_modules bloat
- Fast cold starts

---

## Known Limitations

1. **Voice Recognition**: Chrome/Edge/Safari only (no Firefox)
2. **LLM Dependency**: Requires OpenAI API key (fallback to rule-based)
3. **CSV Format**: Strict column naming required
4. **Wealth Screening**: Stub implementation (capacity = giving × 10)
5. **Corporate Propensity**: Binary flag (no ML model yet)
6. **Real-time Updates**: Polling-based (no WebSocket subscriptions)

---

## Future Enhancements (Phase 2)

1. **Advanced Scoring**:
   - Wealth screening API integration (WealthEngine, DonorSearch)
   - Corporate propensity ML model (engagement metrics, company size)
   - Predictive analytics (next-best-action)

2. **Blended Deals**:
   - Donor + ticket + corporate packages
   - Multi-product discounting
   - Bundled proposal generation

3. **Event ROI Tracking**:
   - Event attendance → ticket sales correlation
   - Engagement scoring
   - Event-specific ask readiness

4. **Real-time Features**:
   - WebSocket subscriptions (live dashboard updates)
   - Push notifications (task assignments)
   - Collaborative editing (proposals)

5. **Mobile App**:
   - React Native mobile app
   - Offline-first architecture
   - Push notifications

---

## References

- [Supabase Documentation](https://supabase.com/docs)
- [Deno Edge Functions](https://supabase.com/docs/guides/functions)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [React 18 Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
