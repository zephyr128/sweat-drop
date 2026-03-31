-- Ensure uuid_generate_v4() is available in public schema
-- On newer Supabase projects, uuid-ossp lives in extensions schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create wrapper function if extension is in a different schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'uuid_generate_v4' AND n.nspname = 'public'
  ) THEN
    CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
    RETURNS uuid LANGUAGE sql AS 'SELECT extensions.uuid_generate_v4()';
  END IF;
END;
$$;

-- Note: ALTER DATABASE SET "app.jwt_secret" removed — not supported on hosted Supabase

-- Legacy tables and policies from initial prototype are skipped here.
-- Migration 20240101000001_sweatdrop_schema.sql creates the actual production schema.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
