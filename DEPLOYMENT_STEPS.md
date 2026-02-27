# KSU CSOS - Quick Deployment Guide

## Step 1: Create Supabase Project (Manual - 2 minutes)

1. Go to: https://supabase.com/dashboard
2. Click "New Project"
3. Settings:
   - Name: **KSU College Sports OS**
   - Database Password: **KsuCsos2024!Secure** (save this!)
   - Region: **East US (Ohio)** (us-east-1)
   - Pricing Plan: **Free** (upgrade to Pro later for production)
4. Click "Create new project"
5. Wait ~2 minutes for provisioning

## Step 2: Get Project Details

Once created, you'll need:
- **Project URL**: `https://[your-ref].supabase.co`
- **Project Reference ID**: Found in Settings > General
- **Anon Key**: Found in Settings > API
- **Service Role Key**: Found in Settings > API (keep secret!)

## Step 3: Link Local Project (Automated)

We'll run these commands once you have the Project Reference ID from Step 2.

```bash
cd /c/Users/mover/ksu-csos
supabase link --project-ref [your-project-ref]
supabase db push  # Apply all migrations
supabase functions deploy  # Deploy all 13 Edge Functions
```

## Step 4: Deploy to Vercel (Automated)

```bash
cd /c/Users/mover/ksu-csos/apps/web
vercel --prod
```

During deployment, Vercel will ask for environment variables:
- `VITE_SUPABASE_URL`: Your project URL from Step 2
- `VITE_SUPABASE_ANON_KEY`: Your anon key from Step 2

---

**Ready to start? Create the Supabase project first, then provide me the Project Reference ID and I'll automate the rest!**
