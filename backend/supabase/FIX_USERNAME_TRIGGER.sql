-- Fix handle_new_user() to NOT assign random username
-- This allows users to set their username on the username screen

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULL,  -- Don't assign random username - let user set it on username screen
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: This will not affect existing users
-- Existing users with random usernames (starting with 'user_') will be redirected to username screen
-- based on the updated checkUsernameAndRedirect() logic in the mobile app
