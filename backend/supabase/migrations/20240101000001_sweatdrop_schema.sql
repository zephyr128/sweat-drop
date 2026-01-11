-- SweatDrop Schema
-- Drops-based fitness gamification system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE challenge_type AS ENUM ('daily', 'weekly', 'streak');
CREATE TYPE leaderboard_period AS ENUM ('daily', 'weekly', 'monthly');
CREATE TYPE leaderboard_scope AS ENUM ('gym', 'city', 'country');

-- Gyms table
CREATE TABLE public.gyms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Equipment table (machines with QR codes)
CREATE TABLE public.equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  qr_code TEXT UNIQUE NOT NULL,
  equipment_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  home_gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL,
  total_drops INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Sessions table (workout sessions)
CREATE TABLE public.sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  drops_earned INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Drops transactions table (audit trail)
CREATE TABLE public.drops_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL, -- positive for earned, negative for spent
  transaction_type TEXT NOT NULL, -- 'session', 'reward', 'challenge', 'bonus'
  reference_id UUID, -- session_id, reward_id, challenge_id, etc.
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Rewards table
CREATE TABLE public.rewards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  reward_type TEXT NOT NULL, -- 'coffee', 'protein', 'discount', 'merch'
  price_drops INTEGER NOT NULL,
  stock INTEGER, -- NULL = unlimited
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Redemptions table
CREATE TABLE public.redemptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reward_id UUID REFERENCES public.rewards(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  drops_spent INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'confirmed', 'cancelled'
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Challenges table
CREATE TABLE public.challenges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  challenge_type challenge_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  target_drops INTEGER NOT NULL,
  reward_drops INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- User challenge progress
CREATE TABLE public.challenge_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
  current_drops INTEGER DEFAULT 0 NOT NULL,
  is_completed BOOLEAN DEFAULT false NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, challenge_id)
);

-- Gym staff/admins (who can manage rewards, challenges, validate redemptions)
CREATE TABLE public.gym_staff (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'staff' NOT NULL, -- 'owner', 'admin', 'staff'
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, gym_id)
);

-- Indexes
CREATE INDEX idx_equipment_gym_id ON public.equipment(gym_id);
CREATE INDEX idx_equipment_qr_code ON public.equipment(qr_code);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_home_gym_id ON public.profiles(home_gym_id);
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_gym_id ON public.sessions(gym_id);
CREATE INDEX idx_sessions_started_at ON public.sessions(started_at DESC);
CREATE INDEX idx_sessions_is_active ON public.sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_drops_transactions_user_id ON public.drops_transactions(user_id);
CREATE INDEX idx_drops_transactions_created_at ON public.drops_transactions(created_at DESC);
CREATE INDEX idx_rewards_gym_id ON public.rewards(gym_id);
CREATE INDEX idx_rewards_is_active ON public.rewards(is_active) WHERE is_active = true;
CREATE INDEX idx_redemptions_user_id ON public.redemptions(user_id);
CREATE INDEX idx_redemptions_gym_id ON public.redemptions(gym_id);
CREATE INDEX idx_redemptions_status ON public.redemptions(status);
CREATE INDEX idx_challenges_gym_id ON public.challenges(gym_id);
CREATE INDEX idx_challenges_is_active ON public.challenges(is_active) WHERE is_active = true;
CREATE INDEX idx_challenge_progress_user_id ON public.challenge_progress(user_id);
CREATE INDEX idx_challenge_progress_challenge_id ON public.challenge_progress(challenge_id);
CREATE INDEX idx_gym_staff_user_id ON public.gym_staff(user_id);
CREATE INDEX idx_gym_staff_gym_id ON public.gym_staff(gym_id);

-- Enable Row Level Security
ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drops_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_staff ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gyms
CREATE POLICY "Anyone can view gyms"
  ON public.gyms FOR SELECT
  USING (true);

-- RLS Policies for equipment
CREATE POLICY "Anyone can view active equipment"
  ON public.equipment FOR SELECT
  USING (is_active = true);

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view other profiles (for leaderboards)"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for sessions
CREATE POLICY "Users can view own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for drops_transactions
CREATE POLICY "Users can view own drops transactions"
  ON public.drops_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for rewards
CREATE POLICY "Anyone can view active rewards"
  ON public.rewards FOR SELECT
  USING (is_active = true);

CREATE POLICY "Gym staff can manage rewards"
  ON public.rewards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_staff.user_id = auth.uid()
      AND gym_staff.gym_id = rewards.gym_id
    )
  );

-- RLS Policies for redemptions
CREATE POLICY "Users can view own redemptions"
  ON public.redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create redemptions"
  ON public.redemptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Gym staff can view redemptions for their gym"
  ON public.redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_staff.user_id = auth.uid()
      AND gym_staff.gym_id = redemptions.gym_id
    )
  );

CREATE POLICY "Gym staff can update redemptions for their gym"
  ON public.redemptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_staff.user_id = auth.uid()
      AND gym_staff.gym_id = redemptions.gym_id
    )
  );

-- RLS Policies for challenges
CREATE POLICY "Anyone can view active challenges"
  ON public.challenges FOR SELECT
  USING (is_active = true);

CREATE POLICY "Gym staff can manage challenges"
  ON public.challenges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_staff.user_id = auth.uid()
      AND gym_staff.gym_id = challenges.gym_id
    )
  );

-- RLS Policies for challenge_progress
CREATE POLICY "Users can view own challenge progress"
  ON public.challenge_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenge progress"
  ON public.challenge_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own challenge progress"
  ON public.challenge_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for gym_staff
CREATE POLICY "Users can view gym staff for their gym"
  ON public.gym_staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.user_id = auth.uid()
      AND gs.gym_id = gym_staff.gym_id
    )
  );

-- Functions

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_gyms
  BEFORE UPDATE ON public.gyms
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_equipment
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_sessions
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_rewards
  BEFORE UPDATE ON public.rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_redemptions
  BEFORE UPDATE ON public.redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_challenges
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_challenge_progress
  BEFORE UPDATE ON public.challenge_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to add drops and update profile total
CREATE OR REPLACE FUNCTION public.add_drops(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Update profile total
  UPDATE public.profiles
  SET total_drops = total_drops + p_amount
  WHERE id = p_user_id;

  -- Insert transaction record
  INSERT INTO public.drops_transactions (user_id, amount, transaction_type, reference_id, description)
  VALUES (p_user_id, p_amount, p_transaction_type, p_reference_id, p_description);

  -- Update challenge progress
  UPDATE public.challenge_progress cp
  SET current_drops = current_drops + p_amount,
      updated_at = NOW()
  FROM public.challenges c
  WHERE cp.challenge_id = c.id
    AND cp.user_id = p_user_id
    AND c.is_active = true
    AND c.start_date <= CURRENT_DATE
    AND c.end_date >= CURRENT_DATE
    AND cp.is_completed = false;

  -- Mark completed challenges
  UPDATE public.challenge_progress cp
  SET is_completed = true,
      completed_at = NOW(),
      updated_at = NOW()
  FROM public.challenges c
  WHERE cp.challenge_id = c.id
    AND cp.user_id = p_user_id
    AND cp.is_completed = false
    AND cp.current_drops >= c.target_drops;

  -- Award challenge rewards
  INSERT INTO public.drops_transactions (user_id, amount, transaction_type, reference_id, description)
  SELECT cp.user_id, c.reward_drops, 'challenge', c.id, 'Challenge reward: ' || c.name
  FROM public.challenge_progress cp
  JOIN public.challenges c ON cp.challenge_id = c.id
  WHERE cp.user_id = p_user_id
    AND cp.is_completed = true
    AND cp.completed_at = NOW()
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to end session and calculate drops
CREATE OR REPLACE FUNCTION public.end_session(
  p_session_id UUID,
  p_drops_earned INTEGER
)
RETURNS void AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user_id from session
  SELECT user_id INTO v_user_id
  FROM public.sessions
  WHERE id = p_session_id;

  -- Update session
  UPDATE public.sessions
  SET ended_at = NOW(),
      duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
      drops_earned = p_drops_earned,
      is_active = false,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Add drops
  PERFORM public.add_drops(
    v_user_id,
    p_drops_earned,
    'session',
    p_session_id,
    'Workout session'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
