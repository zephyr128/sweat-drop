-- Migration: 20260328000003_cleanup_dead_referral_columns.sql
-- Description: Drop dead referral columns from previous trigger iterations.
--   qualified_redemption_at/id — original MVP trigger (checkin+redemption), unused
--   qualified_first_workout_at/id — pilot v1 trigger (first workout), replaced by verified_checkin
--
-- reward_tx_id is KEPT (referrer payout audit, actively used by evaluate_referral_qualification)
-- invitee_reward_tx_id is KEPT (invitee bonus audit)
--
-- ROLLBACK: These columns held no live data for the current referral flow.
--   Re-add with ALTER TABLE ADD COLUMN IF NOT EXISTS if needed.

ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_redemption_at;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_redemption_id;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_first_workout_at;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_first_workout_id;

DROP INDEX IF EXISTS idx_referrals_first_workout;
