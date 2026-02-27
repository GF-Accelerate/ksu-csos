# KSU CSOS - Deployment Guide

Step-by-step instructions for deploying the KSU CSOS platform to production.

**Estimated Time**: 2-3 hours for first-time setup
**Prerequisites**: Node.js 18+, Git, GitHub account, Supabase account

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Database Setup (Supabase)](#database-setup-supabase)
3. [Edge Functions Deployment](#edge-functions-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Environment Configuration](#environment-configuration)
6. [CI/CD Setup](#cicd-setup)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Required Accounts
- [ ] GitHub account (for code hosting and CI/CD)
- [ ] Supabase account (Pro plan recommended for production)
- [ ] Vercel or Netlify account (for frontend hosting)
- [ ] OpenAI account (for AI features)

### Required Tools
```bash
# Verify installations
node --version   # Should be 18+
npm --version    # Should be 9+
git --version    # Any recent version

# Install Supabase CLI
npm install -g supabase

# Verify Supabase CLI
supabase --version
```

### Repository Setup
```bash
# Clone repository
git clone https://github.com/your-org/ksu-csos.git
cd ksu-csos

# Install dependencies
cd apps/web
npm install
cd ../..
```

---

## Database Setup (Supabase)

### Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click **New Project**
3. Fill in project details:
   - **Name**: ksu-csos-production
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: US West (or closest to your users)
   - **Pricing Plan**: Pro (recommended for production)
4. Click **Create new project**
5. Wait 2-3 minutes for provisioning

### Step 2: Get Project Credentials

Once project is ready:

1. Go to **Project Settings** → **API**
2. Copy and save:
   - **Project URL**: `https://abc123.supabase.co`
   - **Project API key (anon public)**: `eyJhbGc...`
   - **Project API key (service_role secret)**: `eyJhbGc...` (keep secret!)
3. Go to **Project Settings** → **General**
4. Copy **Reference ID**: `abc123`

### Step 3: Link Local Project

```bash
# Login to Supabase CLI
supabase login

# Link to your project
supabase link --project-ref abc123

# Enter database password when prompted
```

### Step 4: Run Database Migrations

```bash
# Apply all migrations
supabase db push

# Verify migrations
supabase migration list

# Expected output:
# ✓ 0001_init.sql
# ✓ 0002_rls_enterprise.sql
# ✓ 0003_scores_and_views.sql
# ✓ 0004_indexes.sql
# ✓ 0005_seed_data.sql (optional for production)
```

### Step 5: Verify Database

```bash
# Open SQL editor
supabase db psql

# Run verification queries
SELECT count(*) FROM constituent_master;  -- Should be 0 (or 50 if seed data)
SELECT count(*) FROM opportunity;         -- Should be 0 (or 100 if seed data)
\dt                                       -- List all tables
\q                                        -- Exit
```

### Step 6: Create Storage Buckets

1. Go to **Storage** in Supabase dashboard
2. Create bucket: **imports**
   - **Name**: imports
   - **Public**: No
   - **File size limit**: 50 MB
   - **Allowed MIME types**: text/csv
3. Create bucket: **rules** (for YAML files)
   - **Name**: rules
   - **Public**: No
   - **File size limit**: 1 MB
   - **Allowed MIME types**: text/yaml, application/x-yaml

### Step 7: Upload YAML Rules

```bash
# Upload routing rules
supabase storage cp \
  packages/rules/routing_rules.yaml \
  supabase://rules/routing_rules.yaml

# Upload collision rules
supabase storage cp \
  packages/rules/collision_rules.yaml \
  supabase://rules/collision_rules.yaml

# Upload approval thresholds
supabase storage cp \
  packages/rules/approval_thresholds.yaml \
  supabase://rules/approval_thresholds.yaml

# Verify upload
supabase storage ls rules
```

### Step 8: Configure Row-Level Security

RLS policies are created by migration `0002_rls_enterprise.sql`. Verify:

```sql
-- Check RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;

-- Expected: All major tables have RLS enabled
```

---

## Edge Functions Deployment

### Step 1: Install Edge Function Dependencies

```bash
# No package.json for Deno - dependencies imported via URL
# Verify all functions have valid imports
cd supabase/functions

for dir in */; do
  if [ -f "${dir}index.ts" ]; then
    echo "Checking $dir..."
    deno check "${dir}index.ts" || echo "Type check failed for $dir"
  fi
done
```

### Step 2: Set Environment Variables

```bash
# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=sk-...

# Verify secrets
supabase secrets list
```

### Step 3: Deploy All Edge Functions

```bash
# Deploy all functions at once
supabase functions deploy

# Or deploy individually
supabase functions deploy routing_engine
supabase functions deploy scoring_run
supabase functions deploy proposal_generate
supabase functions deploy voice_command
supabase functions deploy ingest_paciolan
supabase functions deploy ingest_raisers_edge
supabase functions deploy dashboard_data
supabase functions deploy work_queue
supabase functions deploy role_assign
supabase functions deploy role_list

# Verify deployment
supabase functions list
```

### Step 4: Test Edge Functions

```bash
# Test routing engine
curl -X POST \
  'https://abc123.supabase.co/functions/v1/routing_engine' \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"opportunity_id":"test-id","constituent_id":"test-id"}'

# Test voice command
curl -X POST \
  'https://abc123.supabase.co/functions/v1/voice_command' \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Show me renewals at risk"}'
```

### Step 5: Schedule Scoring Run

```bash
# Enable pg_cron extension (if not already enabled)
supabase db psql
CREATE EXTENSION IF NOT EXISTS pg_cron;

# Schedule scoring_run for daily at 2:00 AM
SELECT cron.schedule(
  'daily-scoring',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://abc123.supabase.co/functions/v1/scoring_run',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb,
    body := '{"batch_size": 100}'::jsonb
  );
  $$
);

# Verify cron job
SELECT * FROM cron.job;
\q
```

---

## Frontend Deployment

### Option A: Deploy to Vercel (Recommended)

#### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

#### Step 2: Configure Project

```bash
cd apps/web

# Create vercel.json
cat > vercel.json <<EOF
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "env": {
    "VITE_SUPABASE_URL": "@vite_supabase_url",
    "VITE_SUPABASE_ANON_KEY": "@vite_supabase_anon_key"
  }
}
EOF
```

#### Step 3: Deploy to Vercel

```bash
# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# For production deployment
vercel --prod
```

#### Step 4: Set Environment Variables

In Vercel dashboard:
1. Go to **Settings** → **Environment Variables**
2. Add variables:
   - `VITE_SUPABASE_URL`: `https://abc123.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `eyJhbGc...`
3. Redeploy: `vercel --prod`

---

### Option B: Deploy to Netlify

#### Step 1: Install Netlify CLI

```bash
npm install -g netlify-cli
```

#### Step 2: Configure Project

```bash
cd apps/web

# Create netlify.toml
cat > netlify.toml <<EOF
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
EOF
```

#### Step 3: Deploy to Netlify

```bash
# Login to Netlify
netlify login

# Initialize site
netlify init

# Deploy
netlify deploy --prod
```

#### Step 4: Set Environment Variables

In Netlify dashboard:
1. Go to **Site settings** → **Environment variables**
2. Add variables:
   - `VITE_SUPABASE_URL`: `https://abc123.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `eyJhbGc...`
3. Trigger redeploy

---

## Environment Configuration

### Production Environment Variables

**Frontend (.env.production)**:
```env
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Edge Functions (Supabase Secrets)**:
```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set DATABASE_URL=postgresql://...  # Auto-set by Supabase
```

**Optional Secrets**:
```bash
# For wealth screening (future)
supabase secrets set WEALTHENGINE_API_KEY=...

# For email delivery (future)
supabase secrets set SENDGRID_API_KEY=...

# For SMS notifications (future)
supabase secrets set TWILIO_AUTH_TOKEN=...
```

---

## CI/CD Setup

### Step 1: Configure GitHub Secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions**

Add secrets:
```
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_PROJECT_ID=abc123
SUPABASE_DB_PASSWORD=your-db-password
VERCEL_TOKEN=...  # If using Vercel
```

### Step 2: Enable GitHub Actions

1. Go to **Settings → Actions → General**
2. Select **Allow all actions and reusable workflows**
3. Enable **Read and write permissions**
4. Click **Save**

### Step 3: Test CI/CD Pipeline

```bash
# Create test branch
git checkout -b test/ci-pipeline

# Make a small change
echo "# Test" >> README.md

# Commit and push
git add README.md
git commit -m "test: trigger CI/CD pipeline"
git push origin test/ci-pipeline

# Create PR and verify all checks pass
```

### Step 4: Configure Branch Protection

1. Go to **Settings → Branches**
2. Add rule for `main`:
   - Require pull request reviews
   - Require status checks (CI workflows)
   - Require branches to be up to date

---

## Post-Deployment Verification

### Step 1: Verify Frontend

```bash
# Visit production URL
open https://your-app.vercel.app

# Check for:
# - Login page loads
# - No console errors
# - Supabase connection works
```

### Step 2: Verify Database Connection

```bash
# Test authentication
curl -X POST https://abc123.supabase.co/auth/v1/signup \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Should return user object
```

### Step 3: Verify Edge Functions

```bash
# Test each critical function
curl -X POST https://abc123.supabase.co/functions/v1/health
curl -X POST https://abc123.supabase.co/functions/v1/routing_engine
curl -X POST https://abc123.supabase.co/functions/v1/voice_command
```

### Step 4: Verify RLS Policies

```bash
# Test as different users
# 1. Create test users with different roles
# 2. Verify each user only sees allowed data
# 3. Test permission denied scenarios
```

### Step 5: Verify Scheduled Jobs

```bash
# Check pg_cron status
supabase db psql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
\q
```

### Step 6: Performance Check

```bash
# Run Lighthouse audit
npx lighthouse https://your-app.vercel.app \
  --view \
  --preset=desktop

# Target scores:
# - Performance: >90
# - Accessibility: >95
# - Best Practices: >90
# - SEO: >90
```

---

## Troubleshooting

### Database Issues

**Migration Failed**:
```bash
# Check migration status
supabase migration list

# Reset database (WARNING: deletes all data)
supabase db reset

# Re-run migrations
supabase db push
```

**RLS Blocking Queries**:
```bash
# Test RLS policies
supabase db psql
SET ROLE authenticated;
SELECT * FROM constituent_master LIMIT 1;

# If empty, check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'constituent_master';
```

---

### Edge Function Issues

**Function Not Found (404)**:
```bash
# Verify deployment
supabase functions list

# Redeploy specific function
supabase functions deploy function_name
```

**Function Timeout**:
```bash
# Check function logs
supabase functions logs function_name --tail

# Increase timeout (in function code)
Deno.serve({ timeout: 120000 }, async (req) => { ... })
```

**Import Errors**:
```bash
# Verify imports use full URLs with version
# Good: import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
# Bad:  import { serve } from "std/http/server.ts"
```

---

### Frontend Issues

**Build Fails**:
```bash
# Check for TypeScript errors
npm run type-check

# Check for lint errors
npm run lint

# Try clean build
rm -rf node_modules dist
npm install
npm run build
```

**Runtime Errors**:
```bash
# Check browser console for errors
# Common issues:
# - Missing environment variables
# - CORS errors (check Supabase settings)
# - API key mismatch
```

**Slow Load Times**:
```bash
# Analyze bundle size
npm run build
npx vite-bundle-visualizer

# Look for large dependencies to lazy-load
```

---

### CI/CD Issues

**Workflow Not Triggering**:
```bash
# Check workflow file syntax
npx yaml-lint .github/workflows/*.yml

# Check path filters match changed files
# Trigger: paths: ['apps/web/**']
# Changed: apps/web/src/App.tsx ✓
```

**Secrets Not Working**:
```bash
# Verify secret names match exactly
# GitHub: VITE_SUPABASE_URL
# Workflow: ${{ secrets.VITE_SUPABASE_URL }}

# Check secret is available in workflow
echo "URL: ${{ secrets.VITE_SUPABASE_URL }}"
```

---

## Rollback Procedures

### Database Rollback

```bash
# Create backup before rollback
supabase db dump -f backup-$(date +%Y%m%d).sql

# Rollback specific migration
supabase migration repair --status reverted 0005_seed_data.sql

# Verify
supabase migration list
```

### Edge Function Rollback

```bash
# Redeploy previous version
git checkout <previous-commit>
supabase functions deploy function_name
git checkout main
```

### Frontend Rollback

**Vercel**:
1. Go to **Deployments** in Vercel dashboard
2. Find previous successful deployment
3. Click **Promote to Production**

**Netlify**:
1. Go to **Deploys** in Netlify dashboard
2. Find previous deploy
3. Click **Publish deploy**

---

## Monitoring Setup

### Supabase Monitoring

1. Go to **Logs** in Supabase dashboard
2. Enable log retention (Pro plan)
3. Set up alerts for:
   - Failed function invocations
   - High database load
   - Storage quota exceeded

### Application Monitoring

**Recommended Tools**:
- **Sentry**: Error tracking
- **LogRocket**: Session replay
- **Google Analytics**: User analytics

**Setup Sentry**:
```bash
npm install @sentry/react

# Add to src/main.tsx
import * as Sentry from "@sentry/react"

Sentry.init({
  dsn: "https://...@sentry.io/...",
  environment: "production",
})
```

---

## Security Hardening

### 1. Rotate API Keys

```bash
# Rotate Supabase anon key (quarterly)
# In Supabase dashboard: Settings → API → Reset key

# Update in frontend environment variables
# Update in GitHub secrets
```

### 2. Enable Audit Logging

All mutations already logged to `audit_log` table.

Review regularly:
```sql
SELECT * FROM audit_log
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### 3. Configure CORS

In Supabase dashboard:
1. Go to **Settings → API**
2. Set **CORS origins**: `https://your-app.vercel.app`
3. Never use `*` in production

### 4. Enable 2FA

- Enable 2FA on Supabase account
- Enable 2FA on GitHub account
- Enable 2FA on Vercel/Netlify account

---

## Maintenance Schedule

**Daily**:
- Review error logs
- Check scoring run completed
- Monitor function invocation counts

**Weekly**:
- Review audit logs
- Check database size
- Verify backup retention

**Monthly**:
- Review and optimize slow queries
- Update dependencies
- Rotate API keys (if needed)

**Quarterly**:
- Security audit
- Dependency updates
- Performance optimization

---

## Support Contacts

**Supabase Issues**: https://supabase.com/support
**Vercel Issues**: https://vercel.com/support
**OpenAI Issues**: https://help.openai.com

**Internal Support**: support@ksu.edu

---

## Appendix: Complete Environment Variable Reference

### Frontend
```
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

### Supabase Secrets
```
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...  # Auto-set
```

### GitHub Actions
```
VITE_SUPABASE_URL=https://abc123.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_PROJECT_ID=abc123
SUPABASE_DB_PASSWORD=...
VERCEL_TOKEN=...  # Optional
```

---

**Deployment Status**: ✅ Complete
**Next Steps**: See [TESTING.md](./TESTING.md) for testing strategy
