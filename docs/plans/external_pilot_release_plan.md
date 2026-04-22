# Plan: External Pilot Release (Vortex) + Apple Reviewer Demo Mode

> **Cilj:** pripremiti SweatDrop za **External TestFlight (public link)** i **Google Play Closed Testing (web link)** distribuciju Vortex pilot korisnicima, sa **Apple-bezbednim simulator režimom** koji je gated server-side flag-om umesto trenutnog 5× tap gesture-a dostupnog svima.
>
> **Trenutno stanje:**
> - 5× tap na scanner ekranu otvara dev simulator modal (`apps/mobile-app/components/ScannerScreen.tsx:865`).
> - Gate je env var `EXPO_PUBLIC_DEV_QR_UUID` — ako je setovan, gesture radi za **bilo kog korisnika**.
> - U produkcionom EAS build-u, ako env var ostane setovan, korisnici mogu da otkriju gesture i farmaju Sweat Drops bez fizičkog workout-a → **fraud surface u prod-u**.
> - Apple reviewer ne može da testira workout flow bez fizičkih BLE senzora — moramo mu dati put.
>
> **Cilj arhitekture (posle ovog plana):**
> - Simulator se i dalje aktivira 5× tap-om, ali **samo ako je ulogovan korisnik kome je `profiles.is_demo = true`**.
> - Demo mašina (na koju simulator kači sesiju) se rešava **server-side preko RPC `get_my_demo_machine()`**, ne preko env vara. `EXPO_PUBLIC_DEV_QR_UUID` ostaje samo u dev/preview EAS profilima kao opciono ubrzanje za developere; u prod build-u se uopšte ne koristi.
> - Mašine se markiraju kao `machines.is_demo_machine = true` u admin panelu — konfiguracija bez rebuild-a, bez tajni u IPA/AAB bundle-u.
> - Apple reviewer dobija `apple-review@sweatdrop.com` nalog sa `is_demo = true` i jasna uputstva u Reviewer Notes.
> - Realni Vortex korisnici nikada ne vide gesture niti modal.
>
> **Dependencies:**
> - PROD Supabase je linkovan i migracije su gurnute (vidi `MIGRATION_NOTES.md`).
> - PROD admin panel deploy-ovan na `https://admin.sweat-drop.com` sa Vercel env varovima (vidi `GO_LIVE.md` Sekcije 2–3).
> - Vortex gym + bar 1 simulator-friendly mašina seedovani u prod bazi (vidi `GO_LIVE.md` Sekcija 4).
> - Apple Developer + Play Console pristup (account `zephyr23` / org account).

---

## Workspace Assignments

| Agent | Workspace | Briefing |
|-------|-----------|----------|
| **supabase-dba** | `backend/supabase/` | Step 1 — migracija + update RPC-ova |
| **mobile-coder** | `apps/mobile-app/` | Step 2 — gate simulator iza `is_demo`, refresh tipova |
| **mobile-ui-ux-agent** | `apps/mobile-app/` | Step 3 — vidljiv "DEMO MODE" banner za demo korisnike |
| **admin-coder** | `apps/admin-panel/` | Step 4 — superadmin UI za toggle `is_demo` |
| **devops** *(ti / CEO)* | `apps/mobile-app/eas.json` + EAS dashboard + App Store Connect + Play Console | Step 5 — EAS profili, secrets, TestFlight public link, Play closed testing web link |
| **reviewer** | sve | Step 6 — final audit pre `eas build production` |

> Svaki Coder mora pre rada da pročita `CHANGELOG.md`, `MIGRATION_NOTES.md`, `ARCHITECTURE.md`, `STATE_OF_THE_APP.md` (po `.cursor/rules/*` pravilima).

---

## Step 1 — Database Changes (supabase-dba)

### 1.1 Migracija: dodaj `is_demo` flag na `profiles`

**Kreiraj:** `backend/supabase/migrations/YYYYMMDDHHMMSS_profiles_is_demo_flag.sql`
*(zameni `YYYYMMDDHHMMSS` trenutnim UTC timestampom u skladu sa konvencijom iz `MIGRATION_NOTES.md`)*

**SQL sadržaj:**

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

> ⚠️ **Pažnja:** ako u tabeli `profiles` već postoji `UPDATE` RLS policy koja dozvoljava samom korisniku da apdejtuje svoj profil (username, avatar itd.), **NE rušiti je** — naš novi policy mora biti dodatak koji se primenjuje samo na `is_demo` koloni. Ako trenutni RLS dozvoljava self-update svih kolona, dodaj column-level grant ili refaktoruj postojeći policy da `is_demo` izuzme. Proveri sa `\d+ public.profiles` i `SELECT * FROM pg_policies WHERE tablename='profiles'` pre nego što počneš.
>
> Najjednostavnije ako je trenutni policy "user can update own profile":
>
> ```sql
> -- Otkaži opšti grant na is_demo, dozvoli ga samo superadminu kroz
> -- gornji policy (USING/CHECK).
> REVOKE UPDATE (is_demo) ON public.profiles FROM authenticated, anon;
> GRANT  UPDATE (is_demo) ON public.profiles TO service_role;
> ```

### 1.2 Migracija: dodaj `is_demo_machine` na `machines` + RPC `get_my_demo_machine()`

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

> ⚠️ **Verifikuj kolone na `machines` pre nego što potvrdiš migraciju:**
> - Da li je `qr_uuid` zaista UUID kolona? (Možda se zove `qr_code_uuid` ili `qr_id` u tvojoj šemi.)
> - Da li je `machine_type` enum ili text? Ako je enum, `::text` cast je potreban (već je u SQL-u).
> - Da li postoji `is_active` kolona? Ako ne, ukloni taj `WHERE` red.
>
> Pokreni `\d+ public.machines` u Supabase SQL editoru pre commit-a i prilagodi imena kolona.

### 1.3 Update `get_my_profile()` RPC da vraća `is_demo`

**Postojeća funkcija:** `backend/supabase/migrations/20260304000020_auth_foundation.sql`
**Akcija:** kreiraj novu migraciju koja `CREATE OR REPLACE FUNCTION public.get_my_profile()` proširuje sa `is_demo BOOLEAN`.

**Migracija:** `backend/supabase/migrations/YYYYMMDDHHMMSS_get_my_profile_include_is_demo.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  -- ⚠️ Kopiraj sve postojeće kolone iz prethodne verzije funkcije
  -- (id, username, full_name, avatar_url, total_drops, available_drops, ...)
  -- + DODAJ na kraju:
  is_demo BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username,
    -- ...sve postojeće kolone...
    COALESCE(p.is_demo, false) AS is_demo
    FROM public.profiles p
   WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
```

> Pre commit-a: `pg_dump --schema-only` postojeće funkcije i prebaci 1:1 kolone u novi `RETURNS TABLE`. Ne smeš da ispustiš nijednu — frontend ProfileData ih očekuje sve.

### 1.4 Push na DEV pa PROD

```bash
cd backend

# DEV prvo
npx supabase link --project-ref jzyoyxabcdzvqcfnfzrz
npx supabase db push

# Smoke test u DEV-u: SELECT * FROM get_my_profile();  (kao ulogovan user)
# Provera da nova kolona is_demo dolazi u response.

# Onda PROD
npx supabase link --project-ref qdtdfofodfdlutkmlzzf
npx supabase db push
```

### 1.5 Seed demo nalog + demo mašinu u PROD

**Demo nalog:**
```sql
-- Posle što je nalog kreiran kroz signup flow (mobile app ili admin invite),
-- u Supabase prod SQL editoru:
UPDATE public.profiles
   SET is_demo = true
 WHERE email = 'apple-review@sweatdrop.com';

-- Verify:
SELECT id, email, role, is_demo FROM public.profiles WHERE is_demo = true;
```

**Demo mašina (privremeno, pre nego što admin-coder Step 4 doda UI):**
```sql
-- Markiraj jednu Vortex mašinu (idealno bike, jer je default u modal-u) kao demo:
UPDATE public.machines
   SET is_demo_machine = true
 WHERE name = '<naziv-bike-mašine>'   -- npr. 'Bike #1'
   AND gym_id = '<vortex-gym-uuid>';

-- Verify da RPC radi za demo nalog:
-- (uloguj se kao apple-review@sweatdrop.com kroz mobile app, pa u Supabase Logs proveri call.)
```

### 1.6 Update tipova

```bash
# Posle obe migracije:
cd backend
npx supabase gen types typescript --project-id qdtdfofodfdlutkmlzzf \
  > types/database.types.ts
```

**Dependencies za Step 2:** Step 1 mora biti završen i `database.types.ts` regenerisan.

---

## Step 2 — Mobile App: gate simulator iza `is_demo` (mobile-coder)

### 2.1 Proširi `ProfileData` tip

**Fajl:** `apps/mobile-app/lib/stores/authStore.ts`

**Izmena:** dodaj `is_demo: boolean` na `ProfileData` interface (linija ~57, posle `onboarding_completed`):

```typescript
export interface ProfileData {
  // ...sve postojeće kolone...
  onboarding_completed: boolean;
  is_demo: boolean;  // ← dodaj ovo
}
```

> Provera: posle promene tipa, TypeScript compiler će ti pokazati gde god se `ProfileData` poredi/destrukturira — najverovatnije nigde ne ruši, jer je nova polja `is_demo` opciono za sve postojeće potrošače osim ScannerScreen-a.

### 2.2 Helper hook `useIsDemoUser`

**Kreiraj:** `apps/mobile-app/hooks/useIsDemoUser.ts`

```typescript
import { useAuthStore } from '@/lib/stores/authStore';

/**
 * Returns true if the currently signed-in user has profiles.is_demo = true.
 * Gates simulator/demo flows (5x tap on ScannerScreen, etc.) so they're
 * invisible to real users in production builds.
 */
export function useIsDemoUser(): boolean {
  return useAuthStore((s) => s.profile?.is_demo ?? false);
}
```

### 2.3 Resolver: gde da se nađe UUID demo mašine

Trenutno kod čita `process.env.EXPO_PUBLIC_DEV_QR_UUID`. Promeni na **dvoslojnu strategiju**:

1. **Dev / preview build:** ako je `EXPO_PUBLIC_DEV_QR_UUID` setovan u env-u, koristi ga (developer comfort — ne mora ništa u DB da seedi).
2. **Prod build:** env je prazan → fallback na RPC `get_my_demo_machine()` koji vraća demo mašinu iz baze (samo za `is_demo` korisnike, server-enforced).

**Kreiraj:** `apps/mobile-app/hooks/useDemoMachine.ts`

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useIsDemoUser } from '@/hooks/useIsDemoUser';

const ENV_DEV_QR_UUID = process.env.EXPO_PUBLIC_DEV_QR_UUID || '';

interface DemoMachine {
  machine_id: string;
  qr_uuid: string;
  machine_name: string;
  machine_type: string;
  gym_id: string;
}

/**
 * Returns the demo machine the current user can attach simulator sessions to.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_DEV_QR_UUID env (dev/preview convenience).
 *   2. RPC get_my_demo_machine() (production — server-controlled, requires
 *      profiles.is_demo = true AND machines.is_demo_machine = true).
 *
 * Returns null when:
 *   - User is not is_demo, OR
 *   - No demo machine configured for user's gym.
 */
export function useDemoMachine(): { qrUuid: string | null; loading: boolean } {
  const isDemo = useIsDemoUser();
  const [qrUuid, setQrUuid] = useState<string | null>(ENV_DEV_QR_UUID || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isDemo) {
      setQrUuid(null);
      return;
    }
    if (ENV_DEV_QR_UUID) {
      setQrUuid(ENV_DEV_QR_UUID);
      return;
    }
    // Production fallback: ask the server which machine we're allowed to use.
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('get_my_demo_machine')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          log.warn('[useDemoMachine] RPC failed:', error.message);
          setQrUuid(null);
          return;
        }
        const row = (Array.isArray(data) ? data[0] : data) as DemoMachine | undefined;
        setQrUuid(row?.qr_uuid ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  return { qrUuid, loading };
}
```

### 2.4 Gate 5× tap i `startDevelopWorkout` (sa novim resolverom)

**Fajl:** `apps/mobile-app/components/ScannerScreen.tsx`

**Izmena A — uvozi hookove (oko linije 50):**

```typescript
import { useIsDemoUser } from '@/hooks/useIsDemoUser';
import { useDemoMachine } from '@/hooks/useDemoMachine';
```

**Izmena B — pozovi ih unutar komponente (posle `const branding = useBranding();`, ~linija 141):**

```typescript
const isDemoUser = useIsDemoUser();
const { qrUuid: demoQrUuid } = useDemoMachine();
```

**Izmena C — ukloni hard-coded env constantu (linija 61):**

```typescript
// ❌ Obriši:
// const DEV_QR_UUID = process.env.EXPO_PUBLIC_DEV_QR_UUID || '';
```
Sva mesta u fajlu koja referenciraju `DEV_QR_UUID` zameni sa `demoQrUuid` lokalnom varijablom dobijenom kroz hook (vidi izmene D, E ispod).

**Izmena D — gate `handleScanAreaTap` (linija 865):**

```typescript
const handleScanAreaTap = () => {
  if (!isDemoUser || !demoQrUuid) return;   // ← stari uslov bio samo `!DEV_QR_UUID`
  tapCountRef.current += 1;
  if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
  if (tapCountRef.current >= 5) {
    tapCountRef.current = 0;
    if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowDevSimulatorModal(true);
  }
};
```

**Izmena E — gate i resolve mašine u `startDevelopWorkout` (linija 879):**

Sve `DEV_QR_UUID` reference unutar funkcije zameni sa lokalnim `demoQrUuid`:

```typescript
const startDevelopWorkout = async (sensorIdOverride: string) => {
  if (!isDemoUser || !demoQrUuid) return;
  const resetDevScan = () => { setIsScanning(true); setIsProcessing(false); };
  try {
    setShowDevSimulatorModal(false);
    setIsProcessing(true);
    setIsScanning(false);

    const currentSession = sessionRef.current;
    if (!currentSession?.user) {
      throw new Error('No active session — cannot create simulator workout');
    }

    const { data: machineStatus, error: rpcError } = await supabase.rpc('get_machine_status', {
      p_qr_uuid: demoQrUuid,        // ← bilo DEV_QR_UUID
    });

    // ...rest identično kao trenutno (samo ako još negde postoji DEV_QR_UUID, zameni)...
  } catch (error: any) {
    // ...
  }
};
```

**Izmena F — Pressable wrapper (linija 1158):**

Komentar ispred `Pressable`-a:

```typescript
{/* Scan Frame with Premium Animations — 5x tap opens simulator (DEMO USERS ONLY) */}
<Pressable onPress={handleScanAreaTap}>
  {/* ...frame UI... */}
</Pressable>
```

### 2.5 Cleanup: ukloni komentar koji laže

Linija 864 trenutno kaže:
```typescript
// 5x tap on scanner area opens simulator modal (available in all builds when DEV_QR_UUID is set)
```

Promeni u:
```typescript
// 5x tap opens simulator modal — ONLY when:
//   1. Current user has profiles.is_demo = true (server-side flag), AND
//   2. A demo machine UUID is resolvable (env in dev/preview, or RPC
//      get_my_demo_machine() in production).
// Production builds do NOT ship EXPO_PUBLIC_DEV_QR_UUID; demo machine
// is resolved server-side and requires machines.is_demo_machine = true.
```

### 2.6 Smoke test (lokalno na DEV-u)

**Setup u DEV Supabase:**
- Tvoj test nalog: `UPDATE profiles SET is_demo = true WHERE email = 'tvoj-email';`
- Tvoja test mašina: `UPDATE machines SET is_demo_machine = true WHERE id = '<dev-bike-uuid>';`

**Test scenarios:**
1. `pnpm env:dev && pnpm dev:mobile`
2. **Sa env varom** (`EXPO_PUBLIC_DEV_QR_UUID` setovan): non-demo user → 5× tap = ništa ✅; demo user → 5× tap otvara modal ✅.
3. **Bez env vara** (privremeno obriši iz `.env.dev.local`): demo user → `useDemoMachine` poziva RPC → vraća tvoju demo mašinu → 5× tap radi ✅.
4. Demo user **bez markirane mašine** u DB-u (`is_demo_machine = false` svuda) → RPC vraća null → 5× tap = no-op ✅.

> Test 3 i 4 su kritični jer simuliraju prod build pre nego što ga zaista upload-uješ na TestFlight.

### 2.7 ReadLints na izmenjenim fajlovima

```bash
# Coder mora da provuče lint check
pnpm --filter sweatdrop-mobile-app lint
```

**Dependencies za Step 3:** Step 2.1 (proširen `ProfileData`) mora biti merged.

---

## Step 3 — Mobile UI/UX: vidljiv "DEMO MODE" indicator (mobile-ui-ux-agent)

### 3.1 Banner na svim screen-ovima za demo usere

**Cilj:** Apple reviewer i interni QA tim **uvek vide** da rade u demo modu (sprečava konfuziju "zašto su moji drops nestali" — demo nalozi mogu biti reset-ovani).

**Kreiraj:** `apps/mobile-app/components/DemoModeBanner.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDemoUser } from '@/hooks/useIsDemoUser';

/**
 * Slim banner shown across the app when the signed-in user has is_demo = true.
 * Gives Apple reviewers and internal QA visual confirmation they're in
 * a demo session. Real users never see this.
 */
export function DemoModeBanner() {
  const isDemo = useIsDemoUser();
  const insets = useSafeAreaInsets();
  if (!isDemo) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.text}>DEMO MODE — simulator unlocked</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 153, 0, 0.95)',
  },
  text: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
```

### 3.2 Mount-uj banner u root layout

**Fajl:** `apps/mobile-app/app/_layout.tsx`

Ubaci `<DemoModeBanner />` kao poslednji child unutar root `View`/`Stack` providera, posle Stack-a, da se renderuje preko svega:

```typescript
import { DemoModeBanner } from '@/components/DemoModeBanner';

// Inside RootLayout return:
<>
  <Stack screenOptions={...}>
    {/* ...existing screens... */}
  </Stack>
  <DemoModeBanner />
</>
```

> UI/UX agent: poštuj `useBranding()` ako želiš drugu boju, ali narandžasta `#FF9900` je intencional — vizuelno odudara od cyan brand boje da se ne pomeša sa real UI.

### 3.3 Localization

Dodaj ključ u `apps/mobile-app/locales/en/common.json` i `sr/common.json`:
```json
{ "demoMode": "DEMO MODE — simulator unlocked" }
```

I koristi ga u banneru kroz `useTranslation('common')`.

### 3.4 UX checklist (po `.cursor/rules/mobile-ui-ux-agent.mdc`)

- [ ] Banner ne preklapa kritične akcije (zauzima samo top safe-area + ~24px).
- [ ] `pointerEvents="none"` da ne blokira tap-ove ispod sebe.
- [ ] EN/SR localization dodat.
- [ ] No cross-workspace files dirano.

**Dependencies za Step 4:** nezavisno od Step 4.

---

## Step 4 — Admin Panel: superadmin UI za demo users i demo machines (admin-coder)

### 4.1 Strana: Demo Users management

**Cilj:** superadmin može da promoviše/demote-uje bilo kog usera u demo bez SQL-a (za buduće release-ove, sales demoe, novi reviewer nalozi).

**Kreiraj:** `apps/admin-panel/app/dashboard/demo-users/page.tsx`

**Funkcionalnost:**
- Server Component koji listuje sve `profiles` gde je `is_demo = true` (top of page) + search box za pronalaženje bilo kog usera po email/username.
- Klik na user → toggle button "Promote to demo" / "Revoke demo".
- Audit: prilikom toggle-a upisi red u `audit_log` (ako postoji takva tabela; vidi `MIGRATION_NOTES.md` da li je `email_change_audit` pattern primenjiv).
- **Dostupno samo `superadmin` roli** — ne gym_admin, ne receptionist.

**Server action:** `apps/admin-panel/lib/actions/demo-users.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ToggleSchema = z.object({
  user_id: z.string().uuid(),
  is_demo: z.boolean(),
});

export async function toggleDemoFlag(input: z.infer<typeof ToggleSchema>) {
  const parsed = ToggleSchema.parse(input);
  const supabase = await createClient();

  // Verify caller is superadmin (defense in depth — RLS already enforces, but
  // we want a friendly error before the round-trip).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (caller?.role !== 'superadmin') {
    throw new Error('Only superadmin can toggle demo flag');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_demo: parsed.is_demo })
    .eq('id', parsed.user_id);

  if (error) throw error;

  revalidatePath('/dashboard/demo-users');
}
```

### 4.2 Toggle "Demo machine" na postojećoj machines strani

**Fajl:** `apps/admin-panel/app/dashboard/gyms/[id]/machines/page.tsx` *(ili gde god je trenutno machine list)*

Dodaj kolonu/toggle "Demo machine" pored postojećih action-a (BLE pair, edit). Vidljiv samo `superadmin` roli.

**Server action:** `apps/admin-panel/lib/actions/demo-machines.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ToggleSchema = z.object({
  machine_id: z.string().uuid(),
  is_demo_machine: z.boolean(),
});

export async function toggleDemoMachine(input: z.infer<typeof ToggleSchema>) {
  const parsed = ToggleSchema.parse(input);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (caller?.role !== 'superadmin') {
    throw new Error('Only superadmin can mark demo machines');
  }

  const { error } = await supabase
    .from('machines')
    .update({ is_demo_machine: parsed.is_demo_machine })
    .eq('id', parsed.machine_id);

  if (error) throw error;

  revalidatePath(`/dashboard/gyms/[id]/machines`, 'page');
}
```

**UX:** mali narandžasti badge "DEMO" pored mašina koje su markirane, da staff lakše vidi. Toggle treba potvrdu prilikom uključivanja ("Apple/Google reviewer i interni QA mogu pokretati simulator workout-e na ovoj mašini. Da li si siguran?").

### 4.3 Sidebar entry

**Fajl:** `apps/admin-panel/components/Sidebar.tsx` *(ili gde god je sidebar definisan)*

Dodaj entry **vidljiv samo za `superadmin`**:

```typescript
{role === 'superadmin' && (
  <SidebarLink href="/dashboard/demo-users" icon={UserCog} label="Demo Users" />
)}
```

### 4.4 Middleware

**Fajl:** `apps/admin-panel/middleware.ts`

Dodaj `/dashboard/demo-users` u superadmin-only routes (ako middleware drži explicit listu; inače RLS + UI guard je dovoljno).

### 4.5 Smoke test

1. `pnpm env:admin:dev && pnpm dev:admin`
2. Uloguj se kao superadmin → otvori `/dashboard/demo-users` → search test email → toggle → verify u Supabase SQL editoru.
3. Uloguj se kao superadmin → otvori machines strana → toggle "Demo machine" na jednoj mašini → verify u Supabase.
4. Uloguj se kao gym_admin → pokušaj direktno `/dashboard/demo-users` → 403 / redirect; toggle "Demo machine" ne sme biti vidljiv.

**Dependencies za Step 5:** nezavisno.

---

## Step 5 — DevOps / EAS: split env per profile + store distribution (CEO/devops)

### 5.1 Update `apps/mobile-app/eas.json`

**Cilj:** `EXPO_PUBLIC_DEV_QR_UUID` ostaje **samo u dev/preview** profilima kao developer convenience. **Prod build ga uopšte nema** — Apple reviewer dobija demo mašinu kroz RPC `get_my_demo_machine()` server-side.

**Korak 1 — proveri EAS secrets:**

```bash
cd apps/mobile-app
eas secret:list
```

Ako se `EXPO_PUBLIC_DEV_QR_UUID` pojavi sa scope `project`, **ukloni ga** (bio bi nasleđen u prod build):

```bash
eas secret:delete --name EXPO_PUBLIC_DEV_QR_UUID
```

**Korak 2 — postavi env per profil u `eas.json`:**

```json
"development": {
  "developmentClient": true,
  "distribution": "internal",
  "env": {
    "EXPO_PUBLIC_APP_ENV": "development",
    "EXPO_PUBLIC_PUSH_ENABLED": "true",
    "EXPO_PUBLIC_DEV_QR_UUID": "<dev-machine-uuid>",
    "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
    "SENTRY_DISABLE_AUTO_UPLOAD": "true"
  }
},
"preview": {
  "distribution": "internal",
  "env": {
    "EXPO_PUBLIC_APP_ENV": "preview",
    "EXPO_PUBLIC_PUSH_ENABLED": "true",
    "EXPO_PUBLIC_DEV_QR_UUID": "<dev-machine-uuid>",
    "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
    "SENTRY_DISABLE_AUTO_UPLOAD": "true"
  }
},
"production": {
  "env": {
    "EXPO_PUBLIC_APP_ENV": "production",
    "EXPO_PUBLIC_PUSH_ENABLED": "true",
    "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
    "SENTRY_DISABLE_AUTO_UPLOAD": "true"
    // ← namerno BEZ EXPO_PUBLIC_DEV_QR_UUID
  }
}
```

**Kako simulator radi u prod build-u (recap):**

1. Apple reviewer se uloguje sa `apple-review@sweatdrop.com` (ima `is_demo = true` u prod DB-u).
2. `useIsDemoUser` vraća true → `DemoModeBanner` se prikaže.
3. `useDemoMachine` vidi da nema env var → poziva RPC `get_my_demo_machine()`.
4. RPC vraća prvu mašinu gde je `is_demo_machine = true` u prod Vortex gymu.
5. 5× tap otvara modal → `startDevelopWorkout(qrUuid)` koristi taj UUID za `get_machine_status` call.
6. Simulator workout teče, drops sleću u wallet demo naloga.

**Triple defense:**
- Sloj 1: `is_demo` na profilu (server-side, RLS-protected, samo superadmin menja).
- Sloj 2: `is_demo_machine` na mašini (server-side, samo superadmin menja).
- Sloj 3: env var `DEV_QR_UUID` namerno odsutan u prod (sprečava da non-demo build slučajno omogući brže triggerovanje).

Ako bilo koji od slojeva otkaže (npr. neko slučajno postavi `is_demo = true` na običnog usera), simulator i dalje neće pokrenuti session bez `is_demo_machine` mašine u tom gymu.

### 5.2 Postavi production EAS secrets (Supabase prod kredencijali)

```bash
cd apps/mobile-app

eas secret:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://qdtdfofodfdlutkmlzzf.supabase.co" --scope project --force

eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "<prod-anon-key>" --scope project --force

eas secret:create --name EXPO_PUBLIC_SITE_URL \
  --value "https://www.sweat-drop.com" --scope project --force

eas secret:create --name EXPO_PUBLIC_SENTRY_DSN \
  --value "<prod-sentry-dsn>" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \
  --value "<google-web-client-id>" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID \
  --value "<google-ios-client-id>" --scope project --force
```

> **Verifikuj:** `eas secret:list` → sve gore mora biti vidljivo, **`EXPO_PUBLIC_DEV_QR_UUID` ne sme biti.**

### 5.3 Bump verzije

**`apps/mobile-app/app.config.js`:**
- `version: '1.0.0'` → ostaje `'1.0.0'` za prvi pilot release (verzioniraj `1.0.1`, `1.0.2` za sledeće).
- `android.versionCode: 16` → bumpuj na `17`.
- `ios.buildNumber` → ako nije eksplicitan, EAS auto-bumpuje; možeš ga eksplicitno postaviti na `'17'`.

### 5.4 Build + submit

```bash
git checkout main
git merge features/dev   # samo posle što su Step 1-4 PR-ovi merged i smoke testovi prošli
git push origin main

cd apps/mobile-app

# iOS — production build → upload u App Store Connect
eas build --platform ios --profile production
eas submit --platform ios --latest

# Android — production build → upload u Play Console
eas build --platform android --profile production
eas submit --platform android --latest --track internal
# (kasnije promote-uj iz Internal u Closed Testing UI-jem)
```

### 5.5 Apple TestFlight — External Testing sa Public Link

**App Store Connect** (https://appstoreconnect.apple.com):

1. My Apps → **SweatDrop** → **TestFlight** tab.
2. Sačekaj da build (1.0.0 build 17) prođe **Processing** (~10–30 min) — biće "Ready to Submit".
3. **Test Information** (levo sidebar) — popuni:
   - **Beta App Description**: kratak opis za testere ("SweatDrop pilot za Vortex teretanu — Sweat Drops loyalty program preko BLE senzora").
   - **Feedback Email**: tvoj email.
   - **Privacy Policy URL**: `https://www.sweat-drop.com/privacy`.
4. **External Testing** sekcija → **+ Add New Group** → naziv "Vortex Pilot".
5. **Add Build to Group** → izaberi 1.0.0 (17) → submit za **Beta App Review**.
6. **Test Information za review** (popup posle submit-a):
   - **Sign-in required**: YES.
   - **Sign-in info**:
     ```
     Email:    apple-review@sweatdrop.com
     Password: <random-strong-password-koji-cuvas-u-1Passwordu>
     ```
   - **Notes** *(critical — paste ovo doslovno):*
     ```
     SweatDrop is a fitness loyalty platform that pairs with Bluetooth Low
     Energy (BLE) sensors physically installed on gym equipment (treadmills,
     bikes, ellipticals). Real workouts are tracked via these sensors;
     since they are not available at your test desk, we provide a demo
     simulator unlocked only for the reviewer account above.

     STEPS TO REVIEW WORKOUT FLOW:

     1. Open the app and tap "Continue with Email".
     2. Sign in with the credentials provided above
        (apple-review@sweatdrop.com).
     3. Once signed in, you will see an orange "DEMO MODE" banner at the
        top of the screen — this confirms simulator access is enabled.
     4. From the home screen, tap "Scan QR" (allow camera permission).
     5. On the scanner screen, tap the central scan frame 5 times in
        rapid succession. A simulator modal will appear.
     6. Choose "Bike", leave default values, tap "Start Simulator".
     7. A 60-second simulated workout will run automatically and credit
        Sweat Drops to the wallet.
     8. Tap back to home, open "Wallet" to see drops balance.
     9. Open "Store" to redeem a reward (use any reward, redemption is
        validated by the gym reception desk in real use).

     The simulator is gated server-side by `profiles.is_demo = true`
     and is invisible to all regular users.

     Bluetooth permission and Camera permission are required for
     normal use (sensor pairing + QR scanning of equipment).
     ```
7. Submit → Apple Beta App Review (1–2 dana prvi put).
8. Posle approval-a → ista grupa → **Enable Public Link** → kopiraj URL `https://testflight.apple.com/join/XXXXXXXX`.
9. Pošalji link Vortex iOS korisnicima.

> **Sledeći buildovi sa istom verzijom (1.0.0 build 18, 19...) NE prolaze ponovo Beta Review** — instant raspoloživi testerima.
> **Nova verzija (1.0.1)** = ponovni Beta Review.

### 5.6 Google Play — Closed Testing sa Web Link

**Play Console** (https://play.google.com/console):

1. SweatDrop → Testing → **Closed testing** → **Create track** → naziv "vortex-pilot".
2. **Create new release** → Upload AAB (već je tu posle `eas submit --track internal`, ili direktno upload .aab iz EAS build artifacta).
3. **Release notes** *(EN i SR)*:
   ```
   en-US: First Vortex pilot build. Sweat Drops loyalty program with BLE sensor support.
   sr-RS: Prva Vortex pilot verzija. Sweat Drops loyalty program sa BLE senzorima.
   ```
4. **Save → Review release → Start rollout to Closed testing**.
5. **Testers** tab unutar "vortex-pilot" track-a:
   - **Add testers**: kreiraj novu listu "Vortex Members" (možeš ostaviti praznu na početku).
   - **How testers join your test**:
     - Toggle ON "Anyone with the link can opt-in".
     - Kopiraj **Opt-in URL** (`https://play.google.com/apps/testing/com.sweatdrop.app`).
6. **Countries / regions**: izaberi RS (Srbija) za pilot.
7. Sačekaj Google review (~1–3 dana prvi put).
8. Posle approval-a → pošalji opt-in URL Vortex Android korisnicima.

> **Posle 14 dana sa 12+ active testera** ispunjavaš Google-ov requirement za promociju u Production track.

### 5.7 Reviewer credential management

- Demo nalog (`apple-review@sweatdrop.com`) i password čuvaj u **1Password / Bitwarden vault** koji ima samo CEO + tech lead pristup.
- Posle svake major verzije (`1.x.0`), rotiraj password i update-uj reviewer notes pre submit-a.

**Dependencies:** Step 1, 2, 3, 4 svi merged na `main`.

---

## Step 6 — Final Audit (reviewer)

Pre nego što CEO klikne `eas build --profile production`, **reviewer** mora da prođe checklist (po `.cursor/rules/reviewer.mdc`):

### Architecture & Workspace
- [ ] Step 1 (DB) ne dira frontend.
- [ ] Step 2 (mobile) ne dira admin panel ili migracije.
- [ ] Step 3 (UI/UX) koristi samo React Native komponente, no DOM.
- [ ] Step 4 (admin) koristi `@supabase/ssr`, ne `@supabase/supabase-js`.

### Security
- [ ] `profiles.is_demo` ima RLS koji dozvoljava UPDATE samo `superadmin` (ili column-level revoke).
- [ ] `machines.is_demo_machine` isto — samo superadmin može da menja.
- [ ] `useIsDemoUser` čita iz authStore-a, ne iz lokalnog state-a.
- [ ] `handleScanAreaTap` i `startDevelopWorkout` oba imaju `if (!isDemoUser || !demoQrUuid) return`.
- [ ] `useDemoMachine` ne fetch-uje RPC za non-demo usere (early return na `!isDemo`).
- [ ] RPC `get_my_demo_machine` ima `SECURITY DEFINER` ALI proverava `is_demo` unutar funkcije.
- [ ] EAS production profil i EAS secrets **ne sadrže `EXPO_PUBLIC_DEV_QR_UUID`**.
- [ ] Demo nalog password je strong random, čuvan u password manageru.
- [ ] Triple defense potvrđen: probaj u dev build-u sa `is_demo = false` na mašini → modal se otvara, ali Start puca jer RPC vraća null → očekivano.

### Memory / Lifecycle
- [ ] `DemoModeBanner` ne uvodi useEffect bez cleanup-a.
- [ ] `useIsDemoUser` koristi `useAuthStore` selector pattern (ne uzrokuje re-render kompletne komponente).

### Type Safety
- [ ] `ProfileData.is_demo: boolean` ne `boolean | undefined` — RPC vraća `COALESCE(..., false)`.
- [ ] `database.types.ts` regenerisan posle migracija.

### Testing
- [ ] Ručno: signin kao non-demo → 5× tap = ništa. ✅
- [ ] Ručno: signin kao demo → orange banner pojavi se → 5× tap = modal otvori. ✅
- [ ] Ručno: u admin panelu superadmin može da toggleuje, gym_admin ne može. ✅
- [ ] Apple reviewer notes copy-paste je gramatički ispravan engleski.

### Release Hygiene
- [ ] `CHANGELOG.md` updated sa entry-em "Added `profiles.is_demo` and `machines.is_demo_machine` flags + `get_my_demo_machine()` RPC to gate simulator behind server-side demo accounts and designated machines; production builds no longer ship simulator entry to regular users."
- [ ] `MIGRATION_NOTES.md` updated sa nove tri migracije (`is_demo`, `is_demo_machine` + RPC, `get_my_profile` proširenje).
- [ ] `STATE_OF_THE_APP.md` "Current Focus" pomeren na "External pilot release — Vortex".

---

## Rollback Plan

Ako **Apple odbije Beta App Review** zbog nečeg drugog (ne demo flow):
1. Ne treba rollback DB-a — `is_demo` flag ne smeta produkciji.
2. Fix problem u Step 2 ili 3 → bump build (1.0.0 build 18) → resubmit.
3. Demo nalog ostaje aktivan i u sledećem submit-u.

Ako **demo flag uzrokuje bug u prod-u** (npr. realan korisnik slučajno vidi banner):
1. SQL u prod: `UPDATE profiles SET is_demo = false WHERE id = '<bad-user>';` — instant fix.
2. Korisnik refreshuje app (re-fetches profile) → banner i simulator nestaju.

Ako **simulator u demo modu sruši app** za reviewera:
1. OTA update preko EAS-a: `eas update --branch production --message "Fix simulator crash"` — JS-only fix stiže reviewer-u u par minuta.
2. Ako je nativna izmena potrebna → bump versionCode/buildNumber → novi build → reviewer dobija update preko TestFlight automatski.

---

## Timeline (procena)

| Step | Vlasnik | Trajanje | Blocker za |
|------|---------|----------|------------|
| 1. DB migracije (is_demo + is_demo_machine + RPCs) | supabase-dba | 2–3 h | Step 2, 4 |
| 2. Mobile gate + `useDemoMachine` resolver | mobile-coder | 1.5 h | Step 5.4 |
| 3. UI/UX banner | mobile-ui-ux-agent | 30 min | Step 5.4 |
| 4. Admin demo users + demo machines toggle | admin-coder | 3–4 h | seed demo mašine |
| 5. EAS + store submit | devops/CEO | 1 h aktivno + 1–3 dana review | pilot start |
| 6. Reviewer audit | reviewer | 1 h | merge `main` |

**Realističan total do "link u rukama Vortex testera":** 2–4 radna dana + 1–3 dana Apple/Google review.

---

## Out of Scope (za sledeću iteraciju)

- Razdvajanje bundle ID-a `com.sweatdrop.app.dev` za internu dev distribuciju (vidi `GO_LIVE.md` Sekcija 0). Trenutno ostaje sve pod `com.sweatdrop.app`.
- Automatic demo session reset (cron koji svakih 24h briše demo workout/redemption podatke da apple-review nalog ostane "čist").
- Sales demo flow (multi-gym demo nalog za prikazivanje potencijalnim klijentima) — ovaj plan pokriva samo Apple/Google reviewer use case.
- Public TestFlight i Open Testing track-ovi za drugu teretanu — radimo posle što Vortex pilot uđe u stabilnu fazu.

---

## Reference

- `GO_LIVE.md` — high-level go-live plan (bundle ID, env strategy, distribucija).
- `PRODUCTION.md` — full 260-step produkcioni playbook.
- `ENVIRONMENTS.md` — dev/prod env switching.
- `.cursor/rules/architect.mdc` — pravila za ovaj plan format.
- `.cursor/rules/supabase-dba.mdc`, `mobile-coder.mdc`, `admin-coder.mdc`, `mobile-ui-ux-agent.mdc`, `reviewer.mdc` — agent briefing-i.
