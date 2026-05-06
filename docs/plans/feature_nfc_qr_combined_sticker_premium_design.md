# Feature: Combined NFC + QR Premium Sticker & Print Kit Custom Copy

**Status:** Planning (design + admin-panel print-kit changes only)
**Owner:** Architect
**Target Release:** Vortex pilot — sticker batch v2 (post-feedback on the v1 proof sheet pictured in product chat)
**Created:** 2026-05-05
**Related:**
- `docs/plans/feature_qr_universal_links_stable_print_redirect.md` (shipped — single-source URL)
- `docs/plans/feature_nfc_tag_scanning.md` (shipped — zero-code OS-level routing; same URL, two transports)

---

## Context

The Vortex pilot proof sheet (printed last week, six layouts + a separate ~25mm NFC dot) demonstrated that **two-piece application is friction**. Installer aligns a QR sticker, then applies a separate round NFC dot, then hopes the dot lands cleanly without bubbling under the QR. Members also have no on-sticker hint that NFC is even an option — they only see a QR and the OS-level NFC tap is "secret".

Two plans already shipped established the spec:

1. **QR Universal Links** (admin panel + landing page + mobile app + AASA/assetlinks): a single canonical URL per machine / gym, encoded into both the QR and the NFC chip.
2. **NFC tag scanning**: zero new app code — the OS dispatches the encoded URL into the same Universal-Link routes the QR uses. The transport is interchangeable.

What this plan adds: **one printed object that carries both transports**, designed as a single visual artifact, plus the print-kit affordances ops asked for (custom copy, accurate metric sizes, NFC chip-placement registration mark).

### Goals

1. **One sticker, dual transport, premium feel.** The QR and the NFC tap zone live on a single die-cut piece; the design tells the user *both* options exist.
2. **Eliminate two-piece installer flow.** No more "QR sticker + separate dot". The NFC inlay is laminated under the printed vinyl at a fixed registered position.
3. **Operator-controlled copy.** Allow custom Line 1 / Line 2 text per sticker run (in addition to the curated CTA library).
4. **Match real-world sticker sizes.** Add the actual print-shop metric presets seen on the proof sheet (cm-based) alongside the existing imperial presets.
5. **Standalone NFC dot** still printable for retro-fit on existing QR stickers (legacy installs) and for non-machine surfaces (e.g. lockers).

### Non-goals

- ❌ Any change to the encoded URL schema or mobile-app routing. The single-source URL from the QR Universal Links plan is the source of truth for both transports.
- ❌ NFC writing / re-encoding workflow. Tags are pre-encoded at the manufacturer; the admin panel only displays the URL.
- ❌ New analytics for transport differentiation (covered as a "future, when needed" item in the NFC plan).
- ❌ Mobile-app changes (`apps/mobile-app/`) — this is admin-panel + print-shop only.
- ❌ Backend / database changes (`backend/supabase/`).

---

## Premium Design Spec — Combined QR + NFC Sticker

### Physical construction (print-shop spec, not code)

```
 Layer 4 — UV-cured matte laminate                          (anti-finger, durable)
 Layer 3 — Spot gloss + cyan accents                        (premium feel)
 Layer 2 — CMYK + black-saturated print on white vinyl      (the artwork below)
 Layer 1 — NTAG215 inlay, 25mm round antenna, registered    (under printed "tap zone")
 Layer 0 — Removable adhesive backing                       (peel-clean; vinyl)
```

The NFC inlay sits at a **fixed registered position** under the printed surface. The artwork places a circular "TAP" graphic over the chip so the user knows where to tap. The print partner uses our registration marks to align the inlay during lamination.

### Visual language

- **Background:** pure black (#000) — already brand-consistent with the v1 proof.
- **Primary accent:** SweatDrop cyan (#00E5FF) — already brand-consistent.
- **Typography:** Inter, 900 weight, uppercase, tight tracking — already brand-consistent.
- **New element 1 — NFC TapMark™ (working name):** a circular target glyph composed of:
  - Inner: SweatDrop logo (existing `SweatDropGlyph`) at ~30% of circle diameter.
  - Middle: two concentric arc strokes evoking NFC waves, cyan with subtle glow.
  - Outer: a thin cyan ring (the chip-position registration ring; doubles as a target).
  - Thin label below: `TAP TO START` (configurable copy, see Section "Tap-zone label").
- **New element 2 — Method ribbon:** a single horizontal rule between the QR tile and the TapMark, captioned `OR` in cyan. Reads "Scan **OR** Tap." Visual rhythm: QR — `OR` — TAP.
- **Retained:** `SubtleGlow` background, `RegistrationMarks` (corner brackets + frame), `BrandedQRCode` with embedded rounded SweatDrop icon, `PoweredByFooter`.

### Layout per orientation

**Landscape** (proof sizes 6×4.1, 8×5.5, 10×6.9 cm)

```
 ┌────────────────────────────────────────────────────────┐
 │ ┌──────┐                                  ┌─────────┐  │
 │ │      │   EVERY DROP    ─OR─             │   ◯◯◯   │  │
 │ │  QR  │   COUNTS                         │ ◯ TAP ◯ │  │
 │ │      │   ─────                          │   ◯◯◯   │  │
 │ │      │   {caption / gym name}           └─────────┘  │
 │ └──────┘   ⬡ Powered by SweatDrop                      │
 └────────────────────────────────────────────────────────┘
       QR tile         CTA + caption          NFC TapMark
```

**Portrait** (proof sizes 3×4.3, 4×5.8, 5×7.2 cm)

```
 ┌──────────────┐
 │ ┌──────────┐ │
 │ │    QR    │ │
 │ │          │ │
 │ └──────────┘ │
 │      ─OR─    │     ← thin cyan rule with "OR" pill
 │  ┌────────┐  │
 │  │  TAP   │  │     ← NFC TapMark, smaller diameter on small presets
 │  │  ◯◯◯   │  │
 │  └────────┘  │
 │ EVERY DROP   │
 │ COUNTS       │
 │ ──           │
 │ {caption}    │
 │ ⬡ Powered    │
 └──────────────┘
```

**Square** (existing 2×2 in machine; new 5×5 cm mini)

The TapMark replaces the headline column on small squares — the headline drops to a single line, and `OR` becomes a small inline pill instead of a full rule. Below ~4 cm height, the TapMark's "TAP TO START" label collapses to just the icon ring (still readable as "tap").

### Tap-zone label (copy library)

Selectable just like the existing CTAs (so a partner gym can use the same tone of voice):

| id              | Label              |
| --------------- | ------------------ |
| `tap-to-start`  | TAP TO START       |
| `tap-to-earn`   | TAP TO EARN        |
| `tap-or-scan`   | TAP OR SCAN        |
| `tap-and-go`    | TAP & GO           |
| `hold-phone`    | HOLD PHONE HERE    |

Default = `tap-to-start`. Editable via the same Print Studio side panel as the CTA.

### Why this is premium (and not just "QR + NFC slapped together")

- **One die-cut, one application step.** Installer peels a single piece and lands it once. No alignment math.
- **Both transports are advertised on the surface.** Users discover NFC. Today they don't.
- **The TapMark is the chip's registration mark.** Print-shop alignment is built into the design rather than a separate spec sheet.
- **Type-set hierarchy.** QR (functional) → CTA (emotional) → TapMark (functional alternative) — the eye flows in the same direction the action flows.
- **Glanceable at distance, scannable up close.** Reception desk member walks past, sees the headline; member at the machine sees the QR + tap zone.

---

## Premium Design Spec — Standalone NFC Circle Sticker

For legacy retro-fit (existing QR stickers already deployed) and for surfaces where the combined sticker doesn't fit (lockers, water bottles, hand sanitizer dispensers).

- **Diameter:** 25 mm (matches the NTAG215 antenna). Optional 30 mm "premium" with a thicker bezel.
- **Background:** black, full-bleed.
- **Center:** SweatDrop logo glyph in cyan, ~12 mm tall.
- **Bezel:** two concentric cyan rings + a thin "TAP" wordmark following the top arc, "POWERED BY SWEATDROP" wordmark following the bottom arc (curved type, 5 pt). Both wordmarks in 60 % opacity white so the cyan center holds focus.
- **Construction:** identical layer stack to the combined sticker, minus the QR layer.
- **Encoding:** same canonical URL the admin panel produces for that machine / gym (single-source URL principle holds).

### Layout

```
       ╭────────────╮
     ╱   T A P   E A R N  ╲      ← curved top wordmark
   ╱      ╭──────╮         ╲
  │      │  ⬡   │            │   ← SweatDrop glyph, cyan
  │      │      │            │
   ╲      ╰──────╯         ╱
     ╲   ──────────      ╱       ← curved bottom wordmark
       ╰─POWERED · SWEATDROP─╯
```

---

## Custom Copy Feature — Print Kit

Operator-controlled headline text, stored client-side per session (no DB).

### UX

In the existing **Headline** section of `apps/admin-panel/app/print-qr/page.tsx` (and its batch sibling), append one extra option card:

```
┌────────────────────────────────────────────┐
│ ✏  Custom…                                 │
│    Type your own headline                  │
└────────────────────────────────────────────┘
```

Selecting it expands two inline text inputs:

- `Line 1` — required, max length driven by preset (24 ch on machine, 18 ch on reception ≥5 in, 32 ch on landscape reception).
- `Line 2` — optional, same length cap.

Live preview updates on every keystroke. Inputs auto-uppercase on display (the design typesets uppercase regardless), but persist the user's casing for export reference.

Validation:

- Reject characters outside printable ASCII + Latin-Extended (so we don't get unsupported glyphs in the print pipeline).
- Soft-warn if either line exceeds the preset's character cap; do not block — just colour the count badge red and let the operator decide. (We've seen partner gyms intentionally overflow for stylistic effect.)

Persistence:

- Persist last-used custom copy to `localStorage` under `sweatdrop:print:custom-cta:{type}` (`type` ∈ `machine` / `checkin`). Re-hydrate on next visit so the operator doesn't retype.
- Do not persist to backend. Headline copy is a print-time concern, not a data-model concern.

### Behavior in batch print

The batch studio (`apps/admin-panel/app/print-qr/batch/page.tsx`) already shares one CTA across the whole batch. The custom-copy mechanic is identical there: one `Custom…` option, two inputs, applied to every selected machine in the run.

### Where the data lives

```ts
// apps/admin-panel/components/print-studio/shared.tsx — extension
export const CUSTOM_CTA_ID = 'custom';

export type CtaOption =
  | { id: string; line1: string; line2?: string }   // existing curated entries
  | { id: typeof CUSTOM_CTA_ID; line1: ''; line2?: '' };  // marker entry

// Resolved at render-time:
function resolveCta(selected: CtaOption, custom: { line1: string; line2: string }): CtaOption {
  if (selected.id === CUSTOM_CTA_ID) return { id: CUSTOM_CTA_ID, line1: custom.line1, line2: custom.line2 };
  return selected;
}
```

The marker entry approach keeps the existing `OptionCard` rendering loop intact — only the resolver and the conditional input form are new.

---

## Sticker Size Presets — Add Metric

The proof sheet uses cm. The current code uses inches. Both are valid; we add metric presets without removing the imperial ones (existing batches are already cut to imperial).

### New presets — combined NFC + QR (machine scale)

| id                       | Label                | Width × Height (cm) | Width × Height (in) | Notes |
| ------------------------ | -------------------- | ------------------- | ------------------- | ----- |
| `combo-mini-landscape`   | Mini · 6 × 4.1 cm    | 6.0 × 4.1           | 2.36 × 1.61         | Console rails, dumbbell ends |
| `combo-mid-landscape`    | Mid · 8 × 5.5 cm     | 8.0 × 5.5           | 3.15 × 2.17         | Most machines (default) |
| `combo-large-landscape`  | Large · 10 × 6.9 cm  | 10.0 × 6.9          | 3.94 × 2.72         | Squat racks, large frames |
| `combo-mini-portrait`    | Mini · 3 × 4.3 cm    | 3.0 × 4.3           | 1.18 × 1.69         | Tight portrait spots |
| `combo-mid-portrait`     | Mid · 4 × 5.8 cm     | 4.0 × 5.8           | 1.57 × 2.28         | Cable handles, locker doors |
| `combo-large-portrait`   | Large · 5 × 7.2 cm   | 5.0 × 7.2           | 1.97 × 2.83         | Reception side, vertical hero |

### New presets — standalone NFC circle

| id            | Label             | Diameter (mm) | Notes |
| ------------- | ----------------- | ------------- | ----- |
| `nfc-25mm`    | Standard · 25 mm  | 25            | Matches NTAG215 antenna |
| `nfc-30mm`    | Premium · 30 mm   | 30            | Thicker bezel, easier to spot |

Round stickers print on rectangular paper with crop marks; the existing print CSS handles `@page size` for any width × height in CSS units.

### Existing presets

Keep `MACHINE_PRESETS` (2×3 / 3×2 / 2×2 in) and `CHECKIN_PRESETS` (5×7 / 7×5 / 5×5 in) untouched. The combined sticker presets are additive. The Headline UX, Custom copy, NFC tap mark, and TapMark label apply to **every** preset (not gated by metric vs imperial).

---

## Workspace Assignment

| Workspace                | Files touched                                                                                                                                                                                                                                                                                                       | Owner agent      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `apps/admin-panel/`      | `components/print-studio/shared.tsx` (TapMark, presets, CTA library, layout); `app/print-qr/page.tsx` (Custom-copy UI, TapMark label control); `app/print-qr/batch/page.tsx` (mirror Custom-copy UI); new `app/print-nfc/page.tsx` for standalone circle (or re-use `print-qr` with `?type=nfc`).                    | `admin-coder`    |
| `apps/mobile-app/`       | **None.**                                                                                                                                                                                                                                                                                                            | —                |
| `backend/supabase/`      | **None.**                                                                                                                                                                                                                                                                                                            | —                |
| Print partner / ops spec | New PDF "SweatDrop combined sticker — production spec.pdf" describing layer stack, NFC inlay registration, foil/laminate notes. Lives in `docs/print/` (new folder).                                                                                                                                                | `architect` + ops |

---

## Execution Plan

### Step 1 — Sketch + design review (`architect`, ~1 day, no code)

**Files:** `docs/print/combined-sticker-mockups.fig` (Figma export PNG checked into `docs/print/`).

1. Mock the four hero combinations in Figma at exact metric scale: `combo-mid-landscape` (default), `combo-large-portrait`, `nfc-25mm`, `nfc-30mm`.
2. Print at 100 % on regular paper; tape over a real machine, a reception desk, and a locker door. Walk past at user speed (≈1.5 m/s) and at scan speed (~0.5 m/s, hand-held).
3. Iterate until the headline is legible at 1.5 m, the QR is scannable at 0.3 m, and the TapMark is unambiguous as "tap zone".
4. **Acceptance:** sign-off by ops + product. The mockups become the visual contract for Step 2.

### Step 2 — Combined sticker artwork in `shared.tsx` (`admin-coder`, ~½ day)

**Files:**
- `apps/admin-panel/components/print-studio/shared.tsx` — extend.

Add (do **not** replace existing exports):

1. New CTA library `TAPMARK_LABELS: { id: string; label: string }[]` per the table above. Default `tap-to-start`.
2. New presets array `COMBO_PRESETS: Preset[]` per the size table. Reuse the `Preset` type — no schema change. Add a `kind: 'combo' | 'machine' | 'reception' | 'nfc'` discriminator (extend `scale` type or add a sibling `kind` field; bias toward sibling `kind` so existing `scale` ('machine' | 'reception') stays semantically the same — `kind` answers "what does this sticker have on it", `scale` answers "what's the typography baseline").
3. New presets array `NFC_CIRCLE_PRESETS: Preset[]` — but `Preset` currently assumes rectangle. Add an optional `shape: 'rect' | 'circle'` field, default `'rect'`. The print-page CSS treats circle as a rectangle with a clipped `<svg>` mask in the design (the cut is done by the print shop with a die; we just give them registration marks).
4. New component `<NfcTapMark />` rendering the concentric ring + glyph + curved or stacked label. Props: `diameter`, `label`, `showLabel` (auto-collapses on small presets). Sized in CSS pixels at the design's intrinsic scale.
5. New component `<MethodSeparator orientation="horizontal" | "vertical" />` rendering the cyan rule with the `OR` pill.
6. Refactor `StickerArtwork` to branch on `preset.kind`:
   - `'machine' | 'reception'` → existing layout (untouched).
   - `'combo'` and orientation `'landscape'` → three-zone grid: QR | CTA + caption | TapMark; `MethodSeparator` between zones 2 and 3.
   - `'combo'` and orientation `'portrait' | 'square'` → vertical stack: QR → MethodSeparator → TapMark → CTA → caption → footer.
   - `'nfc'` → `<NfcCircleArtwork />` (new internal component).
7. Add a small `TAPMARK_FOOTPRINT_CM = 2.5` constant — the diameter the design reserves for the TapMark on combo stickers, matching the chip's antenna diameter, so the print partner can register the inlay deterministically.

**Acceptance:**
- `pnpm --filter sweatdrop-admin-panel type-check` passes.
- `pnpm --filter sweatdrop-admin-panel lint` passes.
- Existing CTA / preset rendering on `print-qr` is byte-identical to before this step (we only added; we didn't change the existing branches).

### Step 3 — Custom-copy UI (`admin-coder`, ~½ day)

**Files:**
- `apps/admin-panel/components/print-studio/shared.tsx` — export `CUSTOM_CTA_ID`, `resolveCta`, character caps per preset.
- `apps/admin-panel/app/print-qr/page.tsx` — add the Custom option card, expand-on-select inline form, persistence to `localStorage`, char-count badges.
- `apps/admin-panel/app/print-qr/batch/page.tsx` — mirror the same UX (one custom CTA applied to every selected machine).

**Acceptance:**
- Switching between curated CTAs and Custom does not lose typed input within a session.
- Refreshing the page restores the most recent custom input for that sticker type.
- Live preview updates within ~16 ms of every keystroke.
- Character cap enforcement is *advisory* (red badge), not blocking — verify by typing 50 characters and confirming the print still works.

### Step 4 — Combo presets surfaced in the studio (`admin-coder`, ~¼ day)

**Files:**
- `apps/admin-panel/app/print-qr/page.tsx` — present `MACHINE_PRESETS` (existing) **and** the new `COMBO_PRESETS` in two visual groups: "QR-only (legacy)" vs "QR + NFC (recommended)". Default to the recommended `combo-mid-landscape`.
- `apps/admin-panel/app/print-qr/batch/page.tsx` — same grouping.
- `apps/admin-panel/components/MachineQRPrint.tsx` — no change; the studio decides default.

**Acceptance:**
- Existing partner gyms with QR-only sticker batches mid-flight (production data: at least the Vortex pilot up to and including the 2026-05-05 run) can still pick QR-only presets without seeing them buried.
- New runs default to the QR + NFC combo preset.

### Step 5 — Standalone NFC circle route (`admin-coder`, ~¼ day)

**Files:**
- New route: `apps/admin-panel/app/print-nfc/page.tsx`. Mirrors `print-qr/page.tsx` structure but only shows `NFC_CIRCLE_PRESETS` and renders `<NfcCircleArtwork />`. No CTA picker (the curved wordmark is fixed brand copy). Optional: a "Tap label" picker reusing `TAPMARK_LABELS`.
- New action: add a "Print NFC dot" link in `apps/admin-panel/components/MachineQRPrint.tsx` and the gym/machine detail pages — same param shape as `print-qr` (`?type=machine&machineId=…&machineType=…&gymName=…` or `?type=checkin&gymId=…&gymName=…`).

**Acceptance:**
- The standalone route renders a single round-cropped artwork at the chosen diameter.
- The encoded payload matches the canonical URL produced by `machineQrUrl()` / `checkinQrUrl()` — byte-equal sanity check (copy-link button).

### Step 6 — Print-shop production spec PDF (`architect` + ops, ~½ day, no code)

**Files:** `docs/print/combined-sticker-production-spec.md` (new).

Contents (operational, not engineering):

- Layer stack diagram with exact dimensions of the NFC inlay registration zone for every combo preset (the `TAPMARK_FOOTPRINT_CM` constant from Step 2 plus a +2 mm tolerance ring).
- NFC chip spec: NTAG215 (504 byte user memory), 25 mm round antenna, peel-and-stick wet inlay or dry inlay (partner's choice), encoded with the canonical URL from the admin panel.
- Material spec: 70 µm white permanent / removable vinyl base + 25 µm overlaminate, matte UV finish.
- Cut spec: kiss-cut on backing for combo stickers (single-piece peel); die-cut to the round outline for `nfc-25mm` / `nfc-30mm`.
- QC spec: per-batch QA checklist already defined in `feature_nfc_tag_scanning.md` Step 2 — no changes.

**Acceptance:**
- Two print partners (current + one alternate) can quote off the spec without follow-up questions.

### Step 7 — Member-facing CHANGELOG entry (`admin-coder` or `architect`, ~5 minutes)

**Files:** `CHANGELOG.md`.

Under `[Unreleased]` / Added:

```
- Print Studio: combined QR + NFC sticker preset (default for new runs),
  standalone NFC circle preset (25 mm / 30 mm), custom Line 1 / Line 2
  headline copy with localStorage persistence, and metric-cm size presets
  matching the proof sheet (6×4.1, 8×5.5, 10×6.9 cm landscape; 3×4.3,
  4×5.8, 5×7.2 cm portrait).
```

---

## Data Model Changes

**None.**

The single-source URL principle holds: same `qr_uuid` / `gym_id` drives QR and NFC. Custom CTA copy is a print-time, client-side concern (`localStorage`). No tables, no columns, no RLS policies, no RPCs.

---

## API Contracts

**None changed.**

The existing `machineQrUrl(qrUuid, machineType)` and `checkinQrUrl(gymId)` helpers in `apps/admin-panel/lib/qr-urls.ts` produce the canonical URL for both transports. Re-used as-is.

---

## Testing Requirements

### Visual regression (manual, `admin-coder`)

- Print Studio (`/print-qr`) renders identically to today when QR-only preset is selected. Diff in screenshot tests should be limited to the new "QR + NFC" group header — no changes inside QR-only artwork.
- Print Studio renders the new combo preset with TapMark visible, separator pill visible, headline correctly laid out, footer pinned to bottom.
- Custom-copy form: typing in Line 1 with no Line 2 collapses to a single-line headline; both lines populated lays out two-line headline; clearing Line 1 falls back to a placeholder rather than crashing.
- `print-nfc` route renders a circle artwork with the correct diameter and curved wordmark.

### Print-pipeline regression (manual, `admin-coder`)

- "Save as PDF" with `Default` paper size produces a PDF whose pages are exactly the preset dimensions — for both metric and imperial presets. (Same rule the existing studio already documents.)
- Batch print emits one page per selected machine, in the same order as the manifest. The combo preset adds no extra pages.
- Embedded SweatDrop logo on the QR is present on the **first** print attempt after a fresh page load (the existing `warmLogoCache()` already fixes this for QR; verify it also covers the TapMark glyph if we add any image-based glyph there. Keep TapMark fully SVG to avoid the issue.)

### Cross-stack acceptance

| Scenario                                                                                | Pass criteria                                                                                                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator picks combo-mid-landscape with the curated `every-drop` CTA                    | Sticker renders QR + headline + TapMark; printed PDF is `8 × 5.5 cm` exactly; QR encodes the canonical URL; TapMark has `TAP TO START` label. |
| Operator picks combo-mid-landscape and switches to Custom with `EVERY DROP / COUNTS`    | Same artwork; Line 1 / Line 2 reflect the typed copy; localStorage round-trips after refresh.                                                |
| Operator prints a batch of 12 stickers with combo preset + custom copy                  | 12 pages emitted, each preset-sized, each with the same custom copy, each encoding its own canonical URL.                                    |
| Operator prints a 25 mm NFC dot for the same machine                                    | One page, 25 mm × 25 mm, round artwork; encoded URL byte-equal to the combo sticker's URL.                                                   |
| End-user taps NFC zone of the combo sticker on iPhone XS+                               | Behaves identically to today — OS-level Universal Link routes into the app at `/m/[uuid]`. (Already covered by `feature_nfc_tag_scanning`.) |
| End-user scans QR side of the combo sticker                                             | Identical outcome — same canonical URL.                                                                                                       |

---

## Rollout Strategy

### Phased

1. **Pilot batch (10 stickers, 1 partner gym).** Print combo-mid-landscape + a few standalone NFC dots. Apply on machines, run the existing `feature_nfc_tag_scanning` Step 1 device matrix. If all six rows pass, advance.
2. **Vortex full batch (~150 stickers across the pilot gyms).** Default the studio to combo presets. Keep QR-only available for any gym still mid-installation with the v1 sticker.
3. **Standardize.** After two weeks of pilot data, deprecate QR-only presets in the UI (move to a "Legacy" expandable group, do not remove).

### Backout

- The combo preset is purely additive. To roll back, hide `COMBO_PRESETS` from the studio (one-line guard) and revert the default preset to `machine-landscape`. No data, no URLs, no migrations affected.
- For a bad print batch (manufacturing issue), reject per the existing per-batch QA checklist in `feature_nfc_tag_scanning.md`. Re-print is the remediation.

---

## Open Decisions

These are flagged for product / ops review **before** Step 2 begins. They affect the Figma mockup, not the code structure.

1. **Default Tap-zone label.** `TAP TO START` (this plan) vs `TAP OR SCAN` (more pedagogically explicit, but slightly worse design rhythm). Lean: `TAP TO START` — the QR's curved framing already implies "scan".
2. **TapMark on the smallest portrait (3 × 4.3 cm).** At that size the TapMark needs to share vertical space with the QR. Two options: (a) shrink TapMark to 18 mm, (b) drop the standalone TapMark and rely on the QR alone for sub-4 cm presets. Lean: (a). Final call after the Figma mock.
3. **Standalone NFC dot — curved wordmark vs straight.** Curved is more premium but harder to read at distance. We expect users to *tap* the dot, not read it, so legibility at >0.5 m is not a blocker. Lean: curved.
4. **Should `COMBO_PRESETS` ship as the default for first-time studio visitors?** Yes if the pilot goes well; otherwise stay with the user's last-used preset (already implicit via the URL params today, but localStorage default would override). Lean: yes.

---

## Why this is the minimal change

- **Reuses every existing primitive.** `BrandedQRCode`, `RegistrationMarks`, `SubtleGlow`, `PoweredByFooter`, `Preset`, `CtaOption`, the print portal pattern, the `@page size` strategy, the `warmLogoCache` flow — all unchanged.
- **No new dependencies.** TapMark is pure SVG. The custom-copy UI is two `<input>` elements and a `localStorage` key.
- **No new mobile-app surface.** The existing NFC plan (zero-code) covers tap behavior; this plan only changes what the surface *looks like*.
- **No new backend surface.** No DB, no RPCs, no policies.
- **One-piece application.** The biggest operational win is at sticker-installation time, not at runtime — which is exactly where the current pain is.

---

## Agent Dispatch Prompts

### → `admin-coder` (Step 2 — combined artwork)

```
Read docs/plans/feature_nfc_qr_combined_sticker_premium_design.md
(this file). Read CHANGELOG.md and STATE_OF_THE_APP.md. You are
implementing only Step 2 — combined sticker artwork in shared.tsx.

Files:
- apps/admin-panel/components/print-studio/shared.tsx

Add (do not replace existing exports):
- TAPMARK_LABELS array per the plan.
- COMBO_PRESETS array per the plan (six metric presets, kind: 'combo').
- NFC_CIRCLE_PRESETS array (25 mm / 30 mm, kind: 'nfc', shape: 'circle').
- <NfcTapMark /> SVG component (concentric rings + glyph + label).
- <MethodSeparator /> component (cyan rule + 'OR' pill).
- <NfcCircleArtwork /> component for the standalone dot.

Refactor StickerArtwork to branch on preset.kind. For 'machine' /
'reception' the existing branch is byte-identical. For 'combo' add
landscape and portrait/square layouts per the plan's ASCII diagrams.

Acceptance:
- pnpm --filter sweatdrop-admin-panel type-check passes.
- pnpm --filter sweatdrop-admin-panel lint passes.
- Visual diff vs. main shows no change in QR-only preset rendering.

Add an AGENT NOTE on shared.tsx referencing this plan. Update
CHANGELOG.md [Unreleased] / Added with the entry the plan specifies.

DO NOT touch apps/mobile-app/ or backend/supabase/. DO NOT change
the encoded URL format. DO NOT add npm dependencies.
```

### → `admin-coder` (Step 3 — custom copy)

```
Read docs/plans/feature_nfc_qr_combined_sticker_premium_design.md
(this file). Step 2 must already be merged.

Files:
- apps/admin-panel/components/print-studio/shared.tsx (export
  CUSTOM_CTA_ID, resolveCta, char caps per preset).
- apps/admin-panel/app/print-qr/page.tsx
- apps/admin-panel/app/print-qr/batch/page.tsx

Implement the Custom… option card per the plan: inline Line 1 /
Line 2 inputs, live preview, advisory char-count badge,
localStorage persistence under 'sweatdrop:print:custom-cta:{type}'.
Reject characters outside printable ASCII + Latin-Extended; do not
block on length overflow.

DO NOT add a database column. DO NOT call a Server Action. This is
purely client-side state.
```

### → `admin-coder` (Step 5 — NFC circle route)

```
Read docs/plans/feature_nfc_qr_combined_sticker_premium_design.md
(this file). Steps 2 + 3 must already be merged.

Files:
- apps/admin-panel/app/print-nfc/page.tsx (new)
- apps/admin-panel/components/MachineQRPrint.tsx (extend)
- apps/admin-panel/app/dashboard/gym/[id]/machines/[machineId]/page.tsx
  (add 'Print NFC dot' button next to existing Print button)
- apps/admin-panel/app/dashboard/super/machines/[machineId]/page.tsx
  (same)

Mirror /print-qr structure. Only show NFC_CIRCLE_PRESETS. Use
machineQrUrl() / checkinQrUrl() unchanged. Confirm copy-link
output is byte-equal to the same machine's QR-only and combo
sticker URLs.
```

---

**End of Plan**
