# Step 4 — Admin Panel: Demo Users + Demo Machines (admin-coder)

> **Za koga:** `admin-coder` agent. Radiš samo u `apps/admin-panel/`.
>
> **Tvoja uloga (po `.cursor/rules/admin-coder.mdc`):** Next.js 15 App Router. Server Components default, Server Actions za mutacije, `@supabase/ssr` (ne `@supabase/supabase-js`), Tailwind CSS, React Query za client fetching.

---

## Mandatory pre-read

1. `CHANGELOG.md` — recent admin changes.
2. `MIGRATION_NOTES.md` — verifikuj `profiles.is_demo` i `machines.is_demo_machine` postoje u DEV i PROD.
3. `ARCHITECTURE.md` (sekcija "Admin Panel") — patterns.
4. `STATE_OF_THE_APP.md` — current focus.
5. `apps/admin-panel/middleware.ts` — postojeća RBAC logika.
6. `apps/admin-panel/components/Sidebar.tsx` *(ili kako god se zove)* — sidebar pattern.
7. `apps/admin-panel/app/dashboard/gyms/[id]/machines/page.tsx` *(ili sl.)* — postojeći machine list, dodaješ toggle.

---

## Dependencies (BLOCKER)

- ✅ Step 1 (supabase-dba) merged → `profiles.is_demo` i `machines.is_demo_machine` kolone postoje, RLS i RPC u redu.
- Ne zavisiš od Step 2/3.

Ako migracije nisu push-nute, **STOP**.

---

## Context

Trenutno se demo flag postavlja ručno SQL-om u Supabase dashboardu. To nije održivo:
- Buduće reviewer naloge dodaješ često (svaki major release).
- Nove demo mašine (drugi gym, sales demo) treba bez dev pristupa Supabase-u.
- Audit trail je pun smisao kroz UI, ne kroz raw SQL.

Treba ti **dva mesta u admin panelu**:
1. **Nova strana `/dashboard/demo-users`** — superadmin search + toggle `is_demo`.
2. **Toggle "Demo machine" na postojećoj machines strani** — superadmin može markirati pojedine mašine kao demo.

Oba su **strogo superadmin-only** (ne gym_admin, ne receptionist).

---

## Tasks

### 4.1 Server action: `toggleDemoFlag`

**Kreiraj:** `apps/admin-panel/lib/actions/demo-users.ts`

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

> Defense in depth: RLS već dozvoljava update samo superadmin-u, ali eksplicitan UI-side check daje jasniju grešku korisniku pre round-trip-a.

### 4.2 Strana: `/dashboard/demo-users/page.tsx`

**Kreiraj:** `apps/admin-panel/app/dashboard/demo-users/page.tsx`

**Funkcionalnost (Server Component + jedan Client child za search):**
- **Top sekcija:** lista svih usera gde je `is_demo = true` — email, username, role, gym, kreirano. Svaki red ima "Revoke demo" button.
- **Search box (Client Component):** input za email/username. On submit / debounce 300ms → query svih `profiles` koji match-uju + button "Promote to demo" za svaki rezultat.
- **Empty state:** "No demo users yet. Create one by signing up an account, then promoting it here."
- **Toast posle toggle-a** (`sonner`): "User promoted to demo" / "Demo flag revoked".

**Layout (Tailwind):**
- Page title `Demo Users` + descripcija "Reviewer accounts and internal QA. Promote sparingly — demo users bypass workout machine locks."
- Sve karte u standardnom dashboard padding-u (12 / 16).
- Narandžasti badge `DEMO` (`bg-orange-500/20 text-orange-400`) pored email-a u "current demo users" listi — vizuelno match-uje `DemoModeBanner` u mobile app-u.

**Server query primer:**
```typescript
const supabase = await createClient();
const { data: demoUsers } = await supabase
  .from('profiles')
  .select('id, email, username, role, home_gym_id, created_at')
  .eq('is_demo', true)
  .order('created_at', { ascending: false });
```

> Ne fetchuj sve usere u Server Component-u — search-uj on-demand u Client Component-u kada user kuca.

### 4.3 Server action: `toggleDemoMachine`

**Kreiraj:** `apps/admin-panel/lib/actions/demo-machines.ts`

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

  revalidatePath('/dashboard/gyms', 'layout');
}
```

### 4.4 Toggle na postojećoj machines strani

**Fajl:** `apps/admin-panel/app/dashboard/gyms/[id]/machines/page.tsx` *(verifikuj tačan path; ako se zove drugačije, prilagodi)*

**UX dodaci (samo za superadmin role):**
- Nova kolona "Demo" u machines tabeli, ili akcija unutar postojećeg dropdown-a za svaku mašinu.
- **Confirmation modal** kad se toggle uključuje:
  > "Mark this machine as a demo machine? Apple/Google reviewers and internal QA will be able to start simulator workouts attached to this machine. Real members can still scan it normally."
- **Confirmation kad se isključuje:**
  > "Stop exposing this machine to demo simulators?"
- Vizuelni indikator: narandžasti badge `DEMO` pored imena mašine u listi.

**RBAC u UI-u:**
```typescript
{caller?.role === 'superadmin' && (
  <DemoMachineToggle machine={machine} />
)}
```

Gym admin / receptionist **ne sme** ni da vidi toggle.

### 4.5 Sidebar entry

**Fajl:** `apps/admin-panel/components/Sidebar.tsx` *(ili gde se sidebar definiše)*

Dodaj entry vidljiv samo za superadmin:

```typescript
{role === 'superadmin' && (
  <SidebarLink
    href="/dashboard/demo-users"
    icon={UserCog}
    label="Demo Users"
  />
)}
```

> Ikona: `UserCog` ili `Shield` iz `lucide-react`. Prati postojeći sidebar pattern (npr. `Settings` link).

### 4.6 Middleware

**Fajl:** `apps/admin-panel/middleware.ts`

Dodaj `/dashboard/demo-users` u superadmin-only routes (ako middleware drži explicit listu). Ako middleware oslanja čisto na RLS + per-page checks, ovaj korak nije neophodan, ali je bolja praksa imati eksplicitan redirect za neautorizovane korisnike (ne 404, već clean redirect na `/dashboard`).

---

## Smoke Tests

```bash
pnpm env:admin:dev
pnpm dev:admin
# Otvori http://localhost:3000
```

- [ ] Login kao **superadmin** → vidiš "Demo Users" link u sidebar-u → klik → strana se učita.
- [ ] Search box → unesi email → vidiš rezultate sa "Promote" button-om.
- [ ] Klik "Promote" → toast success → user se pojavi u "Current demo users" sekciji sa narandžastim badge-om.
- [ ] Klik "Revoke demo" → user nestane iz liste.
- [ ] Verifikuj u Supabase: `SELECT email, is_demo FROM profiles WHERE email = '<test>';` reflectuje toggle.
- [ ] Otvori machines stranu Vortex gyma → vidiš "Demo" toggle pored svake mašine → klik → confirmation → toggle ON → badge se pojavi.
- [ ] Verifikuj u Supabase: `SELECT name, is_demo_machine FROM machines WHERE id = '<test>';`
- [ ] Login kao **gym_admin** → "Demo Users" link **NE sme** biti vidljiv → direktan URL `/dashboard/demo-users` → redirect ili 403.
- [ ] Gym admin na machines strani **ne sme** da vidi "Demo" toggle.
- [ ] Login kao **receptionist** → isto, ne sme da vidi ni link ni toggle.

---

## Lint / Type check

```bash
pnpm --filter sweatdrop-admin-panel lint
pnpm --filter sweatdrop-admin-panel type-check
```

---

## Handoff

DevOps (Step 5) ne zavisi striktno od Step 4 da bi pokrenuo prvi build, ali **mora** biti gotovo pre nego što se pošalje TestFlight link Vortex korisnicima — superadmin treba da bude u stanju da menja demo flag-ove kroz UI bez SQL pristupa.

Reviewer (Step 6) verifikuje RBAC enforcment.

---

## Out of scope za tebe

- ❌ Bilo šta van `apps/admin-panel/`.
- ❌ Promena RLS policies (DBA zaduženje).
- ❌ Mobile app code.
- ❌ Audit log tabela (može sledeća iteracija).
