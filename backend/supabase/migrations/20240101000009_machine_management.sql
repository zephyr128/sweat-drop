-- Machine Management System
-- Creates machines table for better QR code and machine type management

-- 1. Create machines table
CREATE TABLE IF NOT EXISTS public.machines (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('treadmill', 'bike')) NOT NULL,
  unique_qr_code TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Add machine_id to sessions table
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_machines_gym_id ON public.machines(gym_id);
CREATE INDEX IF NOT EXISTS idx_machines_qr_code ON public.machines(unique_qr_code);
CREATE INDEX IF NOT EXISTS idx_machines_type ON public.machines(type);
CREATE INDEX IF NOT EXISTS idx_sessions_machine_id ON public.sessions(machine_id);

-- 4. Enable RLS
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for machines
-- Anyone can view active machines (for QR scanning) - same as equipment table
CREATE POLICY "Anyone can view active machines"
  ON public.machines FOR SELECT
  USING (is_active = true);

-- Gym admins can manage machines for their gym
CREATE POLICY "Gym admins can manage machines"
  ON public.machines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'gym_admin'
      AND profiles.admin_gym_id = machines.gym_id
    )
  );

-- Superadmins can manage all machines
CREATE POLICY "Superadmins can manage all machines"
  ON public.machines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- 6. Function to generate unique QR code
CREATE OR REPLACE FUNCTION public.generate_machine_qr_code()
RETURNS TEXT AS $$
DECLARE
  v_qr_code TEXT;
  v_exists BOOLEAN;
  v_attempts INTEGER := 0;
BEGIN
  LOOP
    v_attempts := v_attempts + 1;
    -- Generate a unique QR code (format: MACHINE-{UUID})
    v_qr_code := 'MACHINE-' || upper(substring(gen_random_uuid()::text from 1 for 8));
    
    -- Check if it already exists
    SELECT EXISTS(SELECT 1 FROM public.machines WHERE unique_qr_code = v_qr_code) INTO v_exists;
    
    -- Exit loop if unique or after 10 attempts
    EXIT WHEN NOT v_exists OR v_attempts >= 10;
  END LOOP;
  
  -- If still exists after attempts, append timestamp
  IF v_exists THEN
    v_qr_code := 'MACHINE-' || upper(substring(gen_random_uuid()::text from 1 for 8)) || '-' || to_char(EXTRACT(EPOCH FROM NOW())::bigint, 'FM9999999999');
  END IF;
  
  RETURN v_qr_code;
END;
$$ LANGUAGE plpgsql;

-- 7. Add comment
COMMENT ON TABLE public.machines IS 'Machines (treadmills and bikes) with unique QR codes for gym equipment management';
COMMENT ON COLUMN public.machines.unique_qr_code IS 'Unique QR code string used for scanning and identifying machines';
COMMENT ON COLUMN public.machines.type IS 'Machine type: treadmill or bike';
