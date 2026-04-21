-- Refresh planner statistics on hot tables.
-- Indexes were created in 20260409100000; ANALYZE ensures the planner sees
-- accurate row-count and distribution stats after subsequent inserts.
-- Safe to run on PROD at any time — no locking, no schema changes.

ANALYZE public.sessions;
ANALYZE public.drops_transactions;
ANALYZE public.profiles;
ANALYZE public.redemptions;
ANALYZE public.gym_memberships;
ANALYZE public.challenge_progress;
ANALYZE public.rewards;
ANALYZE public.user_badges;
