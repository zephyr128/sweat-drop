# Feature: Admin Panel Badge Studio — SVG Badge Generator

## Context

**Problem:** Badges/achievements are currently created via a Node.js CLI script (`scripts/generate-achievement-badges.mjs`) that generates PNG files from SVG templates. Only the superadmin (developer) can run this script. Gym admins have no way to create custom badges for their gym's challenges.

**Opportunity:** The SVG template engine in the existing script is well-structured (tier gradients, category icons, layered composition). We can port this into a browser-side admin panel tool that lets gym admins:
1. Use their **gym logo** as the center icon (instead of the generic category icon).
2. Choose from preset **color tiers** or create custom palettes.
3. Generate multiple badge variants (e.g., bronze/silver/gold/platinum/diamond for a challenge set).
4. Preview badges live in the browser.
5. Upload generated badges to Supabase storage and attach them to gym challenges.

**Existing system:**
- `scripts/generate-achievement-badges.mjs` — CLI script using `@resvg/resvg-js` (server-side SVG→PNG).
- `global_achievements` table — global badges (sessions, drops, streak, multi_gym, distance) with tiers.
- `gym_challenges` table — gym-scoped challenges with `badge_image_url` field.
- `global-achievement-badges` Supabase storage bucket — stores PNG badge images.
- `gym-challenge-badges` Supabase storage bucket — stores gym-specific challenge badge images.

## Dependencies

- [x] Existing SVG template in `scripts/generate-achievement-badges.mjs`
- [x] `gym-challenge-badges` storage bucket exists
- [x] `gym_challenges.badge_image_url` column exists
- [x] Admin panel already has challenge management UI
- [ ] Need browser-compatible SVG rendering (no `@resvg/resvg-js` in browser)

## Execution Plan

### Step 1: Create shared SVG template module (admin-coder)

**File:** `apps/admin-panel/lib/badge-studio/badge-svg-template.ts`

Port the SVG template from `scripts/generate-achievement-badges.mjs` into a TypeScript module that:
1. Exports the `TIERS` color palette (bronze, silver, gold, platinum, diamond).
2. Exports the `CATEGORIES` SVG icon paths.
3. Exports a `renderBadgeSVG(options)` function that returns an SVG string.
4. Adds a NEW option: `customCenterImage?: string` (data URL or Supabase public URL) — renders the gym logo as the center element instead of the category icon.
5. Adds a NEW option: `customColors?: { grad: string[]; aura: string; plate: string }` — allows custom color palettes beyond the preset tiers.

```typescript
export interface BadgeOptions {
  size?: number;                 // default 512
  tier: TierKey;                 // 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'custom'
  category?: CategoryKey;        // 'sessions' | 'drops' | 'streak' | ... — ignored if customCenterImage set
  customCenterImage?: string;    // data URL or public URL for gym logo
  customColors?: {
    grad: [string, string, string, string];
    aura: string;
    plate: string;
  };
  label?: string;                // optional text below icon (e.g., "GOLD")
}

export function renderBadgeSVG(options: BadgeOptions): string {
  // ... SVG template (ported from generate-achievement-badges.mjs)
}
```

**Center image rendering:** When `customCenterImage` is provided, instead of the `<g transform="..."><path .../></g>` icon block, render:
```xml
<clipPath id="center-clip">
  <circle cx="256" cy="256" r="140"/>
</clipPath>
<image href="${customCenterImage}" x="116" y="116" width="280" height="280"
       clip-path="url(#center-clip)" preserveAspectRatio="xMidYMid slice"/>
```

This places the gym logo inside the circular glass disk, clipped to a circle.

### Step 2: Create Badge Preview component (admin-coder)

**File:** `apps/admin-panel/components/badge-studio/BadgePreview.tsx`

A React component that:
1. Calls `renderBadgeSVG(options)` to get the SVG string.
2. Renders the SVG inline via `dangerouslySetInnerHTML` (safe — we control the template).
3. Shows a grid of all 5 tier variants side by side.
4. Updates live as the user changes options.

```tsx
'use client';

interface BadgePreviewProps {
  category?: CategoryKey;
  customCenterImage?: string;
  tiers: TierKey[];
}

export function BadgePreview({ category, customCenterImage, tiers }: BadgePreviewProps) {
  return (
    <div className="flex gap-4 flex-wrap">
      {tiers.map((tier) => (
        <div key={tier} className="flex flex-col items-center gap-2">
          <div
            className="w-24 h-24"
            dangerouslySetInnerHTML={{
              __html: renderBadgeSVG({ tier, category, customCenterImage }),
            }}
          />
          <span className="text-xs text-gray-500 uppercase">{tier}</span>
        </div>
      ))}
    </div>
  );
}
```

### Step 3: Create Badge Studio page (admin-coder)

**File:** `apps/admin-panel/app/dashboard/badge-studio/page.tsx`

A full-page badge creation tool with:

1. **Logo source selector:**
   - "Use gym logo" (auto-fetches from `gyms.logo_url` for the current gym)
   - "Use category icon" (dropdown: sessions, drops, streak, distance, multi_gym, special)
   - "Upload custom image" (file input → data URL preview → later uploaded to storage)

2. **Tier/color picker:**
   - Preset tiers: bronze, silver, gold, platinum, diamond (checkboxes — select which to generate)
   - "Custom color" option with color pickers for gradient stops, aura, and plate colors

3. **Live preview panel:**
   - Shows all selected tier variants in a grid
   - Updates instantly on any option change

4. **Batch generate + upload:**
   - "Generate & Upload" button
   - For each selected tier: renders SVG → converts to PNG via `<canvas>` → uploads to `gym-challenge-badges` bucket
   - Returns array of public URLs

5. **Attach to challenge:**
   - Optional: dropdown of gym challenges that don't have a badge yet
   - Selecting one updates `gym_challenges.badge_image_url` with the generated URL

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Badge Studio                                      [← Back] │
├──────────────────────────┬──────────────────────────────────┤
│ Logo Source              │                                  │
│ ○ Gym logo               │   [bronze] [silver] [gold]      │
│ ○ Category icon ▼        │   [platinum] [diamond]           │
│ ○ Upload custom          │                                  │
│                          │   Live Preview                   │
│ Tiers to Generate        │                                  │
│ ☑ Bronze ☑ Silver        │                                  │
│ ☑ Gold   ☑ Platinum      │                                  │
│ ☑ Diamond                │                                  │
│                          │                                  │
│ [Generate & Upload]      │                                  │
│                          │                                  │
│ Attach to Challenge ▼    │                                  │
│ [Save Badge to Challenge]│                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Step 4: SVG → PNG conversion in browser (admin-coder)

**File:** `apps/admin-panel/lib/badge-studio/svg-to-png.ts`

Since `@resvg/resvg-js` is a Node.js library and won't work in the browser, use the `<canvas>` API:

```typescript
export async function svgToPng(svgString: string, size = 512): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.width = size;
  img.height = size;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, size, size);
  URL.revokeObjectURL(url);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
}
```

**Note:** When the center image is a cross-origin URL (Supabase storage), the `<image>` element in SVG may trigger CORS issues in the canvas. Mitigate by:
- Fetching the gym logo as a data URL first (fetch → blob → FileReader → data URL).
- Passing the data URL to `renderBadgeSVG` as `customCenterImage`.

### Step 5: Upload to Supabase storage (admin-coder)

**File:** `apps/admin-panel/lib/badge-studio/badge-upload.ts`

```typescript
export async function uploadBadge(
  gymId: string,
  filename: string,
  pngBlob: Blob,
): Promise<string> {
  const path = `${gymId}/${filename}`;
  const { error } = await supabase.storage
    .from('gym-challenge-badges')
    .upload(path, pngBlob, { contentType: 'image/png', upsert: true });
  if (error) throw error;

  const { data } = supabase.storage
    .from('gym-challenge-badges')
    .getPublicUrl(path);
  return data.publicUrl;
}
```

### Step 6: Add route to sidebar navigation (admin-coder)

**File:** `apps/admin-panel/components/Sidebar.tsx` (or equivalent navigation component)

Add "Badge Studio" link under the gym admin section:
- Icon: `Palette` or `Award` from `lucide-react`
- Route: `/dashboard/badge-studio`
- Visible to: `superadmin` and `gym_admin` roles

### Step 7: Update gym logo as badge base — quick-create from challenge form (admin-coder)

**File:** `apps/admin-panel/components/ChallengeForm.tsx` (or wherever challenges are created/edited)

Add a "Generate badge" button inline in the challenge creation form:
1. Opens a mini version of the Badge Studio (modal or inline accordion).
2. Pre-selects "Gym logo" as the center image.
3. Generates a single tier badge (user picks which tier).
4. Uploads and auto-fills the `badge_image_url` field.

This provides a fast path without navigating to the full Badge Studio page.

## Data Model Changes

**No schema changes required.** Existing fields are sufficient:
- `gym_challenges.badge_image_url` — stores the badge URL
- `gym-challenge-badges` storage bucket — stores the files
- `gyms.logo_url` — source for the gym logo

## API Contracts

**Badge Studio is entirely client-side (admin panel):**
- SVG rendering: in-browser JavaScript
- PNG conversion: `<canvas>` API
- Upload: Supabase Storage client (`@supabase/ssr`)
- Badge attachment: Supabase client UPDATE on `gym_challenges`

No new edge functions or RPCs required.

## Testing Requirements

1. **Badge generation** — Select gym logo + gold tier → verify preview renders correctly with logo centered in the gold ring.
2. **All tiers** — Generate all 5 tiers at once → verify each has the correct gradient colors and the logo is consistent.
3. **Upload** — Generate + upload → verify files appear in `gym-challenge-badges` bucket with correct paths.
4. **Attach** — Attach generated badge to a challenge → verify the challenge's badge_image_url is updated and the mobile app displays the new badge.
5. **Custom image** — Upload a non-gym-logo image → verify it renders and clips correctly.
6. **No logo** — Gym without a logo_url → verify the category icon fallback works.
7. **Cross-browser** — Test canvas SVG→PNG rendering in Chrome, Safari, Firefox.

## Workspace Assignment

- **admin-coder** — All steps (Steps 1–7, entirely within `apps/admin-panel/`)
- **mobile-coder** — No changes needed (mobile already renders `badge_image_url`)
- **supabase-dba** — No changes needed (bucket + columns already exist)

## Future Enhancements (Out of Scope)

- **Custom text overlay** — Badge labels like "WEEK 1 CHAMPION" burned into the SVG.
- **Animated badges** — Lottie/SVG animation for diamond-tier badges.
- **Badge template library** — Pre-made designs beyond the ring + icon template.
- **Global achievement editing** — Superadmin UI to update the global achievement badges (currently CLI-only).
