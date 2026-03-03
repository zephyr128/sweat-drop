-- Migration: 20260302000005_extend_drops_transactions.sql
-- Description: Extends drops_transactions with gym_id, balance_after, and expiry tracking
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.5)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.drops_transactions.gym_id (UUID → gyms)
-- - Added column: public.drops_transactions.balance_after (INTEGER)
-- - Added column: public.drops_transactions.expires_at (TIMESTAMPTZ)
-- - Added indexes for gym filtering and expiry cron
--
-- EXPIRY RULES (per Q6):
-- - Session drops expire after 90 days
-- - Push notification at 30d and 7d before expiry
-- - Expired drops deducted from available_drops by daily cron
-- - Banner on home screen when drops expiring < 30 days
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Transaction history can show gym filter, expiry dates
-- - Admin Panel: Analytics can show drops by gym
--
-- BREAKING CHANGES:
-- - None (additive only, existing transactions have NULL for new columns)

-- 1. Add gym_id reference (which gym were these drops earned/spent at)
ALTER TABLE public.drops_transactions
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;

-- 2. Add balance_after snapshot (profiles.available_drops after this transaction)
ALTER TABLE public.drops_transactions
  ADD COLUMN IF NOT EXISTS balance_after INTEGER;

-- 3. Add expiry timestamp (NULL = never expires)
ALTER TABLE public.drops_transactions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 4. Backfill expiry for existing session transactions
UPDATE public.drops_transactions
SET expires_at = created_at + INTERVAL '90 days'
WHERE expires_at IS NULL
  AND transaction_type = 'session'
  AND amount > 0;

-- 5. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_drops_transactions_gym_id
  ON public.drops_transactions(gym_id);

CREATE INDEX IF NOT EXISTS idx_drops_transactions_expires_at
  ON public.drops_transactions(expires_at)
  WHERE expires_at IS NOT NULL;

-- Compound index for the expiry cron job
CREATE INDEX IF NOT EXISTS idx_drops_transactions_expiry_pending
  ON public.drops_transactions(expires_at, user_id)
  WHERE expires_at IS NOT NULL AND amount > 0;

-- Compound index for user + type queries (transaction history)
CREATE INDEX IF NOT EXISTS idx_drops_transactions_user_type
  ON public.drops_transactions(user_id, transaction_type);

-- 6. Comments
COMMENT ON COLUMN public.drops_transactions.gym_id IS 'Gym where these drops were earned or spent. NULL for manual/system transactions.';
COMMENT ON COLUMN public.drops_transactions.balance_after IS 'Snapshot of profiles.available_drops immediately after this transaction. Used for audit trail.';
COMMENT ON COLUMN public.drops_transactions.expires_at IS 'When these drops expire. NULL = never expires. Session drops expire after 90 days. Expiry processed by daily cron.';
