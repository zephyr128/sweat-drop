-- Test script to verify dual-wallet system is working
-- Run this in Supabase SQL Editor after completing a workout

-- 1. Check if functions exist
SELECT 
    routine_name, 
    routine_type,
    pg_get_function_arguments(oid) as arguments
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('add_drops', 'end_session', 'get_or_create_gym_membership', 'spend_local_drops')
ORDER BY routine_name;

-- 2. Check if gym_memberships table exists
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'gym_memberships'
ORDER BY ordinal_position;

-- 3. Check recent sessions (replace with your user_id)
SELECT 
    id,
    user_id,
    gym_id,
    drops_earned,
    started_at,
    ended_at,
    is_active
FROM public.sessions
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check user's total drops (replace with your user_id)
SELECT 
    id,
    username,
    total_drops
FROM public.profiles
-- WHERE id = 'your-user-id-here'
ORDER BY total_drops DESC
LIMIT 10;

-- 5. Check gym memberships (replace with your user_id)
SELECT 
    gm.id,
    gm.user_id,
    gm.gym_id,
    g.name as gym_name,
    gm.local_drops_balance,
    gm.created_at,
    gm.updated_at
FROM public.gym_memberships gm
JOIN public.gyms g ON gm.gym_id = g.id
-- WHERE gm.user_id = 'your-user-id-here'
ORDER BY gm.updated_at DESC
LIMIT 10;

-- 6. Check recent drops transactions (replace with your user_id)
SELECT 
    id,
    user_id,
    amount,
    transaction_type,
    description,
    created_at
FROM public.drops_transactions
-- WHERE user_id = 'your-user-id-here'
ORDER BY created_at DESC
LIMIT 20;

-- 7. Test function manually (replace with actual values)
-- SELECT public.get_or_create_gym_membership('user-id', 'gym-id');

-- 8. Check if end_session function can find gym_id from session
-- SELECT user_id, gym_id FROM public.sessions WHERE id = 'session-id';
