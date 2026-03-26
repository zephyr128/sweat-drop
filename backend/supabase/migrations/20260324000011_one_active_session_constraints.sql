-- Migration: 20260324000011_one_active_session_constraints.sql
-- Description: Enforce one active session per user and per machine.

-- Cleanup #1: for users with multiple active sessions, keep the most recent one.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY COALESCE(started_at, created_at, NOW()) DESC, id DESC
         ) AS rn
  FROM public.sessions
  WHERE is_active = true
)
UPDATE public.sessions s
SET is_active = false,
    ended_at = COALESCE(s.ended_at, NOW()),
    updated_at = NOW()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- Cleanup #2: for machines with multiple active sessions, keep the most recent one.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY machine_id
           ORDER BY COALESCE(started_at, created_at, NOW()) DESC, id DESC
         ) AS rn
  FROM public.sessions
  WHERE is_active = true
    AND machine_id IS NOT NULL
)
UPDATE public.sessions s
SET is_active = false,
    ended_at = COALESCE(s.ended_at, NOW()),
    updated_at = NOW()
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_one_active_per_user
  ON public.sessions(user_id)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_one_active_per_machine
  ON public.sessions(machine_id)
  WHERE is_active = true AND machine_id IS NOT NULL;
