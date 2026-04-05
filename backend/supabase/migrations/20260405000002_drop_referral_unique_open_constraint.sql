-- Migration: 20260405000002_drop_referral_unique_open_constraint.sql
-- Description: Drop the unique index that prevents multiple open referrals
--              per (referrer, gym). This was missed in 20260405000001 which
--              updated the RPC to allow parallel in-flight referrals.
--
-- The monthly payout cap (5) enforces the business-side limit.
-- The DB no longer needs to restrict one-open-at-a-time.

DROP INDEX IF EXISTS public.uq_referrals_referrer_gym_open;
