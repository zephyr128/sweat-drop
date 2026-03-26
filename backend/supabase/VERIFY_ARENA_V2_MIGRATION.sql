-- Verification queries for Sweat Arenas v2 migration
-- Run these in Supabase SQL Editor after migration 20260306000001

-- 1. Verify arena_invitations table exists
SELECT 
  'arena_invitations table' as check_type,
  COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'arena_invitations';

-- 2. Verify new columns in sweat_arenas
SELECT 
  'sweat_arenas columns' as check_type,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sweat_arenas'
  AND column_name IN ('opt_in_type', 'opt_in_value', 'card_color', 'card_text_color', 'card_gradient_end')
ORDER BY column_name;

-- 3. Verify opt_in_drops_paid column in arena_participants
SELECT 
  'arena_participants.opt_in_drops_paid' as check_type,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'arena_participants'
  AND column_name = 'opt_in_drops_paid';

-- 4. Verify all new RPC functions exist
SELECT 
  'RPC Functions' as check_type,
  proname as function_name,
  pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'respond_to_arena_invitation',
    'send_arena_invitations',
    'cancel_arena',
    'get_arena_results'
  )
ORDER BY proname;

-- 5. Verify opt_into_arena() was updated (check for opt_in_drops_paid in function body)
SELECT 
  'opt_into_arena() update' as check_type,
  proname,
  pg_get_functiondef(oid) LIKE '%opt_in_drops_paid%' as has_opt_in_drops_paid,
  pg_get_functiondef(oid) LIKE '%opt_in_type%' as has_opt_in_type_check
FROM pg_proc
WHERE proname = 'opt_into_arena'
  AND pronamespace = 'public'::regnamespace;

-- 6. Verify get_available_arenas() returns new fields
SELECT 
  'get_available_arenas() return type' as check_type,
  proname,
  pg_get_function_result(oid) LIKE '%opt_in_type%' as has_opt_in_type,
  pg_get_function_result(oid) LIKE '%card_color%' as has_card_color,
  pg_get_function_result(oid) LIKE '%arena_status%' as has_arena_status
FROM pg_proc
WHERE proname = 'get_available_arenas'
  AND pronamespace = 'public'::regnamespace;

-- 7. Test get_available_arenas() with new fields (replace with your user_id)
-- SELECT * FROM public.get_available_arenas(auth.uid());

-- 8. Verify RLS policies on arena_invitations
SELECT 
  'arena_invitations RLS' as check_type,
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'arena_invitations'
ORDER BY policyname;

-- 9. Check existing arenas have default values
SELECT 
  'Existing arenas defaults' as check_type,
  COUNT(*) as total_arenas,
  COUNT(CASE WHEN opt_in_type IS NULL THEN 1 END) as null_opt_in_type,
  COUNT(CASE WHEN opt_in_value IS NULL THEN 1 END) as null_opt_in_value
FROM public.sweat_arenas;

-- 10. Check existing participants have opt_in_drops_paid = 0
SELECT 
  'Existing participants defaults' as check_type,
  COUNT(*) as total_participants,
  COUNT(CASE WHEN opt_in_drops_paid IS NULL THEN 1 END) as null_opt_in_drops_paid,
  COUNT(CASE WHEN opt_in_drops_paid = 0 THEN 1 END) as zero_opt_in_drops_paid
FROM public.arena_participants;
