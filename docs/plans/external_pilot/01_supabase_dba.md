# Step 1 — Database Migrations (supabase-dba)

> **Za koga:** `supabase-dba` agent. Ovo je tvoj jedini ulaz — ne diraj `apps/`.
>
> **Tvoja uloga (po `.cursor/rules/supabase-dba.mdc`):** PostgreSQL migracije + RPC funkcije + RLS policies. Ne piši TS, ne diraj frontend.

---

## Mandatory pre-read

1. `CHANGELOG.md` — recent DB izmene.
2. `MIGRATION_NOTES.md` — migration naming convention i recent state.
3. `ARCHITECTURE.md` (sekcija "Backend") — Supabase patterns.
4. `STATE_OF_THE_APP.md` — current focus.
5. **Stvarna šema u DB:**
   - `\d+ public.profiles` — proveri postojeće kolone i RLS policies.
   - `\d+ public.machines` — proveri imena kolona (`qr_uuid` vs `qr_code_uuid`, `machine_type` enum vs text, postoji li `is_active`).
   - `\df+ public.get_my_profile` — dump celokupne postojeće funkcije, treba ti za 1.3.

---

## Context

SweatDrop ide na pilot u Vortex teretanu. Apple/Google reviewer ne mogu da testiraju workout bez fizičkih BLE senzora, pa moramo da omogućimo **server-gated demo simulator**:
- Demo nalozi (`apple-review@sweatdrop.com`, interni QA) imaju `profiles.is_demo = true` i mogu da pokrenu simulator workout.
- Simulator se kači na mašine markirane sa `machines.is_demo_machine = true`.
- Realni Vortex korisnici nemaju ni jedan ni drugi flag → simulator im je nevidljiv.

Trenutno je simulator samo gated env varom u mobile build-u (`EXPO_PUBLIC_DEV_QR_UUID`), što nije dovoljno za prod.

---

## Tasks

### 1.1 Migracija: `profiles.is_demo`

**Kreiraj:** `backend/supabase/migrations/YYYYMMDDHHMMSS_profiles_is_demo_flag.sql` *(zameni timestamp UTC sad-om)*

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- profiles.is_demo
-- Server-side flag koji otključava simulator/demo flow-ove u mobile app-u.
-- Nameni samo internim QA nalozima i Apple/Google reviewer kredencijalima.
-- NIKAD ne setuj na true za realne korisnike — fraud surface (drops/redemptions).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_demo IS
  'When true, mobile app allows simulator/demo flows (Apple reviewer, internal QA, sales demos). Never set for real users — bypasses BLE machine lock.';

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo
  ON public.profiles(is_demo)
  WHERE is_demo = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: samo superadmin sme da menja flag.
-- (Korisnici NE smeju da self-promote-uju u demo.)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_is_demo_superadmin_only" ON public.profiles;

CREATE POLICY "profiles_is_demo_superadmin_only"
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role = 'superadmin'
    )
  );
```

> ⚠️ **Pažnja na postojeće RLS:** ako u `profiles` već postoji UPDATE policy "user can update own profile" koja dozvoljava self-update svih kolona, NE rušiti je. Umesto toga, izuzmi `is_demo` column-level grant-om:
>
> ```sql
> REVOKE UPDATE (is_demo) ON public.profiles FROM authenticated, anon;
> GRANT  UPDATE (is_demo) ON public.profiles TO service_role;
> ```
>
> Verifikuj sa `SELECT * FROM pg_policies WHERE tablename='profiles';` pre commit-a.

### 1.2 Migracija: `machines.is_demo_machine` + RPC `get_my_demo_machine()`

**Kreiraj:** `backend/supabase/migrations/YYYYMMDDHHMMSS_machines_is_demo_machine.sql`

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- machines.is_demo_machine
-- Označava mašine namenjene demo / Apple reviewer flow-u.
-- Korisnik (čak i sa is_demo = true) može kroz simulator da poveže sesiju
-- samo na mašine koje su eksplicitno markirane kao demo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS is_demo_machine BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.machines.is_demo_machine IS
  'When true, this machine is exposed to is_demo users via get_my_demo_machine() RPC for simulator workouts. Configure through admin panel; never expose to regular users.';

CREATE INDEX IF NOT EXISTS idx_machines_is_demo_machine
  ON public.machines(is_demo_machine)
  WHERE is_demo_machine = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_my_demo_machine()
-- Vraća prvu demo mašinu za caller-ov home gym ako je caller is_demo = true.
-- Ako nije is_demo, ili nema demo mašina u gymu, vraća prazno.
-- SECURITY DEFINER da zaobiđe RLS na machines (sigurnost dolazi iz is_demo
-- check-a unutar funkcije).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_demo_machine()
RETURNS TABLE (
  machine_id   UUID,
  qr_uuid      UUID,
  machine_name TEXT,
  machine_type TEXT,
  gym_id       UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.qr_uuid, m.name, m.machine_type::text, m.gym_id
    FROM public.machines m
    JOIN public.profiles p ON p.id = auth.uid()
   WHERE p.is_demo = true
     AND m.is_demo_machine = true
     AND m.is_active = true
     AND (
       p.home_gym_id IS NULL    -- demo nalog bez home gyma → prva demo mašina bilo gde
       OR m.gym_id = p.home_gym_id
     )
   ORDER BY (m.gym_id = p.home_gym_id) DESC, m.created_at ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_demo_machine() TO authenticated;
```

> ⚠️ **Verifikuj kolone na `machines` PRE commit-a:**
> - `qr_uuid` — postoji? Ako se zove drugačije (`qr_code_uuid`, `qr_id`), update SELECT.
> - `machine_type` — enum ili text? Ako enum, `::text` cast je nužan (već je u SQL-u).
> - `is_active` — postoji? Ako ne, ukloni `AND m.is_active = true` red.
> - `name`, `created_at`, `gym_id`, `home_gym_id` na `profiles` — sve standard.
>
> Otvori Supabase SQL editor (DEV projekat) i pokreni `\d+ public.machines` pre commit-a.

### 1.3 Update `get_my_profile()` da vraća `is_demo`

**Postojeća funkcija:** najverovatnije u `backend/supabase/migrations/20260304000020_auth_foundation.sql` (proveri u DB-u sa `\df+ public.get_my_profile`).

**Kreiraj migraciju:** `backend/supabase/migrations/YYYYMMDDHHMMSS_get_my_profile_include_is_demo.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  -- ⚠️ KOPIRAJ SVE postojeće kolone iz prethodne verzije funkcije
  -- (id, username, full_name, avatar_url, total_drops, available_drops,
  --  weekly_drops, monthly_drops, streak_days, is_newcomer, role,
  --  home_gym_id, expo_push_token, created_at, updated_at, email,
  --  last_visit_date, gender, weight_kg, height_cm, date_of_birth,
  --  fitness_goal, onboarding_completed)
  -- + DODAJ NA KRAJU:
  is_demo BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    -- ...sve postojeće kolone u istom redosledu...
    COALESCE(p.is_demo, false) AS is_demo
    FROM public.profiles p
   WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
```

> **Kritično:** Ne smeš da ispustiš nijednu postojeću kolonu — mobile `ProfileData` interface ih sve očekuje. Prebaci 1:1 iz dump-a postojeće funkcije.

### 1.4 Push migracija

```bash
cd backend

# DEV prvo
npx supabase link --project-ref jzyoyxabcdzvqcfnfzrz
npx supabase db push

# Smoke test u DEV-u (kao ulogovan user kroz Supabase SQL editor "Run as authenticated"):
SELECT * FROM public.get_my_profile();   -- mora da sadrži is_demo kolonu
SELECT * FROM public.get_my_demo_machine();  -- prazno (nema demo mašina ni demo usera još)

# PROD posle što DEV smoke test prođe
npx supabase link --project-ref gyqgdfqnatuegwyidrii
npx supabase db push
```

### 1.5 Seed demo nalog + demo mašinu u PROD

**Demo nalog (Apple reviewer):**
```sql
-- Nalog mora prvo biti kreiran kroz signup flow (mobile app ili admin invite).
-- Onda u PROD SQL editoru:
UPDATE public.profiles
   SET is_demo = true
 WHERE email = 'apple-review@sweatdrop.com';

SELECT id, email, role, is_demo
  FROM public.profiles
 WHERE is_demo = true;
```

**Demo mašina (privremeno, dok admin-coder ne završi UI u Step 4):**
```sql
-- Markiraj jednu Vortex bike mašinu (default u modal-u je bike) kao demo:
UPDATE public.machines
   SET is_demo_machine = true
 WHERE name = '<naziv-bike-mašine>'   -- npr. 'Bike #1'
   AND gym_id = '<vortex-gym-uuid>';

-- Verifikuj da RPC vraća tu mašinu kada se demo user uloguje:
-- (kroz mobile app u dev mode ili kroz Supabase Logs Filter na rpc.get_my_demo_machine)
```

### 1.6 Regeneriši TypeScript tipove

```bash
cd backend
npx supabase gen types typescript --project-id gyqgdfqnatuegwyidrii \
  > types/database.types.ts
```

Commit i `database.types.ts` zajedno sa migracijama u istom PR-u.

---

## Smoke Tests (sve ✅ pre nego što javiš da je gotovo)

- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_demo';` vraća red u DEV i PROD.
- [ ] Isto za `machines.is_demo_machine`.
- [ ] `SELECT * FROM get_my_profile()` ulogovan kao bilo koji user → kolona `is_demo` postoji u response-u.
- [ ] `SELECT * FROM get_my_demo_machine()` ulogovan kao **non-demo** user → 0 redova.
- [ ] `SELECT * FROM get_my_demo_machine()` ulogovan kao **demo** user (sa `is_demo = true`) i postoji `is_demo_machine = true` mašina u njegovom gymu → vraća tu mašinu.
- [ ] Pokušaj kao običan user da updateuješ `is_demo`: `UPDATE profiles SET is_demo = true WHERE id = auth.uid();` → mora pasti zbog RLS.

---

## Handoff (šta javiti sledećem agentu)

Mobile-coder (Step 2) i admin-coder (Step 4) obojica trebaju:
1. **Confirmation da `database.types.ts` regenerisan i commit-ovan.**
2. **Lista novih kolona/RPC-ova za njihovu referencu:** `profiles.is_demo`, `machines.is_demo_machine`, `get_my_demo_machine()` RPC.
3. Ako je trebalo da prilagodiš ime kolone u 1.2 (`qr_uuid` → `qr_code_uuid` itd.), reci im da to koriste.

Ažuriraj `MIGRATION_NOTES.md` sa entry-em za sve tri migracije.

---

## Out of scope za tebe

- ❌ Mobile app code (`apps/mobile-app/**`).
- ❌ Admin panel code (`apps/admin-panel/**`).
- ❌ EAS / store config.
- ❌ UI design.
