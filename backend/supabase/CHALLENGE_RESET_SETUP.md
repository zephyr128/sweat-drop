# Challenge Reset Setup Guide

This guide explains how to set up automated resets for daily and weekly challenges.

## Option 1: Supabase Edge Function (Recommended)

### 1. Get Your Project Reference

Your Supabase project reference (project-ref) can be found in several ways:

**Option A: From Supabase Dashboard URL**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Look at the URL: `https://supabase.com/dashboard/project/abcdefghijklmnop`
4. The part after `/project/` is your project-ref (e.g., `abcdefghijklmnop`)

**Option B: From Project Settings**
1. Go to your project in Supabase Dashboard
2. Click on "Project Settings" (gear icon in sidebar)
3. Under "General" tab, find "Reference ID"
4. Copy the reference ID

**Option C: From Your Supabase URL**
- If your Supabase URL is: `https://abcdefghijklmnop.supabase.co`
- Then your project-ref is: `abcdefghijklmnop`

### 2. Deploy the Edge Function

**Important**: Since your Supabase config is in `backend/supabase/`, you need to run the deploy command from the `backend` directory.

```bash
# Navigate to the backend directory
cd backend

# Option A: Use npx (no installation needed, recommended)
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF_HERE

# Deploy the function (must run from backend directory)
npx supabase functions deploy reset-challenges
```

**If you get config parsing errors:**
- The `config.toml` has been updated to be compatible with remote deployment
- Remove `[project]` section (only for local dev)
- `realtime.ip_version` must be "IPv4" or "IPv6" (uppercase)
- Remove `realtime.port` (not supported in remote config)
- `functions` section should be removed (functions are deployed separately)

**If you get "file not found" error:**
- Make sure you're in the `backend/` directory (not `admin-panel/` or project root)
- The function should be at: `supabase/functions/reset-challenges/index.ts` relative to `backend/`
- Verify the file exists: `ls -la supabase/functions/reset-challenges/index.ts`

# Option B: Install globally (requires fixing npm permissions first)
# See "Fixing npm Permissions" section below
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy reset-challenges
```

### 2. Set Environment Variables

In your Supabase Dashboard:
- Go to Project Settings > Edge Functions
- Add environment variables:
  - `SUPABASE_URL`: Your Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (keep this secret!)

### 3. Set Up Cron Jobs

#### Using Supabase Cron (if available)

In Supabase Dashboard > Database > Cron Jobs:

**Daily Reset (runs every day at 00:00 UTC):**
```sql
SELECT cron.schedule(
  'reset-daily-challenges',
  '0 0 * * *', -- Every day at midnight UTC
  $$
  SELECT net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/reset-challenges?type=daily',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb
  ) AS request_id;
  $$
);
```

**Weekly Reset (runs every Monday at 00:00 UTC):**
```sql
SELECT cron.schedule(
  'reset-weekly-challenges',
  '0 0 * * 1', -- Every Monday at midnight UTC
  $$
  SELECT net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/reset-challenges?type=weekly',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb
  ) AS request_id;
  $$
);
```

#### Using External Cron Service (e.g., cron-job.org, EasyCron)

1. Create a cron job that calls:
   - **Daily**: `https://your-project-ref.supabase.co/functions/v1/reset-challenges?type=daily`
   - **Weekly**: `https://your-project-ref.supabase.co/functions/v1/reset-challenges?type=weekly`

2. Add Authorization header:
   ```
   Authorization: Bearer YOUR_SERVICE_ROLE_KEY
   ```

3. Set schedule:
   - Daily: `0 0 * * *` (every day at 00:00 UTC)
   - Weekly: `0 0 * * 1` (every Monday at 00:00 UTC)

## Option 2: Database Function with pg_cron Extension

If you have `pg_cron` extension enabled in Supabase:

```sql
-- Enable pg_cron extension (requires superuser, may not be available in Supabase)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily reset
SELECT cron.schedule(
  'reset-daily-challenges',
  '0 0 * * *', -- Every day at midnight UTC
  $$SELECT public.reset_daily_challenges();$$
);

-- Schedule weekly reset
SELECT cron.schedule(
  'reset-weekly-challenges',
  '0 0 * * 1', -- Every Monday at midnight UTC
  $$SELECT public.reset_weekly_challenges();$$
);
```

## Testing

### Manual Test via Supabase Dashboard

1. Go to Database > Functions
2. Run `reset_daily_challenges()` or `reset_weekly_challenges()` manually
3. Verify that `user_challenge_progress` records are reset

### Test Edge Function

```bash
curl -X POST \
  'https://your-project-ref.supabase.co/functions/v1/reset-challenges?type=daily' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

## Monitoring

Check the Edge Function logs in Supabase Dashboard > Edge Functions > Logs to ensure the resets are running successfully.

## Troubleshooting

- **Function not found**: Make sure the Edge Function is deployed
- **Permission denied**: Check that the service role key is correct
- **No resets happening**: Verify the cron schedule and check function logs
- **Timezone issues**: All cron schedules use UTC. Adjust if needed for your timezone.

## Fixing npm Permissions (if you want global install)

If you get `EACCES` permission errors when installing globally:

### Option 1: Use npx (Recommended)
Just use `npx supabase` instead of installing globally. No permissions needed!

### Option 2: Change npm's default directory
```bash
# Create a directory for global packages
mkdir ~/.npm-global

# Configure npm to use the new directory
npm config set prefix '~/.npm-global'

# Add to your shell profile (~/.zshrc or ~/.bash_profile)
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# Now install globally without sudo
npm install -g supabase
```

### Option 3: Use sudo (Not recommended for security)
```bash
sudo npm install -g supabase
```
