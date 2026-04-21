# Step 6 — Final Audit (reviewer)

> **Za koga:** `reviewer` agent. Ovo je gate pre nego što CEO klikne `eas build --profile production`.
>
> **Tvoja uloga (po `.cursor/rules/reviewer.mdc`):** read-only audit. Ne menjaj kod. Ako nešto fali, vrati ticket appropriate-nom Coderu sa konkretnim korakom.

---

## Mandatory pre-read

1. `CHANGELOG.md` — recent merges.
2. `MIGRATION_NOTES.md` — verifikuj da su sve tri migracije iz Step 1 push-nute u DEV i PROD.
3. `STATE_OF_THE_APP.md` — current focus.
4. Plan fajlovi koje su Coder-i izvršili:
   - [`01_supabase_dba.md`](./01_supabase_dba.md)
   - [`02_mobile_coder.md`](./02_mobile_coder.md)
   - [`03_mobile_ui_ux.md`](./03_mobile_ui_ux.md)
   - [`04_admin_coder.md`](./04_admin_coder.md)
5. `apps/mobile-app/components/ScannerScreen.tsx` (refaktor verifikacija).
6. `apps/mobile-app/eas.json` (verifikacija prod profila).

---

## Dependencies (BLOCKER)

- ✅ Step 1, 2, 3, 4 svi merged u `features/dev`.
- ✅ Build prošao u DEV preview profilu bez crash-eva.

---

## Audit Checklist

### Architecture & Workspace Boundaries

- [ ] Step 1 (DB) **ne dira** `apps/`.
- [ ] Step 2 (mobile) **ne dira** `apps/admin-panel/` ni `backend/supabase/`.
- [ ] Step 3 (UI/UX) koristi samo React Native komponente — `<View>`, `<Text>`. **0** DOM elemenata (`<div>`, `<span>`).
- [ ] Step 4 (admin) koristi `@supabase/ssr` (ne `@supabase/supabase-js`), Server Components default, Tailwind classes.

### Security

- [ ] `profiles.is_demo` ima RLS koji dozvoljava `UPDATE` samo `superadmin` (ili column-level `REVOKE UPDATE (is_demo)`). Verifikuj sa:
  ```sql
  SELECT * FROM pg_policies WHERE tablename = 'profiles' AND policyname LIKE '%is_demo%';
  ```
- [ ] `machines.is_demo_machine` isto — samo superadmin može da menja (RLS ili column-level revoke).
- [ ] `useIsDemoUser` čita iz `authStore`-a kroz selector (ne lokalni state, ne useEffect-driven fetch).
- [ ] `handleScanAreaTap` u `ScannerScreen.tsx` ima `if (!isDemoUser || !demoQrUuid) return` kao prvi red.
- [ ] `startDevelopWorkout` u `ScannerScreen.tsx` ima istu guard.
- [ ] `useDemoMachine` ima early return na `!isDemo` (ne fetch-uje RPC za non-demo usere).
- [ ] RPC `get_my_demo_machine` ima `SECURITY DEFINER` ALI proverava `p.is_demo = true` unutar funkcije. Verifikuj sa `\df+ public.get_my_demo_machine`.
- [ ] **`EXPO_PUBLIC_DEV_QR_UUID` NE postoji u `eas.json` `production.env`.** Verifikuj direktno:
  ```bash
  grep -c "DEV_QR_UUID" apps/mobile-app/eas.json
  # Mora vratiti 2 ili manje (samo development + preview)
  ```
- [ ] `eas secret:list` ne sadrži `EXPO_PUBLIC_DEV_QR_UUID` na project scope-u.
- [ ] Demo nalog password (Apple reviewer) je strong random (≥16 chars), čuvan u password manageru, NIJE u repo-u.
- [ ] **Triple defense potvrđen:** u DEV build-u sa `is_demo = false` na mašini → modal se otvori (jer demo user prošao prvi gate), ali Start puca jer RPC vraća null → ✅ očekivano.
- [ ] **Trace check:** `rg "DEV_QR_UUID" apps/mobile-app/components/ScannerScreen.tsx` mora vratiti samo komentare, **0** code referenci.

### Memory / Lifecycle

- [ ] `DemoModeBanner` ne koristi `useEffect` (čisti render based on hook value).
- [ ] `useIsDemoUser` koristi `useAuthStore((s) => s.profile?.is_demo ?? false)` selector pattern → ne re-rendera kompletan layout pri svakom auth update-u.
- [ ] `useDemoMachine` ima cleanup u `useEffect` (`cancelled` flag) → ne setuje state posle unmount-a.

### Type Safety

- [ ] `ProfileData.is_demo: boolean` (NE `boolean | undefined`) — RPC vraća `COALESCE(..., false)`.
- [ ] `backend/types/database.types.ts` regenerisan posle migracija; sadrži `is_demo` na `profiles` row tipu i `is_demo_machine` na `machines` row tipu.
- [ ] `pnpm --filter sweatdrop-mobile-app type-check` čist.
- [ ] `pnpm --filter sweatdrop-admin-panel type-check` čist.

### Lint

- [ ] `pnpm --filter sweatdrop-mobile-app lint` čist.
- [ ] `pnpm --filter sweatdrop-admin-panel lint` čist.

### Manual Testing (verifikuj sa CEO/QA)

- [ ] Sign-in kao **non-demo user** → 5× tap = ništa. Banner ne postoji. ✅
- [ ] Sign-in kao **demo user** sa env varom (DEV) → orange banner pojavi se → 5× tap = modal otvori. ✅
- [ ] Sign-in kao **demo user bez env vara** (privremeno obriši env, restart app) → RPC fallback radi → 5× tap = modal otvori, simulator radi. ✅
- [ ] Demo user sa env varom, ali **bez** markirane mašine (`is_demo_machine = false` svuda) — u prod-relevantnom test scenariju (env obrisan): RPC vraća null → tap = ništa. ✅
- [ ] U admin panelu **superadmin** može da toggleuje `is_demo` na useru i `is_demo_machine` na mašini, sa toast confirmation.
- [ ] U admin panelu **gym_admin** ne sme da vidi "Demo Users" link, ne sme da vidi "Demo machine" toggle, direktan URL `/dashboard/demo-users` redirect-uje.
- [ ] **Apple reviewer notes** copy (u `05_devops.md` Sekcija 5.5) — gramatički ispravan engleski, koraci jasni, koristi `apple-review@sweatdrop.com`.

### Localization

- [ ] `apps/mobile-app/locales/en/common.json` ima `demoMode`.
- [ ] `apps/mobile-app/locales/sr/common.json` ima `demoMode`.
- [ ] Banner promeni tekst kad se promeni jezik (manual test).

### Release Hygiene

- [ ] `CHANGELOG.md` ima entry:
  > "Added `profiles.is_demo` and `machines.is_demo_machine` flags + `get_my_demo_machine()` RPC to gate simulator behind server-side demo accounts and designated machines; production builds no longer ship simulator entry to regular users."
- [ ] `MIGRATION_NOTES.md` ima sve tri migracije iz Step 1 (`is_demo`, `is_demo_machine` + RPC, `get_my_profile` proširenje).
- [ ] `STATE_OF_THE_APP.md` "Current Focus" ažuriran na "External pilot release — Vortex".

---

## Failure protokol

Ako bilo koji ✅ ne prođe:
1. **NE pokreći Step 5.**
2. Otvori ticket sa konkretnim korakom u relevant Coder-ov plan fajl ([`01_*.md`](./01_supabase_dba.md), [`02_*.md`](./02_mobile_coder.md), itd.).
3. Reci kratko šta fali, npr.: *"`useDemoMachine` nema cleanup → mobile-coder, dodaj `cancelled` flag u useEffect."*
4. Posle fix-a → ponovi audit.

---

## Sign-off

Kad sve ✅ prođe, javi CEO sa rezimom:
> "External pilot audit prošao. Triple defense radi (server profile flag + server machine flag + odsustvo env vara u prod). Spreman za `eas build --profile production`. Reviewer notes verified."

---

## Out of scope za tebe

- ❌ Pisanje koda (samo audit).
- ❌ EAS / store submission (DevOps/CEO zaduženje).
- ❌ Database operations (DBA zaduženje).
