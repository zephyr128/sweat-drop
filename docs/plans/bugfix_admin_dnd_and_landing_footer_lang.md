# Plan: Admin DnD fixes (Gallery + Machines) & Landing Footer Language Toggle

**Created:** 2026‑04‑17
**Owners:** `admin-coder`, `landing-page-coder`, `supabase-dba`
**Priority:**
- P1 — Bug 1 (Gallery DnD drops at wrong index) — visible regression, blocks gym onboarding QA
- P1 — Bug 2 (Landing footer EN/SR no‑op) — public site, trivial fix
- P2 — Feature 3 (Machines floor DnD) — new capability, larger scope

Three related items are bundled because they all touch the same drag‑and‑drop pattern. Doing them together lets us introduce one reusable DnD primitive (`@dnd-kit`) in the admin panel and share it.

---

## Bug 1 — Gym Setup → Gallery: drag & drop lands in wrong slot

### Repro (from QA)
1. Login as admin → Gym Setup → Gallery
2. Upload 4–5 photos
3. Drag photo from position 0 and drop onto photo at position 3
4. Expected: photo ends at position 3 (after D, before E)
5. Actual: photo ends one slot before the drop target, or visibly "off by one" depending on direction
6. Video: https://jam.dev/c/f19adbee-9564-4be7-87bb-59721f623105

### Root cause (code: `apps/admin-panel/components/modules/GymGalleryManager.tsx`)
Current implementation uses native HTML5 DnD with hand‑rolled index math:

```106:132:apps/admin-panel/components/modules/GymGalleryManager.tsx
  const handleDragStart = (idx: number) => {
    dragIdxRef.current = idx;
    setDragIdx(idx);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = async (dropTargetIdx: number) => {
    const from = dragIdxRef.current;
    // ...
    if (from === null || from === dropTargetIdx) return;

    const newOrder = [...images];
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(dropTargetIdx, 0, moved);
    setImages(newOrder);
    // ...
  };
```

Two independent defects:

1. **Off‑by‑one when moving forward.** After `splice(from, 1)`, every index ≥ `from` shifts left by one. Re‑inserting at the original `dropTargetIdx` lands the item one slot short of where the user visually dropped it. Classic fix is either to operate on the unsplit array with the "insert at" index adjusted (`from < dropTargetIdx ? dropTargetIdx + 1 : dropTargetIdx` when semantics are "drop AFTER target") or to use a well‑tested helper like `arrayMove`.
2. **No drop zone between cards.** The drop target is always a card, never a gap. Users cannot drop "between B and C" or "at the very end". The drag‑over highlight doesn't indicate direction (left/right, above/below).

### Fix — adopt `@dnd-kit/core` + `@dnd-kit/sortable`
Rationale:
- Battle‑tested `arrayMove` helper eliminates the off‑by‑one class of bugs for good.
- Pointer + keyboard + touch sensors out of the box (admin panel must be keyboard‑reachable).
- Proper collision detection (rectIntersection / closestCenter) with between‑card drop indicators.
- We will re‑use the same primitive for Machines floor (Item 3), so the cost is amortised.

#### Steps

1. **Install in admin panel only** (do NOT add to mobile‑app):
   ```bash
   pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers --filter sweatdrop-admin-panel
   ```

2. **Refactor `GymGalleryManager.tsx`:**
   - Wrap grid in `<DndContext sensors={[PointerSensor, KeyboardSensor]} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>`.
   - Wrap `images.map` in `<SortableContext items={images.map(i => i.id)} strategy={rectSortingStrategy}>`.
   - Extract card into `<SortableGalleryCard>` using `useSortable({ id: img.id })`, apply `{ transform, transition, isDragging }`.
   - Replace hand‑rolled state (`dragIdx`, `dragOverIdx`, `dragIdxRef`) with `useSortable` primitives.
   - `onDragEnd`:
     ```ts
     import { arrayMove } from '@dnd-kit/sortable';
     const { active, over } = event;
     if (!over || active.id === over.id) return;
     const from = images.findIndex(i => i.id === active.id);
     const to   = images.findIndex(i => i.id === over.id);
     const next = arrayMove(images, from, to);
     setImages(next);
     await reorderGalleryImages(gymId, next.map(i => i.id));
     ```
   - Keep existing optimistic update + `await fetchImages()` rollback on error (already correct in `reorderGalleryImages`).
   - Preserve drag handle behaviour: make whole card draggable (current behaviour) but ensure the caption input, edit button, and delete button stop propagation / are not draggable via `onPointerDown={e => e.stopPropagation()}` or better — move listeners onto a `<GripVertical>` drag handle only (recommended, eliminates accidental drag when clicking edit).

3. **Server action — no DB change needed.** `reorderGalleryImages` already rewrites `sort_order` from the passed array. Keep it, but add a single‑transaction wrapper to avoid partial rewrites on failure:
   ```ts
   // apps/admin-panel/lib/actions/gallery-actions.ts
   // Replace Promise.all(updates) with a single RPC or a loop that tracks a
   // rollback snapshot. Minimum change: wrap the Promise.all and on any failure
   // restore previous sort_order list.
   ```
   Nice‑to‑have: add a Postgres function `reorder_gym_gallery(gym_id uuid, ordered_ids uuid[])` that does it in one statement. Defer if not trivial.

4. **Acceptance criteria:**
   - Dragging any card to any position (forward or backward) places it exactly at the slot indicated by the drop indicator — verified with the exact QA repro from the Jam video.
   - `Tab` focuses cards, `Space` picks up, arrow keys move, `Space` drops (keyboard a11y from `@dnd-kit`).
   - Edit / delete / caption edit buttons still work without triggering drag.
   - After drop, `gym_gallery.sort_order` rows reflect new order (verify in Supabase Studio).
   - Refresh page → order persisted.

---

## Bug 2 — Landing footer EN / SR buttons do nothing (+ legal pages desync)

### Root cause — footer (code: `apps/landing-page/components/Footer.tsx`)
The buttons are literally un‑wired:

```49:54:apps/landing-page/components/Footer.tsx
          <div className="flex flex-col items-center md:items-end gap-4">
            <div className="flex items-center gap-2 text-sm text-text-2">
              <button className="hover:text-text transition-colors">EN</button>
              <span className="text-border">|</span>
              <button className="hover:text-text transition-colors">SR</button>
            </div>
```

No `onClick`, no `setLanguage`, no active‑state styling. The `useLanguage()` hook and `LanguageProvider` are already in place — the navbar `LanguageSelector` component works correctly. Footer just never got hooked up.

### Secondary root cause — Privacy & Terms use a DIFFERENT language mechanism
The landing page actually has **two parallel language mechanisms** and they are not synchronised. Fixing only the footer toggle without fixing this second mechanism will produce visible desync bugs.

**Mechanism A — `useLanguage()` context (client side)**
Used by every section, modal, navbar, and footer copy. Backed by `localStorage['sweatdrop-language']`. This is what the navbar `LanguageSelector` and our new footer toggle will mutate.

**Mechanism B — `?lang=` URL query param (server side)**
Used by `/privacy` and `/terms` which are Server Components:

```22:25:apps/landing-page/app/privacy/page.tsx
export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const lang = params.lang === 'sr' ? 'sr' : 'en';
```

The legal content (`PrivacyContent`, `TermsContent`) just forks on the URL param and renders `PrivacyContentEn` or `PrivacyContentSr`. No access to `localStorage`, no context subscription. `generateMetadata` also reads from the query param (good — SEO title/description stay language‑correct).

### Four gaps this creates
1. **Footer/Navbar toggle on a legal page doesn't update the body.** User on `/privacy?lang=en` clicks SR in footer → `setLanguage('sr')` flips the context (nav + footer copy become SR), but URL stays `?lang=en` and Server Component keeps rendering English Privacy text. Looks broken even though it "worked".
2. **Deep link mismatch.** Someone shares `/privacy?lang=sr` with a user whose `localStorage` is `en`. Content renders SR, nav + footer render EN. Inconsistent.
3. **Direct visit without query param.** `/privacy` (no `?lang=`) always serves EN, even if `localStorage` is `sr`. Server cannot read `localStorage`.
4. **`generateMetadata` is only keyed on URL.** That is actually the correct behaviour for SEO (crawlers must see deterministic content per URL), so we must NOT try to "fix" this by reading localStorage in metadata. The fix belongs on the client.

### Fix (two tiny changes)

#### (a) Wire the footer buttons
`apps/landing-page/components/Footer.tsx`:

```tsx
const { t, language, setLanguage } = useLanguage();

<div className="flex items-center gap-2 text-sm text-text-2">
  <button
    onClick={() => setLanguage('en')}
    aria-pressed={language === 'en'}
    className={`transition-colors ${
      language === 'en' ? 'text-text font-semibold' : 'hover:text-text'
    }`}
  >
    EN
  </button>
  <span className="text-border">|</span>
  <button
    onClick={() => setLanguage('sr')}
    aria-pressed={language === 'sr'}
    className={`transition-colors ${
      language === 'sr' ? 'text-text font-semibold' : 'hover:text-text'
    }`}
  >
    SR
  </button>
</div>
```

#### (b) Bridge legal pages to the context — new `LegalLangSync` client component

Create `apps/landing-page/components/legal/LegalLangSync.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/use-language';

/**
 * Two‑way bridge between `?lang=` (server‑rendered legal content) and the
 * `useLanguage()` context (navbar, footer, rest of site).
 *
 * - If the URL has `?lang=`, treat it as the source of truth on first load
 *   (honours deep links) and push it into the context.
 * - After that, whenever the context language changes, replace the URL so the
 *   Server Component re‑renders with the new language.
 */
export function LegalLangSync({ urlLang }: { urlLang: 'en' | 'sr' }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { language, setLanguage } = useLanguage();

  // On mount: URL wins. This handles deep links like /privacy?lang=sr
  // regardless of what's in localStorage.
  useEffect(() => {
    if (urlLang !== language) setLanguage(urlLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On subsequent context changes: sync URL so the server re‑renders content.
  useEffect(() => {
    if (language === urlLang) return;
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    sp.set('lang', language);
    router.replace(`${pathname}?${sp.toString()}`);
  }, [language, urlLang, pathname, router, searchParams]);

  return null;
}
```

Then drop it into both pages:

```tsx
// apps/landing-page/app/privacy/page.tsx
import { LegalLangSync } from '@/components/legal/LegalLangSync';
// ...
return (
  <>
    {!standalone && <Navigation />}
    <LegalLangSync urlLang={lang} />
    <main className="min-h-screen">
      <PrivacyContent lang={lang} />
    </main>
    {!standalone && <Footer />}
  </>
);
```

Same change in `apps/landing-page/app/terms/page.tsx`.

Notes:
- `router.replace` (not `push`) so the back button still takes the user to the previous page, not through every language toggle.
- `useSearchParams` requires `<Suspense>` in Next 15 when used in a page. If the compiler complains, wrap `<LegalLangSync>` in `<Suspense fallback={null}>`.
- `standalone` query param (used for webview embedding) should bypass the URL rewrite — add `if (searchParams?.get('standalone') === 'true') return;` as a guard at the top of the second effect.
- Do NOT attempt to write localStorage from the Server Component. Keep Mechanism B "URL is truth on server render" and Mechanism A "context is truth on client interaction", with this bridge handling the handoff.

### Acceptance criteria
- On `https://sweat-drop.com/`: click SR in footer → all landing sections translated; EN/SR styled as pressed/unpressed with `aria-pressed`.
- Reload any landing page → language persists (already handled by `LanguageProvider` + `localStorage`).
- `Tab` reaches both buttons, `Enter`/`Space` toggles.
- On `/privacy?lang=en`: click SR in footer → URL becomes `/privacy?lang=sr`, body re‑renders SR, nav + footer copy in SR, no visible flicker beyond a single Next.js route transition.
- Open `/privacy?lang=sr` directly (simulate shared link) with `localStorage['sweatdrop-language']='en'` → body renders SR immediately, nav/footer switch to SR on the client after hydration, localStorage updated to `sr`.
- Open `/privacy` (no query) → renders EN (server default). If localStorage was `sr`, client effect rewrites URL to `?lang=sr` and body re‑renders SR. (Alternative accepted behaviour: stay EN to match the URL exactly — tell the user which we picked. Recommendation: respect localStorage, because users expect their chosen language to follow them.)
- `/privacy?standalone=true&lang=sr` (mobile webview embedding) renders SR and never rewrites the URL (guard above).
- `generateMetadata` unchanged — SEO titles/descriptions still reflect the URL param exactly.
- Same flow works on `/terms`.
- Navbar `LanguageSelector` behaviour unchanged on non‑legal pages; on legal pages it also triggers the URL rewrite via the bridge.

---

## Feature 3 — Machines: drag‑and‑drop floor layout mirroring physical gym

### Problem
Admin sees machines as a static responsive grid sorted by status (see `apps/admin-panel/components/analytics/MachineGrid.tsx`). They want to arrange cards to match the **physical** gym floor so they can point at a card and know exactly which treadmill on the floor it represents. This also unlocks future features: floor‑aware heatmaps, wayfinding for members.

### Scope of v1 (keep it small)
- Discrete grid (e.g. 8 cols × 12 rows default, configurable per gym later) — NOT a free‑form canvas. Grid is simpler, collision‑free, and good enough to represent physical layout.
- Edit Mode toggle (only `gym_owner` / `gym_admin` / `superadmin`). Normal staff see read‑only placed layout.
- Drag machines from an "unplaced" tray into the grid, or from cell to cell.
- Unplaced machines remain in a sidebar tray.
- Persisted to DB. Survives refresh.
- Falls back to current sorted grid rendering when a gym has no layout set yet.

### Data model

New migration: `backend/supabase/migrations/<ts>_machine_floor_layout.sql`

```sql
alter table public.machines
  add column if not exists floor_row smallint,
  add column if not exists floor_col smallint,
  add column if not exists floor_rotation smallint not null default 0; -- 0/90/180/270

create unique index if not exists machines_floor_cell_unique
  on public.machines (gym_id, floor_row, floor_col)
  where floor_row is not null and floor_col is not null;

create table if not exists public.gym_floor_config (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  rows smallint not null default 12,
  cols smallint not null default 8,
  updated_at timestamptz not null default now()
);

alter table public.gym_floor_config enable row level security;

-- RLS: gym staff can select + upsert for their gym; superadmin all
-- (mirror existing policies on `machines`)
```

Index + unique constraint prevents two machines in the same cell. RLS mirrors the `machines` table policies.

### Server actions (`apps/admin-panel/lib/actions/machine-layout-actions.ts` — new file)

```ts
'use server';

export async function getGymFloorLayout(gymId: string): Promise<{
  config: { rows: number; cols: number };
  machines: Array<Pick<LiveMachine, 'id' | 'name' | 'type'> & {
    floor_row: number | null;
    floor_col: number | null;
  }>;
}>;

export async function saveMachineFloorLayout(
  gymId: string,
  placements: Array<{ machineId: string; row: number | null; col: number | null }>,
): Promise<{ success: boolean; error?: string }>;

export async function updateGymFloorDimensions(
  gymId: string,
  rows: number,
  cols: number,
): Promise<{ success: boolean; error?: string }>;
```

`saveMachineFloorLayout` runs as a single transaction (PG function recommended — `set_machine_floor_layout(gym_id, placements jsonb)`) so partial failures never leave the layout half‑persisted. Authorize with the same `authorizeGymManagement` helper already used for gallery.

### UI

New component: `apps/admin-panel/components/analytics/MachineFloorLayout.tsx`

Structure:
- `<DndContext>` (shared with Gallery fix — same lib).
- Left pane: **Unplaced machines** tray (list of cards without `floor_row/col`) — each card is `useDraggable`.
- Right pane: **Grid** — `config.rows × config.cols` cells, each `useDroppable` with id `cell:{row}:{col}`.
- Placed machines render inside their cell and are themselves `useDraggable` so they can be moved to another cell or back to the tray (drop onto the tray = unplace).
- Edit Mode toggle at top (Save / Discard). Discard reverts to server state via refetch.
- "Grid size" control (rows / cols) visible only in Edit Mode.
- Read‑only (non‑edit) view just renders the grid with cells; if layout is empty, render the existing `MachineGrid` component as fallback and show a CTA "Set up floor layout".

Collision detection: on drop onto an occupied cell, swap the two machines (or reject + toast — keep it simple, reject with toast in v1).

Integrate with the existing Machines page:
- `apps/admin-panel/app/dashboard/gym/[id]/machines/page.tsx` gains a tabbed view: `Live Floor` (current `MachineFloor`), `Layout` (new `MachineFloorLayout`).
- Or use a segmented control in `MachineFloor.tsx` to switch between list and layout views. Prefer a tab for clarity.

### Steps

1. **supabase-dba:** write and apply migration, regenerate `backend/types/database.types.ts`.
   ```bash
   pnpm --filter backend/supabase supabase db diff -f machine_floor_layout   # or manually craft SQL
   pnpm --filter backend/supabase supabase db push
   pnpm types:generate    # whatever existing script is — confirm in root package.json
   ```

2. **admin-coder:** implement `machine-layout-actions.ts` with unit‑level RLS tests (one gym_admin can only touch their gym). Include the Postgres function for transactional write.

3. **admin-coder:** build `MachineFloorLayout.tsx` using `@dnd-kit/core` (installed in Bug 1). Reuse the `SortableMachineCard` pattern — here cards are *draggable*, cells are *droppable*.

4. **admin-coder:** wire into `MachineFloor.tsx` as a second tab "Layout". Only visible to `gym_owner | gym_admin | superadmin`.

5. **Fallback rendering:** when `floor_row/col` are NULL for all machines (fresh gym), the Live Floor tab continues to work as today. Only the Layout tab is empty until first placement.

6. **Accessibility:** keyboard sensor + arrow‑key navigation across cells (dnd‑kit `KeyboardSensor` + custom coordinate getter is standard).

7. **(Deferred to v2, out of scope for this plan):** mobile‑app floor view for members, rotation (`floor_rotation`), walls/doors, multi‑floor support. Schema already leaves room for `floor_rotation`.

### Acceptance criteria
- `gym_owner` can open Layout tab, drag a machine from tray into any empty cell, drop → cell shows card, machine disappears from tray.
- Drag placed machine to another empty cell → moves.
- Drag placed machine onto occupied cell → toast "Cell is occupied" and visual bounce‑back (no DB write).
- Drag placed machine back to tray → becomes unplaced (DB: `floor_row=null, floor_col=null`).
- Refresh page → layout persisted.
- Staff (receptionist) sees Layout tab read‑only — no drag handles, no tray, just the grid with cards locked in place.
- Changing grid size (e.g. 10×8) does not lose existing placements that fit; machines outside new bounds get auto‑unplaced with a warning toast.
- RLS: a `gym_admin` of gym A cannot save layout for gym B (unit test or manual probe).

---

## Cross‑cutting work order

Execute in this order so effort stacks:

| # | Task | Owner | Est. | Dependencies |
|---|------|-------|------|--------------|
| 1 | Install `@dnd-kit/*` in admin panel | `admin-coder` | 10 min | — |
| 2 | Fix Gallery DnD (Bug 1) | `admin-coder` | 1–2 h | 1 |
| 3 | Wire Footer EN/SR + `LegalLangSync` bridge (Bug 2) | `landing-page-coder` | ~45 min | — (parallel) |
| 4 | Machines layout migration + types | `supabase-dba` | 1 h | — (parallel) |
| 5 | Machines layout server actions | `admin-coder` | 1–2 h | 4 |
| 6 | Machines layout UI | `admin-coder` | 4–6 h | 2, 5 |
| 7 | Manual QA pass against the Jam video + real gym | `admin-coder` | 30 min | 2, 6 |

Total: ~1 engineering day for Bugs 1 + 2, plus ~1 day for the Machines feature.

---

## Testing checklist

### Bug 1
- [ ] Drag A (idx 0) onto D (idx 3) — A lands at idx 3, exactly where Jam video showed it missing
- [ ] Drag E (last) onto A (first) — E lands at idx 0
- [ ] Drag middle card onto itself — no‑op
- [ ] Reload — order persists
- [ ] Keyboard: Tab → Space → ArrowRight × 3 → Space — card moves
- [ ] Clicking edit/delete buttons does not start drag
- [ ] Simulate `reorderGalleryImages` failure (temporarily throw) — list reverts to server state + error toast

### Bug 2
- [ ] Click SR on `/` → page translated
- [ ] Click EN → page translated back
- [ ] Hard refresh → language persisted (localStorage `sweatdrop-language`)
- [ ] Privacy / Terms links include `?lang=sr` after switching
- [ ] Lighthouse a11y score unchanged or improved
- [ ] Switching in footer also updates the Navigation `LanguageSelector` (shared context — should just work)
- [ ] On `/privacy?lang=en` click SR in footer → URL becomes `?lang=sr`, body re‑renders SR, nav+footer in SR
- [ ] Deep link `/privacy?lang=sr` with `localStorage='en'` → body SR, nav/footer flip to SR on hydration
- [ ] `/privacy` without query → respects localStorage (client rewrites URL) OR stays EN — document which, and be consistent
- [ ] `/privacy?standalone=true&lang=sr` (mobile webview) → never rewrites URL, renders SR
- [ ] View source of `/privacy?lang=sr` → `<title>` is "Politika privatnosti" (confirms `generateMetadata` still URL‑driven for SEO crawlers)
- [ ] Back button after toggling language on `/privacy` goes to previous page, not through every toggle (confirms `router.replace`)

### Feature 3
- [ ] Place 10 machines on an 8×12 grid, refresh — all persisted
- [ ] Swap two adjacent machines via drag — works / or rejection + toast per chosen v1 semantic
- [ ] `gym_admin` of gym A can save layout for gym A only (RLS probe via Supabase Studio SQL)
- [ ] Receptionist sees read‑only layout — no drag handles visible
- [ ] Shrink grid from 8×12 to 6×8 — machines outside bounds unplaced with warning
- [ ] Delete a machine from the Live tab → it disappears from Layout tab (and vice‑versa — single source of truth)

---

## Rollback plan

- **Gallery DnD:** revert the `GymGalleryManager.tsx` commit. No DB changes; `sort_order` stays valid either way.
- **Footer:** revert the `Footer.tsx` commit.
- **Machines layout:** feature flag the new tab behind `NEXT_PUBLIC_FEATURE_MACHINE_LAYOUT=true`. Disable flag → tab hidden, old Live Floor unaffected. Migration is additive (nullable columns + new table), no down migration needed immediately; if we must revert schema, drop the new table and columns.

---

## Out of scope / deferred

- Mobile‑app member view of floor layout (can come in v2 once admins actually use it)
- Multi‑floor / multi‑zone gyms (can be modeled with `zone` column already on `machines`)
- Rotation of machines (column reserved, UI deferred)
- Transactional PG function for gallery reorder (current parallel update is fine in practice)
- Drag‑and‑drop for other admin lists (Challenges, Rewards) — adopt the same pattern opportunistically
