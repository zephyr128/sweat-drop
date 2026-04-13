-- Migration: 20260413000003_backfill_leaderboard_prize_codes.sql
-- Description: Backfill leaderboard prize redemptions that were created with the
--              old function (status='claimed', no code, no expires_at).
--              Generates a unique 4-char code for each, sets status='pending',
--              and adds expires_at = created_at + 30 days.
--
-- AGENT NOTE: [2026-04-13] - supabase-dba
--
-- CONTEXT:
--   The "Distribute Now" button was clicked before migration 20260413000001
--   was applied, so some leaderboard_prize redemptions were created with
--   the old function body (status='claimed', no redemption_code, no expires_at).
--   This one-time backfill fixes those rows so users can collect their prizes
--   via the standard code-at-desk flow.
--
-- CHANGES:
--   - Updates redemptions with source_type='leaderboard_prize' AND
--     status='claimed' AND redemption_code IS NULL
--     → status='pending', redemption_code=<unique 4-char>, expires_at=created_at+30d
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Affected users will now see the prize as "pending" with a code
--     in their redemptions screen. They can show the code to staff.
--   - Admin Panel: These prizes will now appear with codes in the distribution history.

DO $$
DECLARE
  v_row RECORD;
  v_code TEXT;
BEGIN
  FOR v_row IN
    SELECT id, created_at
    FROM public.redemptions
    WHERE source_type = 'leaderboard_prize'
      AND status = 'claimed'
      AND redemption_code IS NULL
    ORDER BY created_at ASC
  LOOP
    -- Generate unique 4-char code
    LOOP
      v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.redemptions r
        WHERE r.redemption_code = v_code AND r.status = 'pending'
      );
    END LOOP;

    UPDATE public.redemptions
    SET status = 'pending',
        redemption_code = v_code,
        expires_at = v_row.created_at + INTERVAL '30 days'
    WHERE id = v_row.id;
  END LOOP;
END;
$$;
