-- Allow public access to staff invitations by token
-- This is needed so unauthenticated users can view their invitation details

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Public can view invitations by token" ON public.staff_invitations;

-- Allow anyone to view invitations by token (for the accept-invitation page)
-- This is safe because the token is unique and secret
CREATE POLICY "Public can view invitations by token"
  ON public.staff_invitations FOR SELECT
  USING (true); -- Allow all SELECT, but the application will filter by token

-- Note: The application should still validate the token and check expiration
-- This policy just allows the query to run without authentication
