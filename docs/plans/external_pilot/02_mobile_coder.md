# Step 2 — Mobile App: Gate Simulator iza `is_demo` (mobile-coder)

> **Za koga:** `mobile-coder` agent. Radiš samo u `apps/mobile-app/`.
>
> **Tvoja uloga (po `.cursor/rules/mobile-coder.mdc`):** React Native + Expo. Ne diraj `apps/admin-panel/` ni `backend/supabase/`. Koristi `<View>`, `<Text>`, `StyleSheet`, `@supabase/supabase-js`.

---

## Mandatory pre-read

1. `CHANGELOG.md` — recent mobile changes.
2. `MIGRATION_NOTES.md` — verifikuj da je Step 1 (DBA) gotov i da `database.types.ts` regenerisan.
3. `ARCHITECTURE.md` (sekcija "Mobile App") — patterns.
4. `STATE_OF_THE_APP.md` — current focus.
5. `apps/mobile-app/lib/stores/authStore.ts` — `ProfileData` interface (red 34).
6. `apps/mobile-app/components/ScannerScreen.tsx` — fokusno linije 61, 148–150, 805–876, 1158.

---

## Dependencies (BLOCKER)

- ✅ Step 1 (supabase-dba) merged u `features/dev`.
- ✅ `backend/types/database.types.ts` sadrži `profiles.is_demo` i `machines.is_demo_machine`.
- ✅ DEV Supabase ima migracije pushed (testiraćeš lokalno protiv DEV-a).

Ako bilo šta od navedenog nije gotovo, **STOP** i javi.

---

## Context

Trenutno na `ScannerScreen.tsx`:
- Linija 61: `const DEV_QR_UUID = process.env.EXPO_PUBLIC_DEV_QR_UUID || '';`
- Linija 865 (`handleScanAreaTap`): 5× tap otvara simulator modal **ako** `DEV_QR_UUID` nije prazan.
- Linija 879 (`startDevelopWorkout`): pokreće simulator session.

Problem: u prod build-u, ako env var slučajno ostane setovan, **bilo koji korisnik** može da otkrije gesture i farma drops bez fizičkog workout-a (fraud surface).

Rešenje: dvostruki gate — `profiles.is_demo = true` (server-side flag) + UUID demo mašine resolve-ovan iz nove RPC `get_my_demo_machine()`. Env var ostaje samo developer convenience u dev/preview.

---

## Tasks

### 2.1 Proširi `ProfileData` tip

**Fajl:** `apps/mobile-app/lib/stores/authStore.ts`

Dodaj `is_demo: boolean` na kraj `ProfileData` interface (red ~57, posle `onboarding_completed`):

```typescript
export interface ProfileData {
  // ...sve postojeće kolone bez izmene...
  onboarding_completed: boolean;
  is_demo: boolean;
}
```

> RPC `get_my_profile()` koja se koristi u `fetchProfile`/`refreshProfile` sad vraća `is_demo` kolonu (`COALESCE(p.is_demo, false)` je server-side, pa neće biti `null`). Frontend tip je `boolean`, ne `boolean | undefined`.

### 2.2 Hook `useIsDemoUser`

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

> Koristi selector pattern (`useAuthStore((s) => ...)`) — komponente koje pozovu hook re-render-uju se samo kad se `is_demo` promeni, ne pri svakom auth update-u.

### 2.3 Hook `useDemoMachine` (resolver za demo mašinu)

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

### 2.4 Refaktor `ScannerScreen.tsx`

**Fajl:** `apps/mobile-app/components/ScannerScreen.tsx`

**A. Imports (oko linije 50):**
```typescript
import { useIsDemoUser } from '@/hooks/useIsDemoUser';
import { useDemoMachine } from '@/hooks/useDemoMachine';
```

**B. Ukloni hard-coded constantu (linija 61):**
```typescript
// ❌ Obriši ovaj red:
// const DEV_QR_UUID = process.env.EXPO_PUBLIC_DEV_QR_UUID || '';
```

**C. Pozovi hookove unutar komponente (posle `const branding = useBranding();`, ~linija 141):**
```typescript
const isDemoUser = useIsDemoUser();
const { qrUuid: demoQrUuid } = useDemoMachine();
```

**D. Update `handleScanAreaTap` (linija 865):**
```typescript
const handleScanAreaTap = () => {
  if (!isDemoUser || !demoQrUuid) return;
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

**E. Update `startDevelopWorkout` (linija 879):**

Sve `DEV_QR_UUID` reference unutar funkcije zameni sa `demoQrUuid`. Prvi red je dupli gate:

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
      p_qr_uuid: demoQrUuid,    // ← bilo DEV_QR_UUID
    });

    // ...ostatak funkcije nepromenjen...
  } catch (error: any) {
    // ...
  }
};
```

> **Trace check:** pretraži ceo fajl za `DEV_QR_UUID` (case-insensitive). Mora biti **0 hits** posle refaktora osim u komentarima.

**F. Update komentar (linija 864):**
```typescript
// 5x tap opens simulator modal — ONLY when:
//   1. Current user has profiles.is_demo = true (server-side flag), AND
//   2. A demo machine UUID is resolvable (env in dev/preview, or RPC
//      get_my_demo_machine() in production).
// Production builds do NOT ship EXPO_PUBLIC_DEV_QR_UUID; demo machine
// is resolved server-side and requires machines.is_demo_machine = true.
```

**G. Pressable wrapper komentar (linija 1158):**
```typescript
{/* Scan Frame with Premium Animations — 5x tap opens simulator (DEMO USERS ONLY) */}
<Pressable onPress={handleScanAreaTap}>
  {/* ...frame UI nepromenjen... */}
</Pressable>
```

---

## Smoke Tests (lokalno protiv DEV Supabase)

**Setup u DEV Supabase SQL editoru:**
```sql
-- Tvoj test nalog → demo:
UPDATE profiles SET is_demo = true WHERE email = '<tvoj-test-email>';

-- Test mašina → demo machine:
UPDATE machines SET is_demo_machine = true WHERE id = '<dev-bike-uuid>';
```

**Komande:**
```bash
pnpm env:dev
pnpm dev:mobile
```

**Test scenarios (sve ✅):**
- [ ] **Non-demo user** (`is_demo = false`) → 5× tap = ništa, modal se ne otvara.
- [ ] **Demo user sa env varom** (`EXPO_PUBLIC_DEV_QR_UUID` setovan u `.env.dev.local`): 5× tap otvara modal, Start radi, simulator session se kreira. ✅
- [ ] **Demo user BEZ env vara** (privremeno obriši `EXPO_PUBLIC_DEV_QR_UUID` iz `.env.dev.local`, restart app): `useDemoMachine` poziva RPC → vraća tvoju demo mašinu → 5× tap radi. ✅ **(Ovo simulira prod build.)**
- [ ] **Demo user, ali nijedna mašina nema `is_demo_machine = true`**: RPC vraća null → 5× tap se izvrši ali modal se ne otvara (jer `demoQrUuid` je null).
- [ ] **Demo user → revoke flag** (`UPDATE profiles SET is_demo = false`): osveži app (sign out / sign in) → 5× tap više ne radi.

> Test 3 i 4 su kritični — oni potvrđuju da prod build (bez env vara) i dalje radi za reviewer-a.

---

## Lint / Type check

```bash
pnpm --filter sweatdrop-mobile-app lint
pnpm --filter sweatdrop-mobile-app type-check
```

Oba moraju biti čista. Ako uvedeš lint warning, popravi ga pre nego što javiš da je gotovo.

---

## Handoff

Mobile-ui-ux-agent (Step 3) treba `useIsDemoUser` hook za `DemoModeBanner`. Hook je dostupan posle merge-a 2.2.

Ne diraj `_layout.tsx` — to je u Step 3 zaduženje.

---

## Out of scope za tebe

- ❌ Admin panel (`apps/admin-panel/**`).
- ❌ Migracije (`backend/supabase/**`).
- ❌ `_layout.tsx` mount banner-a (UI/UX agent).
- ❌ EAS config / store submission.
