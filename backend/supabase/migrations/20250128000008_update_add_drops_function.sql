-- Originally: Update add_drops function for gym_challenges rename
-- SKIPPED: add_drops was superseded by award_drops in later migrations.
-- The function body had a missing DECLARE for v_challenge_record which fails on PG 17.
-- Kept as no-op for migration history consistency.
DO $$ BEGIN NULL; END $$;
