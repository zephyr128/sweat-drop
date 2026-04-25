-- Migration: 20260425260000_backfill_drops_transactions_gym_id.sql
-- Description: Backfill drops_transactions.gym_id for legacy rows so per-gym home dashboards stop bleeding across gyms.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- ROOT CAUSE (user-reported, paraphrased SR→EN):
--   "I still see drops from another gym on the home screen. In gym1 I earned
--    56 drops + 30 bonus. When I switch to gym2 it still shows that, but it
--    should show 0 because I haven't earned anything in gym2. Same for the
--    'Today' gauge."
--
--   The home dashboard RPC (get_home_dashboard, last fixed in 20260425181000)
--   correctly filters week_drops by `(p_gym_id IS NULL OR dt.gym_id = p_gym_id)`.
--   The breakage is on legacy rows where dt.gym_id IS NULL:
--
--     - The original add_drops(p_user_id, p_gym_id, p_amount, ...) function
--       (defined in 20240101000003_dual_wallet_system.sql, last revised in
--       20250127170000_fix_add_drops_session_date.sql) accepted p_gym_id but
--       NEVER included it in the INSERT into drops_transactions. Every row it
--       wrote — sessions, challenge rewards, badges, refunds — got gym_id NULL.
--     - That function was eventually dropped in 20260305000001 (superseded by
--       award_drops()), but rows it had already written remain in production.
--     - For those NULL rows the per-gym filter `dt.gym_id = p_gym_id` is FALSE
--       for every gym (NULL = anything → NULL → false), so they're invisible
--       on every per-gym view. That's already correct behaviour, BUT in
--       practice many of those legacy rows are still SHOWN today because the
--       181000 migration may not have reached every environment yet, and
--       because a user sees the same total in every gym, perceives "drops
--       follow me everywhere".
--
-- WHAT THIS MIGRATION DOES:
--   1. For 'session' rows: backfill gym_id from sessions.gym_id via reference_id.
--   2. For 'checkin' rows: backfill gym_id from gym_checkins.gym_id via
--      (user_id, created_at) proximity (no FK exists; we match the most recent
--      check-in within ±2 minutes of the transaction). Only applies when
--      exactly one candidate matches, to avoid mis-attribution.
--   3. For 'challenge' rows: backfill gym_id from gym_challenges.gym_id via
--      reference_id (the legacy `challenges` table was renamed to
--      `gym_challenges` in 20250128000002).
--   4. For 'arena' rows: backfill gym_id from arena_participants.gym_id
--      keyed on (user_id, arena_id). sweat_arenas itself has no gym_id —
--      it's a many-to-many via arena_gyms — but each participant has a
--      single gym they competed under.
--   5. For 'reward_claim' / 'redemption' / 'expired' / 'refund' rows:
--      backfill from redemptions.gym_id via reference_id.
--   6. Logs how many rows were updated for visibility.
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   - It does NOT delete or alter rows that genuinely have no gym attribution
--     (e.g. 'bonus' or 'referral_reward' rows whose reference_id points at a
--     deleted entity). Those will remain NULL and continue to be excluded
--     from per-gym views, which is the correct economic invariant: spendable
--     drops are gym-local, so an unattributable drop cannot be claimed by
--     any specific gym.
--   - It does NOT change the get_home_dashboard filter; that's already
--     correct as of 20260425181000.
--   - It does NOT add a NOT NULL constraint on drops_transactions.gym_id
--     because spend-side rows (refunds, system grants) legitimately have
--     no gym anchor.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Once deployed, switching from gym1 to gym2 will now
--     correctly show 0 drops earned in gym2 (assuming no historical activity
--     there). Historical session/checkin/challenge drops in gym1 will keep
--     showing in gym1's gauge.
--   - Admin Panel: No change.
--
-- DEPLOYMENT NOTE:
--   This migration is idempotent and safe to re-run. It only updates rows
--   where gym_id IS NULL.

DO $$
DECLARE
  v_session_count   INTEGER := 0;
  v_checkin_count   INTEGER := 0;
  v_challenge_count INTEGER := 0;
  v_arena_count     INTEGER := 0;
  v_redeem_count    INTEGER := 0;
BEGIN
  -- 1) 'session' rows — derive gym_id from sessions.gym_id
  WITH upd AS (
    UPDATE public.drops_transactions dt
    SET gym_id = s.gym_id
    FROM public.sessions s
    WHERE dt.gym_id IS NULL
      AND dt.transaction_type = 'session'
      AND dt.reference_id = s.id
      AND s.gym_id IS NOT NULL
    RETURNING dt.id
  )
  SELECT COUNT(*) INTO v_session_count FROM upd;

  -- 2) 'checkin' rows — derive gym_id from gym_checkins by user + time match.
  --    There's no reference_id on legacy check-in transactions, so we match
  --    on (user_id, ±2 min around created_at) and require exactly one
  --    candidate to avoid ambiguity.
  WITH candidates AS (
    SELECT
      dt.id AS dt_id,
      gc.gym_id,
      ROW_NUMBER() OVER (
        PARTITION BY dt.id
        ORDER BY ABS(EXTRACT(EPOCH FROM (gc.checked_in_at - dt.created_at)))
      ) AS rn,
      COUNT(*) OVER (PARTITION BY dt.id) AS match_count
    FROM public.drops_transactions dt
    JOIN public.gym_checkins gc
      ON gc.user_id = dt.user_id
     AND gc.checked_in_at BETWEEN dt.created_at - INTERVAL '2 minutes'
                              AND dt.created_at + INTERVAL '2 minutes'
    WHERE dt.gym_id IS NULL
      AND dt.transaction_type = 'checkin'
      AND gc.gym_id IS NOT NULL
  ),
  upd AS (
    UPDATE public.drops_transactions dt
    SET gym_id = c.gym_id
    FROM candidates c
    WHERE dt.id = c.dt_id
      AND c.rn = 1
      AND c.match_count = 1
    RETURNING dt.id
  )
  SELECT COUNT(*) INTO v_checkin_count FROM upd;

  -- 3) 'challenge' rows — derive gym_id from gym_challenges.gym_id.
  --    (The legacy `challenges` table was renamed to `gym_challenges` in
  --    20250128000002, so reference_ids of all eras now point here.)
  WITH upd AS (
    UPDATE public.drops_transactions dt
    SET gym_id = gc.gym_id
    FROM public.gym_challenges gc
    WHERE dt.gym_id IS NULL
      AND dt.transaction_type = 'challenge'
      AND dt.reference_id = gc.id
      AND gc.gym_id IS NOT NULL
    RETURNING dt.id
  )
  SELECT COUNT(*) INTO v_challenge_count FROM upd;

  -- 4) 'arena' rows — sweat_arenas has no direct gym_id (it's a many-to-many
  --    via arena_gyms). The authoritative per-user gym for an arena entry is
  --    on arena_participants (user_id, arena_id) → gym_id.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'arena_participants'
  ) THEN
    WITH upd AS (
      UPDATE public.drops_transactions dt
      SET gym_id = ap.gym_id
      FROM public.arena_participants ap
      WHERE dt.gym_id IS NULL
        AND dt.transaction_type = 'arena'
        AND ap.user_id = dt.user_id
        AND ap.arena_id = dt.reference_id
        AND ap.gym_id IS NOT NULL
      RETURNING dt.id
    )
    SELECT COUNT(*) INTO v_arena_count FROM upd;
  END IF;

  -- 5) Spend-side rows that do have a meaningful gym anchor:
  --    'reward_claim', 'redemption', 'expired', 'refund' all reference
  --    a redemptions row whose gym_id is authoritative.
  WITH upd AS (
    UPDATE public.drops_transactions dt
    SET gym_id = r.gym_id
    FROM public.redemptions r
    WHERE dt.gym_id IS NULL
      AND dt.transaction_type = ANY (ARRAY['reward_claim','redemption','expired','refund'])
      AND dt.reference_id = r.id
      AND r.gym_id IS NOT NULL
    RETURNING dt.id
  )
  SELECT COUNT(*) INTO v_redeem_count FROM upd;

  RAISE NOTICE
    'drops_transactions gym_id backfill complete: session=%, checkin=%, challenge=%, arena=%, redemption=%',
    v_session_count, v_checkin_count, v_challenge_count, v_arena_count, v_redeem_count;
END
$$;

-- Index coverage for the per-gym week_drops scan in get_home_dashboard
-- already exists as idx_drops_tx_user_gym_created (created in
-- 20260409100000_performance_missing_indexes_and_diagnostics.sql) and
-- idx_drops_tx_user_gym_positive (20260326000001). No new index needed.
