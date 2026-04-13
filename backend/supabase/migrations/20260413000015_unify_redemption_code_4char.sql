-- Migration: 20260413000015_unify_redemption_code_4char.sql
-- Description: Unify all redemption codes to 4 uppercase hex characters.
--
-- PROBLEM:
--   The BEFORE INSERT trigger generated 8-char codes (md5 substr 1..8),
--   but the admin RedemptionVerifier UI only accepts 4-char input.
--   Leaderboard prizes and store claim_reward already set 4-char codes
--   explicitly, so only arena prizes (which rely on the trigger) got 8-char codes.
--
-- FIX:
--   1. Replace trigger function with 4-char code + collision-safe loop
--   2. Backfill any existing 8-char codes to 4-char (truncate + re-check uniqueness)
--
-- BREAKING CHANGES: None for new codes. Existing 8-char codes are shortened.

-- ============================================================
-- 1. Replace trigger function: 4-char with collision check
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_redemption_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.redemption_code IS NULL THEN
    LOOP
      v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.redemptions r
        WHERE r.redemption_code = v_code AND r.id IS DISTINCT FROM NEW.id
      );
    END LOOP;
    NEW.redemption_code := v_code;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Backfill existing 8-char codes to 4-char
-- ============================================================
-- Truncate codes longer than 4 chars. If the truncated code collides
-- with another pending code, append a random hex digit replacement.

DO $$
DECLARE
  rec RECORD;
  v_short TEXT;
BEGIN
  FOR rec IN
    SELECT id, redemption_code
    FROM public.redemptions
    WHERE length(redemption_code) > 4
  LOOP
    v_short := substring(rec.redemption_code from 1 for 4);
    IF EXISTS (
      SELECT 1 FROM public.redemptions
      WHERE redemption_code = v_short AND id <> rec.id
    ) THEN
      LOOP
        v_short := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.redemptions
          WHERE redemption_code = v_short AND id <> rec.id
        );
      END LOOP;
    END IF;

    UPDATE public.redemptions SET redemption_code = v_short WHERE id = rec.id;
  END LOOP;
END;
$$;
