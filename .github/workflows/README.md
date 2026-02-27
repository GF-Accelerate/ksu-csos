# GitHub Actions Workflows

This directory contains CI/CD workflows for the KSU CSOS project.

## Workflows

### 1. Frontend CI (`ci-web.yml`)

**Triggers:**
- Pull requests affecting `apps/web/**`
- Pushes to `main` branch

**Jobs:**
- **Lint and Type Check**: Runs ESLint and TypeScript type checking
- **Build**: Builds production bundle and uploads artifacts
- **Test**: Runs tests (if configured)

**Secrets Required:**
- `VITE_SUPABASE_URL` (optional, uses placeholder if not set)
- `VITE_SUPABASE_ANON_KEY` (optional, uses placeholder if not set)

**Status:** ✅ Ready to use

---

### 2. Edge Functions CI (`ci-functions.yml`)

**Triggers:**
- Pull requests affecting `supabase/functions/**`
- Pushes to `main` branch

**Jobs:**
- **Test Functions**: Runs Deno tests for all Edge Functions
- **Validate Structure**: Checks that all functions have `index.ts` and use `Deno.serve`
- **Check Dependencies**: Analyzes imports and dependencies

**Requirements:**
- Deno runtime (automatically installed)
- Test files named `test.ts` in function directories

**Status:** ✅ Ready to use

---

### 3. Deploy Database Migrations (`deploy-migrations.yml`)

**Triggers:**
- Pushes to `main` affecting `supabase/migrations/**`
- Manual workflow dispatch

**Jobs:**
- **Validate Migrations**: Checks file naming and basic SQL syntax
- **Deploy Migrations**: Pushes migrations to Supabase
- **Notify Deployment**: Reports deployment status

**Secrets Required:**
- `SUPABASE_ACCESS_TOKEN` - Supabase API access token
- `SUPABASE_PROJECT_ID` - Your Supabase project reference ID
- `SUPABASE_DB_PASSWORD` - Database password (if needed)

**Status:** ⚠️ Requires secrets configuration

---

## Setup Instructions

### Step 1: Configure Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

**Required for Frontend:**
- `VITE_SUPABASE_URL`: Your Supabase project URL (e.g., `https://abc123.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon/public key

**Required for Migrations:**
- `SUPABASE_ACCESS_TOKEN`: Personal access token from Supabase dashboard
- `SUPABASE_PROJECT_ID`: Project reference ID (found in project settings)
- `SUPABASE_DB_PASSWORD`: Database password (optional)

### Step 2: Enable GitHub Actions

1. Go to **Settings → Actions → General**
2. Under "Actions permissions", select **Allow all actions and reusable workflows**
3. Under "Workflow permissions", select **Read and write permissions**
4. Click **Save**

### Step 3: Test Workflows

Create a test pull request to trigger CI workflows:

```bash
git checkout -b test/ci-workflows
git commit --allow-empty -m "test: trigger CI workflows"
git push origin test/ci-workflows
```

Then create a PR and verify all checks pass.

---

## Workflow Features

### Frontend CI Features:
- ✅ Dependency caching for faster builds
- ✅ Build artifact upload (7-day retention)
- ✅ Parallel lint, type-check, and build jobs
- ✅ TypeScript strict mode validation
- ✅ Production build verification

### Edge Functions CI Features:
- ✅ Deno dependency caching
- ✅ Individual function linting
- ✅ Type checking for all functions
- ✅ Automated test discovery and execution
- ✅ Structure validation (index.ts, Deno.serve)
- ✅ Import analysis

### Migration Deployment Features:
- ✅ Migration file validation (naming, syntax)
- ✅ Automatic deployment on merge to main
- ✅ Manual deployment via workflow_dispatch
- ✅ Migration status verification
- ✅ Deployment notifications

---

## Adding Tests

### Frontend Tests

Add test scripts to `apps/web/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Edge Function Tests

Create `test.ts` files in function directories:

```typescript
// supabase/functions/my_function/test.ts
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("my function test", () => {
  // Your test here
  assertEquals(1 + 1, 2);
});
```

---

## Troubleshooting

### Workflow not triggering?

Check that:
1. GitHub Actions are enabled in repository settings
2. Workflow file syntax is valid (use yamllint)
3. File paths in `on.paths` match your changes

### Build failing?

Check:
1. Secrets are configured correctly
2. Node/Deno versions match local development
3. Dependencies are locked (package-lock.json, lock files)

### Migration deployment failing?

Check:
1. `SUPABASE_ACCESS_TOKEN` has correct permissions
2. `SUPABASE_PROJECT_ID` is correct
3. Migration files have valid SQL syntax
4. No conflicting migrations exist

---

## Best Practices

1. **Always run CI locally first**: Use `npm run lint`, `npm run type-check`, `npm run build` before pushing
2. **Keep workflows fast**: Use caching and parallel jobs
3. **Fail fast**: Run quick checks (lint, type-check) before expensive builds
4. **Test migrations locally**: Use `supabase db reset` to test migrations before deploying
5. **Version lock dependencies**: Commit package-lock.json and use exact versions
6. **Monitor workflow runs**: Set up notifications for failed workflows

---

## Continuous Deployment (Future)

To enable automatic deployment on merge to main:

1. Add deployment workflows for:
   - Frontend (deploy to Vercel/Netlify)
   - Edge Functions (deploy to Supabase)
2. Add environment-specific secrets
3. Implement staging → production promotion workflow
4. Add smoke tests for deployed environments

---

## Support

For issues with workflows:
1. Check workflow run logs in Actions tab
2. Review this README
3. Check GitHub Actions documentation: https://docs.github.com/actions
