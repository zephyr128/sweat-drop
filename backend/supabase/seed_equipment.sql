-- Seed equipment for all existing gyms
-- This creates default equipment for each gym so users can start workouts

-- Insert equipment for each gym
-- Equipment types: 'cardio', 'strength', 'functional', 'other'

-- For Elite Fitness Center (New York)
INSERT INTO public.equipment (gym_id, name, qr_code, equipment_type, is_active)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Treadmill #1',
    'ELITE-TREADMILL-001',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Treadmill #2',
    'ELITE-TREADMILL-002',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Elliptical #1',
    'ELITE-ELLIPTICAL-001',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Bench Press #1',
    'ELITE-BENCH-001',
    'strength',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Squat Rack #1',
    'ELITE-SQUAT-001',
    'strength',
    true
  )
ON CONFLICT (qr_code) DO NOTHING;

-- For Power Gym (Los Angeles)
INSERT INTO public.equipment (gym_id, name, qr_code, equipment_type, is_active)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Treadmill #1',
    'POWER-TREADMILL-001',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Rowing Machine #1',
    'POWER-ROWING-001',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Leg Press #1',
    'POWER-LEGPRESS-001',
    'strength',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Cable Machine #1',
    'POWER-CABLE-001',
    'strength',
    true
  )
ON CONFLICT (qr_code) DO NOTHING;

-- For Zenith Athletics (Chicago)
INSERT INTO public.equipment (gym_id, name, qr_code, equipment_type, is_active)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'Treadmill #1',
    'ZENITH-TREADMILL-001',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'Bike #1',
    'ZENITH-BIKE-001',
    'cardio',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'Smith Machine #1',
    'ZENITH-SMITH-001',
    'strength',
    true
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'Free Weights Area',
    'ZENITH-WEIGHTS-001',
    'strength',
    true
  )
ON CONFLICT (qr_code) DO NOTHING;

-- Create default equipment for any other gyms that don't have equipment
-- This ensures every gym has at least one piece of equipment
INSERT INTO public.equipment (gym_id, name, qr_code, equipment_type, is_active)
SELECT 
  g.id,
  'Default Equipment',
  'GYM-' || UPPER(SUBSTRING(g.id::TEXT, 1, 8)) || '-DEFAULT-001',
  'cardio',
  true
FROM public.gyms g
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.equipment e 
  WHERE e.gym_id = g.id AND e.is_active = true
)
ON CONFLICT (qr_code) DO NOTHING;

-- Verify equipment was created
SELECT 
  g.name as gym_name,
  e.name as equipment_name,
  e.qr_code,
  e.equipment_type,
  e.is_active
FROM public.equipment e
JOIN public.gyms g ON e.gym_id = g.id
ORDER BY g.name, e.name;
