-- Fix gym_floor_config gym_admin policy: honor assigned_gym_id as well as admin_gym_id.
-- Staff created via the admin panel typically use assigned_gym_id; older rows may use admin_gym_id only.
-- Pattern matches e.g. 20260327000005_happy_hour_drop_boost_rules.sql.

DROP POLICY IF EXISTS "Gym admins can manage their gym floor config" ON public.gym_floor_config;

CREATE POLICY "Gym admins can manage their gym floor config"
  ON public.gym_floor_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'gym_admin'
        AND (
          profiles.admin_gym_id = gym_floor_config.gym_id
          OR profiles.assigned_gym_id = gym_floor_config.gym_id
        )
    )
  );
