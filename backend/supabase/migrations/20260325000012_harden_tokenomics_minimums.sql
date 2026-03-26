-- Migration: 20260325000012_harden_tokenomics_minimums.sql
-- Description: Prevent zero/invalid economy caps that silently block all rewards.

-- 1) Normalize existing rows (including legacy/bad values).
UPDATE public.tokenomics_config
SET
  max_drops_per_session = GREATEST(COALESCE(max_drops_per_session, 120), 1),
  max_rewarded_sessions_per_day = GREATEST(COALESCE(max_rewarded_sessions_per_day, 4), 1),
  max_drops_per_day = GREATEST(
    COALESCE(max_drops_per_day, 300),
    GREATEST(COALESCE(max_drops_per_session, 120), 1)
  ),
  max_drops_per_week = GREATEST(
    COALESCE(max_drops_per_week, 1500),
    GREATEST(
      COALESCE(max_drops_per_day, 300),
      GREATEST(COALESCE(max_drops_per_session, 120), 1)
    )
  ),
  max_checkin_drops_per_day = GREATEST(COALESCE(max_checkin_drops_per_day, 1), 0),
  updated_at = NOW();

-- 2) Add guard constraints (non-destructive, additive).
ALTER TABLE public.tokenomics_config
  ADD CONSTRAINT tokenomics_cfg_session_min_positive CHECK (max_drops_per_session >= 1),
  ADD CONSTRAINT tokenomics_cfg_rewarded_sessions_min_positive CHECK (max_rewarded_sessions_per_day >= 1),
  ADD CONSTRAINT tokenomics_cfg_day_ge_session CHECK (max_drops_per_day >= max_drops_per_session),
  ADD CONSTRAINT tokenomics_cfg_week_ge_day CHECK (max_drops_per_week >= max_drops_per_day);
