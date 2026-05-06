# Feature: Enable Elliptical + Stepper in Admin Machine Management

## Context
Superadmin trenutno moze da doda masinu samo sa tipom `treadmill` ili `bike` u admin panelu, iako aplikacija vec na vise mesta poznaje `elliptical` i `stepper` (analytics, economy kalkulacija, deo UI labela). Cilj je da se ova dva tipa uvedu kao full first-class opcije u svim relevantnim admin tokovima za kreiranje i izmenu masina, bez regresije postojecih flow-ova.

## Dependencies
- [ ] Potvrditi da je `machines.type` u bazi i dalje `text` / kompatibilan za nove vrednosti (bez enum blokade).
- [ ] Potvrditi da postojece putanje koje rade specijalno ponasanje za bike QR (`?s=csc`) ostanu netaknute.
- [ ] Obezbediti da frontend forme i server actions koriste isti skup dozvoljenih tipova.

## Workspace Assignment
- `admin-coder` -> `apps/admin-panel/` (glavni implementation scope)
- `supabase-dba` -> `backend/supabase/` (sanity check da nema DB ogranicenja; migration samo ako je zaista potrebna)
- `reviewer` -> QA/regresija i arhitekturna uskladjenost

## Data Model Changes
- Primarno: **No schema change expected**.
- Ocekivanje: `public.machines.type` ostaje `text` i prima nove string vrednosti.
- Ako se nadje DB CHECK/constraint koji ogranicava tipove, `supabase-dba` kreira ciljanu migraciju koja dodaje `elliptical` i `stepper` u dozvoljeni skup.
- RLS: bez promena.

## API Contracts
Interni ugovori koje treba uskladiti:

1. `createMachine` input (`apps/admin-panel/lib/actions/machine-actions.ts`)
   - sa: `type: 'treadmill' | 'bike'`
   - na: `type: 'treadmill' | 'bike' | 'elliptical' | 'stepper'`

2. `updateMachine` input (`apps/admin-panel/lib/actions/machine-actions.ts`)
   - sa: `type?: 'treadmill' | 'bike'`
   - na: `type?: 'treadmill' | 'bike' | 'elliptical' | 'stepper'`

3. Form validation (Zod) i lokalni TS tipovi u admin komponentama moraju imati isti union kao server action.

## Execution Plan

### Step 1: Source-of-truth machine type constants (admin-coder)
- Uvesti jedinstveni skup machine type opcija u admin panel scope-u (npr. shared konstante + label/icon map) i koristiti ga u svim create/edit select kontrolama.
- Obuhvatiti minimum:
  - `apps/admin-panel/components/modules/MachinesManager.tsx`
  - `apps/admin-panel/components/modules/MachineDetailView.tsx`
  - `apps/admin-panel/components/analytics/MachineFloor.tsx`

### Step 2: Server action validation and typing (admin-coder)
- Prosiriti Zod validaciju i TS tipove u:
  - `apps/admin-panel/lib/actions/machine-actions.ts`
- Potvrditi da insert/update prema tabeli `machines` radi bez dodatnih cast/transform pravila.

### Step 3: Display fallback and labels (admin-coder)
- U listama i edit modalima zameniti ternarne prikaze tipa (`treadmill` vs `bike`) sa map-based prikazom koji podrzava sva 4 tipa.
- Potvrditi konzistentan emoji/label prikaz:
  - `🏃 Treadmill`
  - `🚴 Bike`
  - `⭕ Elliptical`
  - `🪜 Stepper`

### Step 4: QR and workflow compatibility checks (admin-coder)
- Verifikovati da `machineQrUrl` i dalje dodaje `?s=csc` **samo** za `bike`.
- Za `elliptical` i `stepper` QR payload ostaje standardan (`/m/<uuid>` bez dodatnog query parametra), osim ako product ne zatrazi drugacije.

### Step 5: DB guardrail check (supabase-dba)
- Potvrditi da ne postoji DB constraint koji bi odbio nove tipove pri insert/update.
- Ako postoji, napraviti minimalnu migraciju i dopuniti `MIGRATION_NOTES.md`.

### Step 6: Regression tests and QA (reviewer)
- Proci kroz superadmin flow:
  - Create machine sa `elliptical`
  - Create machine sa `stepper`
  - Edit postojecu masinu i promena tipa ka novim vrednostima
- Proveriti da screens koji prikazuju tip ne pucaju i da nije ostao hardkodovan bike/treadmill ternary.
- Proveriti da bike QR i dalje ima `?s=csc`, a ostali tipovi ne.

## Testing Requirements
- Manual:
  - Superadmin moze da doda i snimi `elliptical` i `stepper`.
  - Novi tipovi se ispravno renderuju u listama, detail view-u i floor view-u.
  - Edit + save radi bez server validation greske.
- Automated:
  - Dodati/azurirati testove gde postoje hardcoded machine type unions (posebno gde se validira form schema ili render tip labela).
- Negative:
  - Nevalidan `type` i dalje mora da bude odbijen validacijom.

## Rollout Notes
- Scope je backward-compatible: postojeci `treadmill`/`bike` podaci i flow ostaju validni.
- Nema potrebe za feature flag-om ako DB prima nove vrednosti.
