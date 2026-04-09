-- Fix criteria.type values in global_achievements to match evaluate_badges() CASE branches.
-- Admin panel was storing 'drops', 'streak', 'sessions', 'distance', 'duration', 'custom'
-- but evaluate_badges() expects 'total_drops', 'streak_days', 'session_count', 'distance_km', 'gym_count'.
-- Mismatched types always fell through to ELSE → v_met := false, so badges were never awarded.

UPDATE public.global_achievements
SET criteria = jsonb_set(criteria, '{type}', '"total_drops"')
WHERE criteria->>'type' = 'drops';

UPDATE public.global_achievements
SET criteria = jsonb_set(criteria, '{type}', '"streak_days"')
WHERE criteria->>'type' = 'streak';

UPDATE public.global_achievements
SET criteria = jsonb_set(criteria, '{type}', '"session_count"')
WHERE criteria->>'type' = 'sessions';

UPDATE public.global_achievements
SET criteria = jsonb_set(criteria, '{type}', '"distance_km"')
WHERE criteria->>'type' = 'distance';

-- 'duration' and 'custom' have no server-side evaluator; mark them inactive
-- so they stop showing as unachievable locked badges.
UPDATE public.global_achievements
SET is_active = false,
    criteria = jsonb_set(criteria, '{type}', concat('"_legacy_', (criteria->>'type'), '"')::jsonb)
WHERE criteria->>'type' IN ('duration', 'custom');
