# Plan: Hibridni Sistem Gejmifikacije
## Global Achievements + Custom Gym Challenges

**Kreirano:** 2025-01-28  
**Status:** Draft  
**Cilj:** Implementacija hibridnog sistema koji kombinuje fiksne globalne bedževe sa custom izazovima koje kreiraju vlasnici teretana

---

## Pregled Arhitekture

### Konceptualni Model

```
┌─────────────────────────────────────────────────────────────┐
│                    GAMIFICATION ENGINE                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐      ┌──────────────────────┐     │
│  │ Global Achievements  │      │  Gym Challenges      │     │
│  │ (Fiksni, naši)      │      │  (Custom, vlasnik)   │     │
│  │                      │      │                      │     │
│  │ - 1000 Drops         │      │ - "3 treninga/7 dana"│     │
│  │ - 10 Day Streak      │      │ - "50km Cardio"      │     │
│  │ - First Workout      │      │ - "Gym Specific"     │     │
│  └──────────────────────┘      └──────────────────────┘     │
│           │                              │                    │
│           └──────────┬───────────────────┘                    │
│                      │                                        │
│           ┌──────────▼──────────┐                            │
│           │  Criteria Engine    │                            │
│           │  (JSONB evaluator) │                            │
│           └──────────┬──────────┘                            │
│                      │                                        │
│           ┌──────────▼──────────┐                            │
│           │  user_progress      │                            │
│           │  (Unified tracking) │                            │
│           └──────────┬──────────┘                            │
│                      │                                        │
│           ┌──────────▼──────────┐                            │
│           │  user_badges        │                            │
│           │  (Permanent storage)│                            │
│           └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Ključne Razlike

| Aspekt | Global Achievements | Gym Challenges |
|--------|-------------------|----------------|
| **Kreira** | SweatDrop Team | Gym Owner |
| **Scope** | Svi korisnici | Specifična teretana |
| **Tip** | Fiksni, unapred definisani | Custom, fleksibilni |
| **Storage** | CDN (public assets) | Supabase Storage (scoped) |
| **Criteria** | Jednostavni (drops, streak) | Kompleksni (JSONB) |
| **Badge Image** | Global URL | Gym-scoped bucket |

---

## Faza 1: Data Modeling (Backend Agent)

**Workspace:** `backend/supabase/`  
**Agent Role:** Supabase DBA  
**Procenjeno vreme:** 4-5 sati

### Korak 1.1: Kreiranje `global_achievements` tabele

**Zadatak:**
Kreirati tabelu za fiksne globalne bedževe koje definiše SweatDrop tim.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_global_achievements.sql

-- Create global_achievements table
CREATE TABLE IF NOT EXISTS public.global_achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- e.g., 'first_workout', 'thousand_drops', 'ten_day_streak'
  name TEXT NOT NULL,
  description TEXT,
  badge_image_url TEXT NOT NULL, -- CDN URL to badge image
  criteria JSONB NOT NULL, -- Flexible criteria structure (see Criteria System section)
  reward_drops INTEGER DEFAULT 0 NOT NULL, -- Optional drops reward
  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0, -- For sorting in Trophy Room
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_global_achievements_code ON public.global_achievements(code);
CREATE INDEX IF NOT EXISTS idx_global_achievements_is_active ON public.global_achievements(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_global_achievements_display_order ON public.global_achievements(display_order);

-- Comments
COMMENT ON TABLE public.global_achievements IS 'Fixed global achievements defined by SweatDrop team. These are available to all users across all gyms.';
COMMENT ON COLUMN public.global_achievements.code IS 'Unique identifier for the achievement (e.g., first_workout, thousand_drops). Used for programmatic checks.';
COMMENT ON COLUMN public.global_achievements.criteria IS 'JSONB structure defining achievement conditions (see Criteria System documentation).';
COMMENT ON COLUMN public.global_achievements.badge_image_url IS 'CDN URL to badge image. Should be hosted on public CDN (e.g., Cloudflare, AWS CloudFront).';
```

**RLS Policies:**
```sql
-- Enable RLS
ALTER TABLE public.global_achievements ENABLE ROW LEVEL SECURITY;

-- Everyone can view active global achievements
CREATE POLICY "Anyone can view active global achievements"
  ON public.global_achievements FOR SELECT
  USING (is_active = true);

-- Only superadmin can manage global achievements
CREATE POLICY "Superadmin can manage global achievements"
  ON public.global_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );
```

**Uspeh kriterijum:**
- Tabela `global_achievements` postoji sa svim poljima
- RLS policies su aktivne
- Superadmin može da kreira/uređuje globalne achievement-e

---

### Korak 1.2: Refaktorisanje `challenges` tabele (Rename to `gym_challenges`)

**Zadatak:**
Rename `challenges` u `gym_challenges` radi jasnog razdvajanja od globalnih achievement-a.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_rename_challenges_to_gym_challenges.sql

-- Step 1: Rename table
ALTER TABLE public.challenges RENAME TO gym_challenges;

-- Step 2: Update all foreign key references
-- Note: PostgreSQL will automatically update foreign keys, but we need to update:
-- - challenge_progress.challenge_id
-- - user_badges.challenge_id (if it references challenges)

-- Step 3: Update indexes
ALTER INDEX IF EXISTS idx_challenges_gym_id RENAME TO idx_gym_challenges_gym_id;
ALTER INDEX IF EXISTS idx_challenges_is_active RENAME TO idx_gym_challenges_is_active;

-- Step 4: Update comments
COMMENT ON TABLE public.gym_challenges IS 'Custom challenges created by gym owners. These are gym-specific and can have flexible criteria defined via JSONB.';
```

**Uspeh kriterijum:**
- Tabela je preimenovana u `gym_challenges`
- Svi foreign key-ovi su validni
- Postojeći kod koji koristi `challenges` mora biti ažuriran (videti Korak 1.3)

---

### Korak 1.3: Dodavanje `criteria` JSONB polja u `gym_challenges`

**Zadatak:**
Dodati `criteria` JSONB polje u `gym_challenges` za fleksibilne uslove (zamenjuje rigidne `challenge_type` i `target_drops`).

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_add_criteria_to_gym_challenges.sql

-- Step 1: Add criteria column
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS criteria JSONB;

-- Step 2: Migrate existing data to criteria format
-- Convert challenge_type + target_drops to criteria JSONB
UPDATE public.gym_challenges
SET criteria = jsonb_build_object(
  'type', challenge_type::text,
  'target', CASE
    WHEN challenge_type = 'daily' OR challenge_type = 'weekly' OR challenge_type = 'monthly' THEN target_drops
    WHEN challenge_type = 'streak' THEN streak_days
    WHEN challenge_type = 'milestone' THEN milestone_threshold
    ELSE NULL
  END
)
WHERE criteria IS NULL;

-- Step 3: Make criteria NOT NULL after migration
ALTER TABLE public.gym_challenges
  ALTER COLUMN criteria SET NOT NULL;

-- Step 4: Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_gym_challenges_criteria ON public.gym_challenges USING GIN (criteria);

-- Step 5: Add comment
COMMENT ON COLUMN public.gym_challenges.criteria IS 'JSONB structure defining challenge conditions. See Criteria System documentation for schema.';
```

**Uspeh kriterijum:**
- `criteria` polje postoji i nije NULL
- Postojeći podaci su migrirani u JSONB format
- Index je kreiran za brže JSONB upite

---

### Korak 1.4: Kreiranje `user_progress` tabele (Unified Tracking)

**Zadatak:**
Kreirati jedinstvenu tabelu koja prati napredak korisnika za i globalne achievement-e i gym challenge-e.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_user_progress.sql

-- Create user_progress table (unified progress tracking)
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Polymorphic reference: either global_achievement_id OR gym_challenge_id
  global_achievement_id UUID REFERENCES public.global_achievements(id) ON DELETE CASCADE,
  gym_challenge_id UUID REFERENCES public.gym_challenges(id) ON DELETE CASCADE,
  
  -- Progress data (JSONB for flexibility)
  progress_data JSONB DEFAULT '{}'::jsonb NOT NULL, -- e.g., {"drops": 500, "streak_days": 3, "sessions": 2}
  
  -- Completion status
  is_completed BOOLEAN DEFAULT false NOT NULL,
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Constraints: exactly one of global_achievement_id or gym_challenge_id must be set
  CONSTRAINT user_progress_exactly_one_reference CHECK (
    (global_achievement_id IS NOT NULL AND gym_challenge_id IS NULL) OR
    (global_achievement_id IS NULL AND gym_challenge_id IS NOT NULL)
  ),
  
  -- Unique constraint: user can only have one progress record per achievement/challenge
  UNIQUE(user_id, global_achievement_id, gym_challenge_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_global_achievement_id ON public.user_progress(global_achievement_id) WHERE global_achievement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_progress_gym_challenge_id ON public.user_progress(gym_challenge_id) WHERE gym_challenge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_progress_is_completed ON public.user_progress(is_completed) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_user_progress_progress_data ON public.user_progress USING GIN (progress_data);

-- Enable RLS
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own progress
CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view other users' progress for global achievements (for leaderboards)
CREATE POLICY "Users can view global achievement progress"
  ON public.user_progress FOR SELECT
  USING (global_achievement_id IS NOT NULL);

-- Gym admins can view progress for their gym's challenges
CREATE POLICY "Gym admins can view gym challenge progress"
  ON public.user_progress FOR SELECT
  USING (
    gym_challenge_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.gym_challenges gc
      JOIN public.gym_staff gs ON gc.gym_id = gs.gym_id
      WHERE gc.id = gym_challenge_id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
    )
  );

-- Backend functions can insert/update progress (via SECURITY DEFINER)
CREATE POLICY "Backend can manage progress"
  ON public.user_progress FOR ALL
  WITH CHECK (true); -- SECURITY DEFINER functions handle authorization

-- Comments
COMMENT ON TABLE public.user_progress IS 'Unified progress tracking for both global achievements and gym challenges. Uses polymorphic references (either global_achievement_id or gym_challenge_id).';
COMMENT ON COLUMN public.user_progress.progress_data IS 'JSONB structure storing progress metrics. Schema varies by achievement/challenge type (e.g., {"drops": 500} for drops-based, {"streak_days": 3} for streak).';
```

**Uspeh kriterijum:**
- Tabela `user_progress` postoji sa svim poljima
- Constraint osigurava da je tačno jedan od `global_achievement_id` ili `gym_challenge_id` postavljen
- RLS policies su aktivne
- Indexi su kreirani za performanse

---

### Korak 1.5: Ažuriranje `user_badges` tabele (Polymorphic References)

**Zadatak:**
Ažurirati `user_badges` tabelu da podržava i globalne achievement-e i gym challenge-e.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_update_user_badges_polymorphic.sql

-- Step 1: Add new columns for polymorphic references
ALTER TABLE public.user_badges
  ADD COLUMN IF NOT EXISTS global_achievement_id UUID REFERENCES public.global_achievements(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gym_challenge_id UUID REFERENCES public.gym_challenges(id) ON DELETE CASCADE;

-- Step 2: Migrate existing data (challenge_id -> gym_challenge_id)
UPDATE public.user_badges
SET gym_challenge_id = challenge_id
WHERE gym_challenge_id IS NULL AND challenge_id IS NOT NULL;

-- Step 3: Add constraint: exactly one reference must be set
ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_exactly_one_reference CHECK (
    (global_achievement_id IS NOT NULL AND gym_challenge_id IS NULL) OR
    (global_achievement_id IS NULL AND gym_challenge_id IS NOT NULL)
  );

-- Step 4: Update unique constraint
ALTER TABLE public.user_badges
  DROP CONSTRAINT IF EXISTS user_badges_user_id_challenge_id_key;

ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_unique_per_user_and_achievement UNIQUE (user_id, global_achievement_id, gym_challenge_id);

-- Step 5: Drop old challenge_id column (after migration)
-- Note: Do this carefully - ensure all data is migrated first
-- ALTER TABLE public.user_badges DROP COLUMN IF EXISTS challenge_id;

-- Step 6: Add indexes
CREATE INDEX IF NOT EXISTS idx_user_badges_global_achievement_id ON public.user_badges(global_achievement_id) WHERE global_achievement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_badges_gym_challenge_id ON public.user_badges(gym_challenge_id) WHERE gym_challenge_id IS NOT NULL;

-- Step 7: Update comments
COMMENT ON TABLE public.user_badges IS 'Permanent badge storage. Supports both global achievements and gym challenges via polymorphic references.';
```

**Uspeh kriterijum:**
- `user_badges` tabela ima `global_achievement_id` i `gym_challenge_id` polja
- Postojeći podaci su migrirani
- Constraint osigurava tačno jedan reference
- Unique constraint sprečava duplikate

---

## Faza 2: Criteria System (Backend Agent)

**Workspace:** `backend/supabase/`  
**Agent Role:** Supabase DBA / Backend Developer  
**Procenjeno vreme:** 3-4 sata

### Korak 2.1: Definicija JSONB Criteria Schema

**Zadatak:**
Definisati fleksibilnu JSONB strukturu za evaluaciju uslova achievement-a i challenge-a.

**Criteria Schema Dokumentacija:**

```typescript
// TypeScript type definition (for reference, not SQL)
type Criteria = {
  type: 'drops' | 'streak' | 'sessions' | 'distance' | 'duration' | 'custom';
  operator: '>=' | '<=' | '==' | '>' | '<';
  value: number;
  
  // Optional filters
  scope?: 'global' | 'gym' | 'machine_type';
  gym_id?: UUID; // For gym-scoped criteria
  machine_type?: string; // For machine-specific criteria
  date_range?: {
    start: string; // ISO date
    end: string; // ISO date
  };
  
  // For complex criteria (AND/OR logic)
  logic?: 'AND' | 'OR';
  conditions?: Criteria[]; // Nested criteria
};
```

**Primeri Criteria JSONB:**

```json
// Example 1: Simple drops-based achievement
{
  "type": "drops",
  "operator": ">=",
  "value": 1000,
  "scope": "global"
}

// Example 2: Streak achievement
{
  "type": "streak",
  "operator": ">=",
  "value": 10,
  "scope": "global"
}

// Example 3: Gym-specific challenge (3 workouts in 7 days)
{
  "type": "sessions",
  "operator": ">=",
  "value": 3,
  "scope": "gym",
  "gym_id": "550e8400-e29b-41d4-a716-446655440001",
  "date_range": {
    "start": "2025-01-21",
    "end": "2025-01-28"
  }
}

// Example 4: Cardio distance challenge (50km on cardio machines)
{
  "type": "distance",
  "operator": ">=",
  "value": 50000, // meters
  "scope": "gym",
  "gym_id": "550e8400-e29b-41d4-a716-446655440001",
  "machine_type": "cardio"
}

// Example 5: Complex AND logic (3 workouts AND 1000 drops in a week)
{
  "logic": "AND",
  "conditions": [
    {
      "type": "sessions",
      "operator": ">=",
      "value": 3,
      "scope": "gym",
      "gym_id": "550e8400-e29b-41d4-a716-446655440001",
      "date_range": {
        "start": "2025-01-21",
        "end": "2025-01-28"
      }
    },
    {
      "type": "drops",
      "operator": ">=",
      "value": 1000,
      "scope": "gym",
      "gym_id": "550e8400-e29b-41d4-a716-446655440001",
      "date_range": {
        "start": "2025-01-21",
        "end": "2025-01-28"
      }
    }
  ]
}
```

**SQL Funkcija za Validaciju Criteria:**

```sql
-- File: migrations/YYYYMMDDHHMMSS_create_validate_criteria_function.sql

CREATE OR REPLACE FUNCTION public.validate_criteria(p_criteria JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type TEXT;
  v_operator TEXT;
  v_value NUMERIC;
  v_logic TEXT;
  v_conditions JSONB;
BEGIN
  -- Check if it's a simple criteria or complex (with logic)
  IF p_criteria ? 'logic' THEN
    -- Complex criteria: validate all conditions
    v_logic := p_criteria->>'logic';
    IF v_logic NOT IN ('AND', 'OR') THEN
      RETURN false;
    END IF;
    
    v_conditions := p_criteria->'conditions';
    IF jsonb_array_length(v_conditions) < 2 THEN
      RETURN false; -- Need at least 2 conditions for AND/OR
    END IF;
    
    -- Recursively validate each condition
    FOR i IN 0..jsonb_array_length(v_conditions) - 1 LOOP
      IF NOT public.validate_criteria(v_conditions->i) THEN
        RETURN false;
      END IF;
    END LOOP;
    
    RETURN true;
  ELSE
    -- Simple criteria: validate required fields
    v_type := p_criteria->>'type';
    v_operator := p_criteria->>'operator';
    v_value := (p_criteria->>'value')::NUMERIC;
    
    -- Validate type
    IF v_type NOT IN ('drops', 'streak', 'sessions', 'distance', 'duration', 'custom') THEN
      RETURN false;
    END IF;
    
    -- Validate operator
    IF v_operator NOT IN ('>=', '<=', '==', '>', '<') THEN
      RETURN false;
    END IF;
    
    -- Validate value is numeric and positive
    IF v_value IS NULL OR v_value < 0 THEN
      RETURN false;
    END IF;
    
    RETURN true;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.validate_criteria IS 'Validates criteria JSONB structure. Returns true if criteria is valid, false otherwise.';
```

**Uspeh kriterijum:**
- Criteria schema je dokumentovana
- Validaciona funkcija postoji i radi
- Primeri criteria JSONB su testirani

---

### Korak 2.2: Kreiranje `evaluate_criteria()` Funkcije

**Zadatak:**
Kreirati SQL funkciju koja evaluira criteria protiv korisničkog progress-a.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_evaluate_criteria_function.sql

CREATE OR REPLACE FUNCTION public.evaluate_criteria(
  p_user_id UUID,
  p_criteria JSONB,
  p_gym_id UUID DEFAULT NULL -- Optional gym context
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_type TEXT;
  v_operator TEXT;
  v_value NUMERIC;
  v_scope TEXT;
  v_target_gym_id UUID;
  v_machine_type TEXT;
  v_date_start DATE;
  v_date_end DATE;
  v_logic TEXT;
  v_conditions JSONB;
  v_condition_result BOOLEAN;
  v_actual_value NUMERIC;
  v_result BOOLEAN;
BEGIN
  -- Check if it's complex criteria (with logic)
  IF p_criteria ? 'logic' THEN
    v_logic := p_criteria->>'logic';
    v_conditions := p_criteria->'conditions';
    v_result := (v_logic = 'AND'); -- Start with true for AND, false for OR
    
    -- Evaluate each condition
    FOR i IN 0..jsonb_array_length(v_conditions) - 1 LOOP
      v_condition_result := public.evaluate_criteria(
        p_user_id,
        v_conditions->i,
        p_gym_id
      );
      
      IF v_logic = 'AND' THEN
        v_result := v_result AND v_condition_result;
        IF NOT v_result THEN
          RETURN false; -- Short-circuit for AND
        END IF;
      ELSE -- OR
        v_result := v_result OR v_condition_result;
        IF v_result THEN
          RETURN true; -- Short-circuit for OR
        END IF;
      END IF;
    END LOOP;
    
    RETURN v_result;
  END IF;
  
  -- Simple criteria evaluation
  v_type := p_criteria->>'type';
  v_operator := p_criteria->>'operator';
  v_value := (p_criteria->>'value')::NUMERIC;
  v_scope := COALESCE(p_criteria->>'scope', 'global');
  v_target_gym_id := (p_criteria->>'gym_id')::UUID;
  v_machine_type := p_criteria->>'machine_type';
  v_date_start := (p_criteria->'date_range'->>'start')::DATE;
  v_date_end := (p_criteria->'date_range'->>'end')::DATE;
  
  -- Get actual value based on type
  CASE v_type
    WHEN 'drops' THEN
      IF v_scope = 'global' THEN
        SELECT COALESCE(total_drops, 0) INTO v_actual_value
        FROM public.profiles WHERE id = p_user_id;
      ELSIF v_scope = 'gym' THEN
        SELECT COALESCE(local_drops_balance, 0) INTO v_actual_value
        FROM public.gym_memberships
        WHERE user_id = p_user_id
          AND gym_id = COALESCE(v_target_gym_id, p_gym_id);
      END IF;
      
    WHEN 'streak' THEN
      -- Calculate current streak (consecutive days with at least 1 drop)
      WITH streak_data AS (
        SELECT DATE(created_at) as workout_date
        FROM public.drops_transactions
        WHERE user_id = p_user_id
          AND amount > 0
          AND transaction_type = 'session'
        GROUP BY DATE(created_at)
        ORDER BY workout_date DESC
      )
      SELECT COUNT(*) INTO v_actual_value
      FROM (
        SELECT workout_date,
               workout_date - ROW_NUMBER() OVER (ORDER BY workout_date)::INTEGER as streak_group
        FROM streak_data
      ) grouped
      GROUP BY streak_group
      ORDER BY COUNT(*) DESC
      LIMIT 1;
      
    WHEN 'sessions' THEN
      SELECT COUNT(*) INTO v_actual_value
      FROM public.sessions
      WHERE user_id = p_user_id
        AND (v_target_gym_id IS NULL OR gym_id = v_target_gym_id)
        AND (v_date_start IS NULL OR DATE(started_at) >= v_date_start)
        AND (v_date_end IS NULL OR DATE(started_at) <= v_date_end);
        
    WHEN 'distance' THEN
      -- Note: This requires distance data in sessions or workout_metrics
      -- For now, return 0 if distance tracking is not implemented
      SELECT COALESCE(SUM(distance_meters), 0) INTO v_actual_value
      FROM public.workout_metrics wm
      JOIN public.workouts w ON wm.workout_id = w.id
      WHERE w.user_id = p_user_id
        AND (v_machine_type IS NULL OR w.workout_type = v_machine_type)
        AND (v_date_start IS NULL OR DATE(w.started_at) >= v_date_start)
        AND (v_date_end IS NULL OR DATE(w.started_at) <= v_date_end);
        
    WHEN 'duration' THEN
      SELECT COALESCE(SUM(duration_seconds), 0) INTO v_actual_value
      FROM public.sessions
      WHERE user_id = p_user_id
        AND (v_target_gym_id IS NULL OR gym_id = v_target_gym_id)
        AND (v_date_start IS NULL OR DATE(started_at) >= v_date_start)
        AND (v_date_end IS NULL OR DATE(started_at) <= v_date_end);
        
    ELSE
      RETURN false; -- Unknown type
  END CASE;
  
  -- Evaluate operator
  CASE v_operator
    WHEN '>=' THEN RETURN v_actual_value >= v_value;
    WHEN '<=' THEN RETURN v_actual_value <= v_value;
    WHEN '==' THEN RETURN v_actual_value = v_value;
    WHEN '>' THEN RETURN v_actual_value > v_value;
    WHEN '<' THEN RETURN v_actual_value < v_value;
    ELSE RETURN false;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.evaluate_criteria IS 'Evaluates criteria JSONB against user progress. Returns true if criteria is met, false otherwise.';
```

**Uspeh kriterijum:**
- Funkcija `evaluate_criteria()` postoji i radi
- Podržava sve tipove criteria (drops, streak, sessions, distance, duration)
- Podržava AND/OR logiku za kompleksne criteria
- Testirana sa različitim scenarijima

---

## Faza 3: Storage Strategy (Backend Agent)

**Workspace:** `backend/supabase/`  
**Agent Role:** Supabase DBA / DevOps  
**Procenjeno vreme:** 2-3 sata

### Korak 3.1: Supabase Storage Bucket Setup

**Zadatak:**
Kreirati Supabase Storage bucket za custom badge slike (gym-scoped).

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_badge_storage_bucket.sql

-- Note: Supabase Storage buckets are created via SQL, but file uploads are done via API
-- This migration creates the bucket and policies

-- Create bucket for gym challenge badges
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gym-challenge-badges',
  'gym-challenge-badges',
  true, -- Public bucket (badges should be publicly accessible)
  5242880, -- 5MB limit per file
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for gym-challenge-badges bucket

-- Anyone can view badges (public bucket)
CREATE POLICY "Anyone can view gym challenge badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-challenge-badges');

-- Gym admins can upload badges for their gym
CREATE POLICY "Gym admins can upload badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gym-challenge-badges' AND
    (storage.foldername(name))[1] = ( -- Extract gym_id from folder path
      SELECT g.id::TEXT
      FROM public.gyms g
      JOIN public.gym_staff gs ON g.id = gs.gym_id
      WHERE gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
      LIMIT 1
    )
  );

-- Gym admins can update/delete their gym's badges
CREATE POLICY "Gym admins can manage badges"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    (storage.foldername(name))[1] = (
      SELECT g.id::TEXT
      FROM public.gyms g
      JOIN public.gym_staff gs ON g.id = gs.gym_id
      WHERE gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
      LIMIT 1
    )
  );

CREATE POLICY "Gym admins can delete badges"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gym-challenge-badges' AND
    (storage.foldername(name))[1] = (
      SELECT g.id::TEXT
      FROM public.gyms g
      JOIN public.gym_staff gs ON g.id = gs.gym_id
      WHERE gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
      LIMIT 1
    )
  );
```

**Storage Path Structure:**
```
gym-challenge-badges/
  ├── {gym_id}/
  │   ├── challenge-{challenge_id}-badge.png
  │   ├── challenge-{challenge_id}-badge.jpg
  │   └── ...
  └── ...
```

**Public URL Format:**
```
https://{supabase_project_id}.supabase.co/storage/v1/object/public/gym-challenge-badges/{gym_id}/challenge-{challenge_id}-badge.png
```

**Uspeh kriterijum:**
- Bucket `gym-challenge-badges` postoji
- Storage policies su aktivne
- Gym admins mogu da upload-uju slike samo u svoj gym folder
- Public access radi za čitanje

---

### Korak 3.2: CDN Setup za Global Achievements

**Zadatak:**
Dokumentovati CDN setup za globalne achievement badge slike.

**Dokumentacija:**
```markdown
# Global Achievements CDN Setup

## Option 1: Supabase Storage (Public Bucket)
- Bucket: `global-achievement-badges`
- Public: true
- Path: `global-achievement-badges/{achievement_code}-badge.png`

## Option 2: External CDN (Recommended for Production)
- Use Cloudflare, AWS CloudFront, or similar
- Upload badge images to CDN
- Store CDN URLs in `global_achievements.badge_image_url`

## Badge Image Requirements
- Format: PNG, JPEG, or WebP
- Size: 256x256px (recommended)
- File size: < 100KB (optimized)
- Naming: `{achievement_code}-badge.{ext}`
```

**SQL Migracija (ako koristimo Supabase Storage):**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_global_achievement_badges_bucket.sql

-- Create bucket for global achievement badges
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'global-achievement-badges',
  'global-achievement-badges',
  true,
  1048576, -- 1MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Only superadmin can upload global achievement badges
CREATE POLICY "Superadmin can upload global badges"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'global-achievement-badges' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Anyone can view global badges
CREATE POLICY "Anyone can view global badges"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'global-achievement-badges');
```

**Uspeh kriterijum:**
- CDN setup je dokumentovan
- Supabase Storage bucket postoji (ako koristimo Supabase)
- Superadmin može da upload-uje globalne badge slike

---

## Faza 4: Edge Worker Strategy (Backend Agent)

**Workspace:** `backend/supabase/functions/`  
**Agent Role:** Backend Developer  
**Procenjeno vreme:** 4-5 sati

### Korak 4.1: Kreiranje `check-achievements` Edge Function

**Zadatak:**
Kreirati Supabase Edge Function koja periodično proverava progress korisnika i dodeljuje bedževe.

**Edge Function:**
```typescript
// File: functions/check-achievements/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user_id from query params or body (for manual trigger)
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');

    if (userId) {
      // Check achievements for specific user
      const { data, error } = await supabase.rpc('check_and_award_achievements', {
        p_user_id: userId,
      });
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, user_id: userId, data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } else {
      // Batch check: process all active users (for cron job)
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_active', true) // Assuming we have is_active field
        .limit(100); // Process in batches

      if (usersError) throw usersError;

      const results = [];
      for (const user of users || []) {
        try {
          const { data, error } = await supabase.rpc('check_and_award_achievements', {
            p_user_id: user.id,
          });
          if (error) {
            console.error(`Error checking achievements for user ${user.id}:`, error);
            continue;
          }
          results.push({ user_id: user.id, data });
        } catch (err) {
          console.error(`Error processing user ${user.id}:`, err);
        }
      }

      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
  } catch (error: any) {
    console.error('Error in check-achievements:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
```

**Uspeh kriterijum:**
- Edge Function postoji i radi
- Može da se pozove sa `user_id` query param za specifičnog korisnika
- Može da se pozove bez `user_id` za batch processing
- Vraća rezultate u JSON formatu

---

### Korak 4.2: Kreiranje `check_and_award_achievements()` RPC Funkcije

**Zadatak:**
Kreirati SQL RPC funkciju koja proverava criteria i dodeljuje bedževe.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_check_and_award_achievements_function.sql

CREATE OR REPLACE FUNCTION public.check_and_award_achievements(
  p_user_id UUID,
  p_gym_id UUID DEFAULT NULL -- Optional gym context for gym challenges
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_achievement RECORD;
  v_challenge RECORD;
  v_criteria_met BOOLEAN;
  v_progress_id UUID;
  v_badge_id UUID;
  v_awarded_achievements JSONB := '[]'::JSONB;
  v_awarded_challenges JSONB := '[]'::JSONB;
BEGIN
  -- Check global achievements
  FOR v_achievement IN
    SELECT * FROM public.global_achievements
    WHERE is_active = true
  LOOP
    -- Skip if user already has this badge
    IF EXISTS (
      SELECT 1 FROM public.user_badges
      WHERE user_id = p_user_id
        AND global_achievement_id = v_achievement.id
    ) THEN
      CONTINUE;
    END IF;
    
    -- Evaluate criteria
    v_criteria_met := public.evaluate_criteria(p_user_id, v_achievement.criteria, NULL);
    
    IF v_criteria_met THEN
      -- Get or create progress record
      INSERT INTO public.user_progress (
        user_id,
        global_achievement_id,
        progress_data,
        is_completed,
        completed_at
      )
      VALUES (
        p_user_id,
        v_achievement.id,
        '{}'::JSONB, -- Progress data can be populated separately
        true,
        NOW()
      )
      ON CONFLICT (user_id, global_achievement_id, gym_challenge_id)
      DO UPDATE SET
        is_completed = true,
        completed_at = NOW(),
        updated_at = NOW()
      RETURNING id INTO v_progress_id;
      
      -- Award badge
      INSERT INTO public.user_badges (
        user_id,
        global_achievement_id,
        earned_at
      )
      VALUES (
        p_user_id,
        v_achievement.id,
        NOW()
      )
      ON CONFLICT (user_id, global_achievement_id, gym_challenge_id)
      DO NOTHING
      RETURNING id INTO v_badge_id;
      
      -- Award reward drops (if any)
      IF v_achievement.reward_drops > 0 THEN
        PERFORM public.add_drops(
          p_user_id,
          NULL, -- gym_id not needed for global achievements
          v_achievement.reward_drops,
          'achievement',
          v_achievement.id,
          'Global achievement reward: ' || v_achievement.name
        );
      END IF;
      
      -- Add to results
      v_awarded_achievements := v_awarded_achievements || jsonb_build_object(
        'id', v_achievement.id,
        'code', v_achievement.code,
        'name', v_achievement.name
      );
    END IF;
  END LOOP;
  
  -- Check gym challenges (if gym_id provided)
  IF p_gym_id IS NOT NULL THEN
    FOR v_challenge IN
      SELECT * FROM public.gym_challenges
      WHERE gym_id = p_gym_id
        AND is_active = true
        AND start_date <= CURRENT_DATE
        AND end_date >= CURRENT_DATE
    LOOP
      -- Skip if user already has this badge
      IF EXISTS (
        SELECT 1 FROM public.user_badges
        WHERE user_id = p_user_id
          AND gym_challenge_id = v_challenge.id
      ) THEN
        CONTINUE;
      END IF;
      
      -- Evaluate criteria
      v_criteria_met := public.evaluate_criteria(p_user_id, v_challenge.criteria, p_gym_id);
      
      IF v_criteria_met THEN
        -- Get or create progress record
        INSERT INTO public.user_progress (
          user_id,
          gym_challenge_id,
          progress_data,
          is_completed,
          completed_at
        )
        VALUES (
          p_user_id,
          v_challenge.id,
          '{}'::JSONB,
          true,
          NOW()
        )
        ON CONFLICT (user_id, global_achievement_id, gym_challenge_id)
        DO UPDATE SET
          is_completed = true,
          completed_at = NOW(),
          updated_at = NOW()
        RETURNING id INTO v_progress_id;
        
        -- Award badge
        INSERT INTO public.user_badges (
          user_id,
          gym_challenge_id,
          earned_at
        )
        VALUES (
          p_user_id,
          v_challenge.id,
          NOW()
        )
        ON CONFLICT (user_id, global_achievement_id, gym_challenge_id)
        DO NOTHING
        RETURNING id INTO v_badge_id;
        
        -- Award reward drops (if any)
        IF v_challenge.reward_drops > 0 THEN
          PERFORM public.add_drops(
            p_user_id,
            p_gym_id,
            v_challenge.reward_drops,
            'challenge',
            v_challenge.id,
            'Challenge reward: ' || v_challenge.name
          );
        END IF;
        
        -- Add to results
        v_awarded_challenges := v_awarded_challenges || jsonb_build_object(
          'id', v_challenge.id,
          'name', v_challenge.name
        );
      END IF;
    END LOOP;
  END IF;
  
  -- Return results
  RETURN jsonb_build_object(
    'awarded_achievements', v_awarded_achievements,
    'awarded_challenges', v_awarded_challenges
  );
END;
$$;

COMMENT ON FUNCTION public.check_and_award_achievements IS 'Checks user progress against all active global achievements and gym challenges, awards badges if criteria are met. Returns JSONB with awarded achievements/challenges.';
```

**Uspeh kriterijum:**
- RPC funkcija postoji i radi
- Proverava i globalne achievement-e i gym challenge-e
- Dodeljuje bedževe i reward drops
- Vraća JSONB sa rezultatima

---

### Korak 4.3: Integracija sa `add_drops()` Funkcijom

**Zadatak:**
Modifikovati `add_drops()` funkciju da automatski poziva `check_and_award_achievements()` nakon dodavanja drops-a.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_integrate_achievement_check_in_add_drops.sql

-- Modify add_drops() to check achievements after awarding drops
-- Note: This is a simplified version - actual add_drops() may have more logic

CREATE OR REPLACE FUNCTION public.add_drops(
  p_user_id UUID,
  p_gym_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_awarded JSONB;
BEGIN
  -- Existing add_drops logic (update profiles, gym_memberships, transactions, etc.)
  -- ... (keep existing logic) ...
  
  -- After drops are added, check achievements
  -- Use p_gym_id if provided, otherwise check global achievements only
  v_awarded := public.check_and_award_achievements(p_user_id, p_gym_id);
  
  -- Optional: Log awarded achievements (for debugging)
  -- RAISE NOTICE 'Awarded achievements: %', v_awarded;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Uspeh kriterijum:**
- `add_drops()` poziva `check_and_award_achievements()` nakon dodavanja drops-a
- Ne utiče na postojeću logiku `add_drops()`
- Radi asinhrono (ne blokira)

---

### Korak 4.4: Cron Job Setup

**Zadatak:**
Podesiti cron job za periodičnu proveru achievement-a.

**Supabase Cron Setup (pg_cron extension):**

```sql
-- File: migrations/YYYYMMDDHHMMSS_setup_achievement_cron_job.sql

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily achievement check (runs at 2 AM UTC)
SELECT cron.schedule(
  'daily-achievement-check',
  '0 2 * * *', -- Every day at 2 AM UTC
  $$
  SELECT public.check_and_award_achievements(p.id, NULL)
  FROM public.profiles p
  WHERE p.is_active = true
  LIMIT 100; -- Process in batches
  $$
);

-- Schedule hourly check for active users (runs every hour)
SELECT cron.schedule(
  'hourly-achievement-check',
  '0 * * * *', -- Every hour
  $$
  SELECT public.check_and_award_achievements(p.id, NULL)
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.updated_at > NOW() - INTERVAL '1 hour' -- Only check recently active users
  LIMIT 50;
  $$
);
```

**Alternative: Supabase Edge Function Cron (via Supabase Dashboard)**

1. Go to Supabase Dashboard → Edge Functions → `check-achievements`
2. Set up cron schedule:
   - **Daily**: `0 2 * * *` (2 AM UTC)
   - **Hourly**: `0 * * * *` (every hour)

**Uspeh kriterijum:**
- Cron job je podešen
- Pokreće se periodično
- Proverava achievement-e za aktivne korisnike

---

## Faza 5: Multi-tenant Security (Backend Agent)

**Workspace:** `backend/supabase/`  
**Agent Role:** Supabase DBA  
**Procenjeno vreme:** 2-3 sata

### Korak 5.1: RLS Policies za `gym_challenges`

**Zadatak:**
Osigurati da vlasnici teretana mogu da vide/uređuju samo svoje challenge-e.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_gym_challenges_rls_policies.sql

-- Enable RLS (if not already enabled)
ALTER TABLE public.gym_challenges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Gym admins can manage their gym challenges" ON public.gym_challenges;
DROP POLICY IF EXISTS "Anyone can view active gym challenges" ON public.gym_challenges;

-- Policy: Anyone can view active gym challenges (for mobile app)
CREATE POLICY "Anyone can view active gym challenges"
  ON public.gym_challenges FOR SELECT
  USING (is_active = true);

-- Policy: Gym admins can view all challenges for their gym
CREATE POLICY "Gym admins can view their gym challenges"
  ON public.gym_challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_id = gym_challenges.gym_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Gym admins can insert challenges for their gym
CREATE POLICY "Gym admins can create challenges"
  ON public.gym_challenges FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_id = gym_challenges.gym_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Gym admins can update challenges for their gym
CREATE POLICY "Gym admins can update their gym challenges"
  ON public.gym_challenges FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_id = gym_challenges.gym_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Gym admins can delete challenges for their gym
CREATE POLICY "Gym admins can delete their gym challenges"
  ON public.gym_challenges FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff
      WHERE gym_id = gym_challenges.gym_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
```

**Uspeh kriterijum:**
- RLS policies su aktivne
- Gym admins mogu da vide/uređuju samo svoje challenge-e
- Korisnici mogu da vide aktivne challenge-e (za mobile app)

---

### Korak 5.2: RLS Policies za `user_progress` (Gym Challenges)

**Zadatak:**
Osigurati da gym admins mogu da vide progress samo za svoje challenge-e.

**SQL Migracija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_user_progress_gym_rls.sql

-- Policy already exists for gym admins (from Korak 1.4), but let's verify it's correct
-- Update policy to ensure gym admins can only see progress for their gym's challenges

DROP POLICY IF EXISTS "Gym admins can view gym challenge progress" ON public.user_progress;

CREATE POLICY "Gym admins can view gym challenge progress"
  ON public.user_progress FOR SELECT
  USING (
    -- Allow if it's a global achievement (no gym restriction)
    global_achievement_id IS NOT NULL OR
    -- Or if it's a gym challenge and user is admin of that gym
    (
      gym_challenge_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM public.gym_challenges gc
        JOIN public.gym_staff gs ON gc.gym_id = gs.gym_id
        WHERE gc.id = gym_challenge_id
          AND gs.user_id = auth.uid()
          AND gs.role IN ('owner', 'admin')
      )
    )
  );
```

**Uspeh kriterijum:**
- Gym admins mogu da vide progress samo za svoje challenge-e
- Korisnici mogu da vide svoj progress
- Global achievement progress je javno dostupan (za leaderboard)

---

## Faza 6: Admin Panel Updates (Admin Agent)

**Workspace:** `apps/admin-panel/`  
**Agent Role:** Next.js Frontend Developer  
**Procenjeno vreme:** 5-6 sati

### Korak 6.1: Ažuriranje Challenge Creation Forma

**Zadatak:**
Modifikovati `ChallengesManager` komponentu da koristi `criteria` JSONB umesto rigidnih polja.

**Fajlovi za modifikaciju:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx`
- `apps/admin-panel/lib/actions/challenge-actions.ts`

**Ključne promene:**

1. **Zod Schema Ažuriranje:**
```typescript
// Update challengeSchema to support criteria JSONB
const challengeSchema = z.object({
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  criteria: z.object({
    type: z.enum(['drops', 'streak', 'sessions', 'distance', 'duration']),
    operator: z.enum(['>=', '<=', '==', '>', '<']),
    value: z.number().int().positive(),
    scope: z.enum(['global', 'gym']).default('gym'),
    machine_type: z.string().optional(),
    date_range: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
  }),
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional().or(z.literal('')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
```

2. **UI Komponente:**
   - Dodati dropdown za `criteria.type`
   - Dodati dropdown za `criteria.operator`
   - Dodati input za `criteria.value`
   - Dodati optional polja za `machine_type` i `date_range`
   - Dodati badge image upload (Supabase Storage)

3. **Badge Image Upload:**
   - Koristiti `@supabase/storage-js` za upload
   - Upload u `gym-challenge-badges/{gym_id}/challenge-{challenge_id}-badge.{ext}`
   - Prikazati preview pre submit-a

**Uspeh kriterijum:**
- Forma koristi `criteria` JSONB strukturu
- Badge image upload radi
- Validacija radi ispravno
- Challenge se kreira sa ispravnom `criteria` strukturom

---

### Korak 6.2: Statistika za Challenge Completion

**Zadatak:**
Dodati statistiku koja prikazuje koliko korisnika je osvojilo određeni challenge.

**Fajlovi za kreiranje/modifikaciju:**
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx`
- `apps/admin-panel/lib/actions/challenge-actions.ts`

**Nova RPC Funkcija:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_get_challenge_completion_stats.sql

CREATE OR REPLACE FUNCTION public.get_challenge_completion_stats(p_challenge_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total_completions', COUNT(*),
    'completions_by_date', jsonb_agg(
      jsonb_build_object(
        'date', DATE(earned_at),
        'count', 1
      )
    )
  )
  FROM public.user_badges
  WHERE gym_challenge_id = p_challenge_id;
$$;
```

**UI Komponenta:**
- Dodati "Completion Stats" sekciju u challenge detail view
- Prikazati broj korisnika koji su osvojili challenge
- Prikazati grafikon po datumu (opciono)

**Uspeh kriterijum:**
- Statistika se prikazuje za svaki challenge
- Podaci su tačni i ažurni

---

## Faza 7: Mobile App Updates (Mobile Agent)

**Workspace:** `apps/mobile-app/`  
**Agent Role:** React Native Frontend Developer  
**Procenjeno vreme:** 6-7 sati

### Korak 7.1: Trophy Room Screen

**Zadatak:**
Kreirati Trophy Room ekran koji prikazuje sve osvojene bedževe (globalne + gym challenge-e).

**Fajlovi za kreiranje:**
- `apps/mobile-app/app/trophy-room.tsx`
- `apps/mobile-app/hooks/useUserBadges.ts`

**RPC Funkcija za Fetch Badges:**
```sql
-- File: migrations/YYYYMMDDHHMMSS_create_get_user_badges_rpc.sql

CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id UUID)
RETURNS TABLE (
  badge_id UUID,
  badge_name TEXT,
  badge_description TEXT,
  badge_image_url TEXT,
  earned_at TIMESTAMPTZ,
  badge_type TEXT, -- 'global' or 'gym'
  gym_name TEXT -- NULL for global achievements
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ub.id as badge_id,
    COALESCE(ga.name, gc.name) as badge_name,
    COALESCE(ga.description, gc.description) as badge_description,
    COALESCE(ga.badge_image_url, gc.badge_image_url) as badge_image_url,
    ub.earned_at,
    CASE WHEN ub.global_achievement_id IS NOT NULL THEN 'global' ELSE 'gym' END as badge_type,
    g.name as gym_name
  FROM public.user_badges ub
  LEFT JOIN public.global_achievements ga ON ub.global_achievement_id = ga.id
  LEFT JOIN public.gym_challenges gc ON ub.gym_challenge_id = gc.id
  LEFT JOIN public.gyms g ON gc.gym_id = g.id
  WHERE ub.user_id = p_user_id
  ORDER BY ub.earned_at DESC;
$$;
```

**UI Komponenta:**
- Grid layout za bedževe
- Filter po tipu (global/gym)
- Search funkcionalnost
- Badge detail modal

**Uspeh kriterijum:**
- Trophy Room ekran prikazuje sve osvojene bedževe
- Filter i search rade
- Badge slike se učitavaju ispravno

---

### Korak 7.2: Push Notifikacije za Osvojene Bedževe

**Zadatak:**
Implementirati push notifikacije kada korisnik osvoji bedž.

**Fajlovi za modifikaciju:**
- `apps/mobile-app/lib/notifications.ts` (kreirati ako ne postoji)
- `apps/mobile-app/app/workout.tsx` (dodati notifikaciju nakon workout-a)

**Supabase Realtime Subscription:**
```typescript
// In useUserBadges hook or similar
useEffect(() => {
  const channel = supabase
    .channel('user_badges_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_badges',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Show push notification
        showBadgeNotification(payload.new);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [userId]);
```

**Uspeh kriterijum:**
- Push notifikacije se prikazuju kada korisnik osvoji bedž
- Notifikacija sadrži badge ime i sliku

---

### Korak 7.3: Active Challenges Overlay u Workout Screen

**Zadatak:**
Dodati overlay tokom treninga koji prikazuje aktivne challenge-e i progress.

**Fajlovi za modifikaciju:**
- `apps/mobile-app/app/workout.tsx`
- `apps/mobile-app/components/ActiveChallengesOverlay.tsx` (kreirati)

**UI Komponenta:**
- Collapsible overlay sa aktivnim challenge-ima
- Progress bar za svaki challenge
- Real-time update tokom treninga

**Uspeh kriterijum:**
- Overlay se prikazuje tokom treninga
- Progress se ažurira u real-time
- Ne ometa workout flow

---

### Korak 7.4: Badge Animation u Session Summary

**Zadatak:**
Dodati animaciju kada korisnik osvoji bedž nakon workout-a.

**Fajlovi za modifikaciju:**
- `apps/mobile-app/app/session-summary.tsx`
- `apps/mobile-app/components/BadgeAnimation.tsx` (kreirati)

**UI Komponenta:**
- Animirani badge popup
- Konfetti efekat (opciono)
- "Challenge Completed!" poruka

**Uspeh kriterijum:**
- Animacija se prikazuje kada se osvoji bedž
- Smooth i performantna animacija

---

## Delegacija Agenta

### Backend Agent (Supabase DBA / Backend Developer)

**Zadaci:**
1. ✅ Kreirati `global_achievements` tabelu (Korak 1.1)
2. ✅ Rename `challenges` → `gym_challenges` (Korak 1.2)
3. ✅ Dodati `criteria` JSONB u `gym_challenges` (Korak 1.3)
4. ✅ Kreirati `user_progress` tabelu (Korak 1.4)
5. ✅ Ažurirati `user_badges` tabelu (Korak 1.5)
6. ✅ Kreirati `validate_criteria()` funkciju (Korak 2.1)
7. ✅ Kreirati `evaluate_criteria()` funkciju (Korak 2.2)
8. ✅ Kreirati Supabase Storage bucket (Korak 3.1)
9. ✅ Setup CDN za globalne achievement-e (Korak 3.2)
10. ✅ Kreirati `check-achievements` Edge Function (Korak 4.1)
11. ✅ Kreirati `check_and_award_achievements()` RPC (Korak 4.2)
12. ✅ Integrisati sa `add_drops()` (Korak 4.3)
13. ✅ Setup cron job (Korak 4.4)
14. ✅ RLS policies za `gym_challenges` (Korak 5.1)
15. ✅ RLS policies za `user_progress` (Korak 5.2)

**Ključni fajlovi:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_*.sql`
- `backend/supabase/functions/check-achievements/index.ts`

**Testiranje:**
- Testirati criteria evaluaciju sa različitim tipovima
- Testirati RLS policies sa različitim ulogama
- Testirati cron job execution

---

### Admin Agent (Next.js Frontend Developer)

**Zadaci:**
1. ✅ Ažurirati `ChallengesManager` komponentu (Korak 6.1)
2. ✅ Implementirati badge image upload (Korak 6.1)
3. ✅ Dodati challenge completion statistiku (Korak 6.2)

**Ključni fajlovi:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx`
- `apps/admin-panel/lib/actions/challenge-actions.ts`
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx`

**Testiranje:**
- Testirati challenge creation sa različitim criteria tipovima
- Testirati badge image upload
- Testirati statistiku prikaz

---

### Mobile Agent (React Native Frontend Developer)

**Zadaci:**
1. ✅ Kreirati Trophy Room ekran (Korak 7.1)
2. ✅ Implementirati push notifikacije (Korak 7.2)
3. ✅ Dodati Active Challenges overlay (Korak 7.3)
4. ✅ Dodati badge animaciju (Korak 7.4)

**Ključni fajlovi:**
- `apps/mobile-app/app/trophy-room.tsx`
- `apps/mobile-app/hooks/useUserBadges.ts`
- `apps/mobile-app/app/workout.tsx`
- `apps/mobile-app/app/session-summary.tsx`

**Testiranje:**
- Testirati Trophy Room sa različitim bedževima
- Testirati push notifikacije
- Testirati overlay tokom treninga
- Testirati animaciju u session summary

---

## Implementacioni Redosled

### Faza 1: Backend Foundation (Tjedan 1)
1. Data Modeling (Koraci 1.1-1.5)
2. Criteria System (Koraci 2.1-2.2)
3. Storage Strategy (Koraci 3.1-3.2)

### Faza 2: Logic Engine (Tjedan 2)
1. Edge Worker Strategy (Koraci 4.1-4.4)
2. Multi-tenant Security (Koraci 5.1-5.2)

### Faza 3: Frontend Integration (Tjedan 3)
1. Admin Panel Updates (Koraci 6.1-6.2)
2. Mobile App Updates (Koraci 7.1-7.4)

---

## Testing Checklist

### Backend Testing
- [ ] Criteria evaluacija radi za sve tipove (drops, streak, sessions, distance, duration)
- [ ] Complex criteria (AND/OR) radi ispravno
- [ ] RLS policies sprečavaju cross-gym access
- [ ] Cron job pokreće se periodično
- [ ] Badge awarding radi za globalne achievement-e
- [ ] Badge awarding radi za gym challenge-e
- [ ] Storage policies sprečavaju cross-gym upload

### Admin Panel Testing
- [ ] Challenge creation sa criteria JSONB radi
- [ ] Badge image upload radi
- [ ] Statistika prikazuje tačne podatke

### Mobile App Testing
- [ ] Trophy Room prikazuje sve bedževe
- [ ] Push notifikacije se prikazuju
- [ ] Active Challenges overlay radi
- [ ] Badge animacija se prikazuje

---

## Migration Strategy

### Backward Compatibility
- Postojeći `challenges` podaci moraju biti migrirani u `gym_challenges`
- Postojeći `challenge_progress` podaci moraju biti migrirani u `user_progress`
- Postojeći `user_badges.challenge_id` mora biti migriran u `gym_challenge_id`

### Rollout Plan
1. **Phase 1:** Deploy backend migracije (bez breaking changes)
2. **Phase 2:** Migrate existing data
3. **Phase 3:** Deploy frontend updates
4. **Phase 4:** Enable new features gradually

---

## Risk Assessment

### High Risk
- **Data Migration:** Migracija postojećih podataka može biti kompleksna
  - **Mitigation:** Testirati migraciju na staging okruženju pre production

- **Criteria Evaluation Performance:** JSONB evaluacija može biti spora za veliki broj korisnika
  - **Mitigation:** Optimizovati SQL upite, dodati indexe, batch processing

### Medium Risk
- **Storage Costs:** Supabase Storage može biti skup za veliki broj badge slika
  - **Mitigation:** Optimizovati slike (compression), koristiti CDN caching

- **Cron Job Reliability:** pg_cron može biti nestabilan
  - **Mitigation:** Fallback na Edge Function cron, monitoring

### Low Risk
- **UI/UX Changes:** Korisnici mogu biti zbunjeni novim Trophy Room ekranom
  - **Mitigation:** User testing, gradual rollout

---

## Notes za Implementaciju

### Criteria System Best Practices
- Koristiti jednostavne criteria kada je moguće (bolje performanse)
- Kompleksne criteria (AND/OR) koristiti samo kada je neophodno
- Validirati criteria pre čuvanja u bazu

### Performance Optimization
- Indexirati `criteria` JSONB polje (GIN index)
- Cache-ovati `evaluate_criteria()` rezultate gde je moguće
- Batch process achievement checks za veliki broj korisnika

### Security Considerations
- Uvek validirati criteria pre evaluacije
- RLS policies moraju biti striktne
- Storage policies moraju sprečavati cross-gym access

---

**Plan Status:** ✅ Kompletan i spreman za implementaciju

**Next Steps:**
1. Review plan sa timom
2. Assign zadatke agentima
3. Start sa Faza 1 (Backend Foundation)
