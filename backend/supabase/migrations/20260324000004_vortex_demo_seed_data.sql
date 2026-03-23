-- ═══════════════════════════════════════════════════════════
-- Migration: 20260324000004_vortex_demo_seed_data.sql
-- Description: Seed demo data for Vortex gym — store rewards + challenges
-- For demo on 2026-03-12
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_gym_id UUID := '4074dffe-6df8-4070-b560-5be794977bff';
BEGIN

  -- ============================================================
  -- 1. STORE REWARDS (5 new items)
  -- ============================================================

  INSERT INTO public.rewards (gym_id, name, description, reward_type, price_drops, stock, is_active, is_one_time)
  VALUES
    (v_gym_id, 'Branded Water Bottle',
     'Premium Vortex-branded stainless steel water bottle. Stay hydrated in style.',
     'physical', 150, 20, true, false),

    (v_gym_id, 'Free Personal Training Session',
     'One-on-one 45-minute session with a certified Vortex trainer. Perfect for leveling up your form.',
     'physical', 800, 5, true, true),

    (v_gym_id, 'Gym Towel',
     'Soft microfiber towel with embroidered Vortex logo. Quick-dry and compact.',
     'physical', 100, 30, true, false),

    (v_gym_id, 'Smoothie Bar Credit',
     'One free smoothie of your choice from the Vortex Smoothie Bar.',
     'physical', 75, 50, true, false),

    (v_gym_id, 'Free Parking Pass (1 Month)',
     'Complimentary parking in the Vortex garage for a full month.',
     'physical', 300, 10, true, false);


  -- ============================================================
  -- 2. CHALLENGES (5 new challenges — variety of types)
  -- ============================================================

  -- 2a. Daily challenge — easy, achievable in one session
  INSERT INTO public.gym_challenges
    (gym_id, name, description, challenge_type, scoring_model,
     target_drops, reward_drops, start_date, end_date,
     is_active, criteria, tiers)
  VALUES
    (v_gym_id,
     'Daily Grind',
     'Earn 30 drops in a single day. Come in, push hard, and claim your bonus.',
     'daily', 'total_drops',
     30, 15,
     '2026-03-11', '2026-12-31',
     true,
     '{"type": "drops", "operator": ">=", "value": 30, "scope": "gym"}'::jsonb,
     NULL);

  -- 2b. Weekly tiered challenge — bronze / silver / gold
  INSERT INTO public.gym_challenges
    (gym_id, name, description, challenge_type, scoring_model,
     target_drops, reward_drops, start_date, end_date,
     is_active, criteria, tiers)
  VALUES
    (v_gym_id,
     'Weekly Blitz',
     'Accumulate drops throughout the week. Reach higher tiers for bigger rewards!',
     'weekly', 'total_drops',
     300, 0,
     '2026-03-10', '2026-12-31',
     true,
     '{"type": "drops", "operator": ">=", "value": 300, "scope": "gym"}'::jsonb,
     '[
       {"label": "Bronze", "target": 100, "drops": 25},
       {"label": "Silver", "target": 200, "drops": 50},
       {"label": "Gold",   "target": 300, "drops": 100}
     ]'::jsonb);

  -- 2c. Streak challenge — 7 consecutive days
  INSERT INTO public.gym_challenges
    (gym_id, name, description, challenge_type, scoring_model,
     target_drops, reward_drops, streak_days, start_date, end_date,
     is_active, criteria, tiers)
  VALUES
    (v_gym_id,
     'Iron Will',
     'Train at Vortex for 7 days in a row. Consistency is the ultimate superpower.',
     'streak', 'streak_days',
     0, 100, 7,
     '2026-03-11', '2026-12-31',
     true,
     '{"type": "streak", "operator": ">=", "value": 7, "scope": "gym"}'::jsonb,
     NULL);

  -- 2d. Monthly accumulation challenge — big goal
  INSERT INTO public.gym_challenges
    (gym_id, name, description, challenge_type, scoring_model,
     target_drops, reward_drops, start_date, end_date,
     is_active, criteria, tiers)
  VALUES
    (v_gym_id,
     'Drop Collector',
     'Earn 1,000 drops this month. The grind pays off — literally.',
     'monthly', 'total_drops',
     1000, 250,
     '2026-03-01', '2026-03-31',
     true,
     '{"type": "drops", "operator": ">=", "value": 1000, "scope": "gym", "date_range": {"start": "2026-03-01", "end": "2026-03-31"}}'::jsonb,
     NULL);

  -- 2e. Check-in count challenge — visit frequency
  INSERT INTO public.gym_challenges
    (gym_id, name, description, challenge_type, scoring_model,
     target_drops, reward_drops, start_date, end_date,
     is_active, criteria, tiers)
  VALUES
    (v_gym_id,
     'Gym Rat',
     'Check in 15 times this month. Show up, and the drops will follow.',
     'checkin_count', 'days_visited',
     15, 150,
     '2026-03-01', '2026-03-31',
     true,
     '{"type": "checkin_count", "operator": ">=", "value": 15, "scope": "gym", "date_range": {"start": "2026-03-01", "end": "2026-03-31"}}'::jsonb,
     NULL);

  RAISE NOTICE 'Vortex demo data seeded: 5 rewards + 5 challenges';
END;
$$;
