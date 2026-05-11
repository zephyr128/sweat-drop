# Feature: Multi-Gym Notification Differentiation

## Context

**Problem:** In production, when a user is a member of multiple gyms, they cannot tell which gym sent a push notification. The OS notification banner shows only the app icon (iOS forces this — custom icons are not supported), the title, and the body. Without gym-identifying info in the text, every notification looks identical.

**Current state:** Some senders already include gym name (e.g., `send-happy-hour-reminders` prefixes the title with gym name). But many other senders do not. The in-app notification inbox (`user_notifications`) stores the data payload (which has `gym_id` and sometimes `gym_name`), but the inbox list doesn't render a gym logo or gym name header.

**Goal:** Every push notification a multi-gym user receives must clearly identify the originating gym — both in the OS notification banner and in the in-app notification inbox.

## Dependencies

- [x] `send-push` edge function already stamps `data.gym_id` and `data.gym_name` on some notification types
- [x] `user_notifications` table stores the data payload
- [x] `gyms` table has `logo_url` field
- [ ] Need to audit all notification senders to ensure they include gym context

## Execution Plan

### Step 1: Audit all notification senders (architect — this doc)

List of edge functions that send push notifications and whether they include gym context:

| Edge Function | Includes gym_id? | Includes gym_name in title/body? | Fix needed? | Status |
|---|---|---|---|---|
| `send-happy-hour-reminders` | ✅ yes | ✅ yes (title + body prefixed) | No | ✅ Done (pre-existing) |
| `streak-reminder` | ❌ no | ❌ no | **Yes** | ✅ Fixed — per-gym loop |
| `re-engagement` | ❌ no | ❌ no | **Yes** | ✅ Fixed — per-gym loop |
| `drops-expiry-warning` | ❌ no | ❌ no | **Yes** | ✅ Fixed — per user+gym grouping |
| `finalize-arena` | ✅ partial (winners only) | ❌ no title suffix | **Yes** | ✅ Fixed — gym_id added to arena query; all pushes have gym suffix + logo |
| `distribute-leaderboard-prizes` | ✅ yes (gym_id in data) | ❌ no title suffix | **Yes** | ✅ Fixed — gym_name, gym_logo_url added; title suffixed |
| `notify-arena-participants` | ❌ no | ❌ no | **Yes** | ✅ Fixed — gym_id added to arena query; all pushes have gym suffix + logo |
| `send-prize-ready-push` | ✅ partial (gym_id only) | ❌ no title suffix | **Yes** | ✅ Fixed — gym_name, gym_logo_url added; title suffixed |
| `process-campaigns` | ✅ via campaign.gym_id | ❌ no title suffix | **Yes** | ✅ Fixed — gym lookup pre-fetch; title suffixed; gym fields in data |

### Step 2: Standardize gym context in all notification payloads (edge-function-agent)

For **every** edge function that sends gym-scoped notifications:

1. Look up the gym's `name` (and optionally `logo_url`) alongside the user query.
2. Include `gym_id`, `gym_name`, and `gym_logo_url` in the `data` object passed to `send-push`.
3. Prefix the notification **title** with the gym name using a consistent format:
   - Pattern: `"[Gym Name]: [Original Title]"` or `"[Original Title] — [Gym Name]"`
   - Pick one pattern and enforce it everywhere.
   - Example: `"Vortex: Your streak is at risk! 🔥"` or `"Streak at risk! 🔥 — Vortex"`

**Recommendation:** Suffix pattern (`— Gym Name`) is better because the first words are the most visible in truncated OS banners. The actionable content should come first.

```typescript
// Standard pattern for all gym-scoped notification senders:
const gymName = gymRow?.name ?? 'your gym';
const title = `🔥 Your streak is at risk! — ${gymName}`;
const body = `Don't lose your ${streak}-day streak. Train today to keep it alive.`;
const data = {
  type: 'streak_reminder',
  gym_id: gymRow.id,
  gym_name: gymName,
  gym_logo_url: gymRow.logo_url ?? null,
  // ... other fields
};
```

### Step 3: Add gym logo to in-app notification inbox (mobile-coder)

**File:** `apps/mobile-app/app/notifications.tsx` (or wherever the inbox list is rendered)

Currently the inbox list likely renders notifications as flat text rows. For multi-gym differentiation:

1. Read `data.gym_logo_url` from the `user_notifications` row.
2. Render a small gym logo thumbnail (24×24 or 28×28 rounded) to the left of each notification row.
3. If `gym_logo_url` is null, show a generic gym icon placeholder.
4. Optionally render `data.gym_name` as a subtle subtitle/chip below the notification title.

**Design:**
```
┌─────────────────────────────────────────┐
│ [logo] Streak at risk! — Vortex         │
│         Don't lose your 5-day streak... │
│         2 hours ago                     │
├─────────────────────────────────────────┤
│ [logo] Happy Hour LIVE — FitZone        │
│         x2 drops for the next hour!     │
│         5 hours ago                     │
└─────────────────────────────────────────┘
```

### Step 4: Persist gym_logo_url in send-push inbox rows (edge-function-agent)

The `send-push` function writes `user_notifications` rows with the `data` object. As long as the caller includes `gym_logo_url` in `data`, it will be stored automatically. No change to `send-push` itself is needed — the fix is in the callers (Step 2).

### Step 5: Update shared send-push request parser for documentation (edge-function-agent)

**File:** `backend/supabase/functions/_shared/send-push-request.ts`

Add documentation/type hints indicating that callers SHOULD include `gym_name` and `gym_logo_url` in the `data` field for gym-scoped notifications. No runtime enforcement — just JSDoc guidance.

### Step 6: Rich notification support — subtitle on iOS (mobile-coder, optional enhancement)

Expo push notifications support a `subtitle` field (iOS only, shows below the title in smaller text). This is a free additional line for gym identification.

**Change in senders:**
```typescript
// In the send-push message object:
messages.push({
  to: token,
  sound: 'default',
  title,
  subtitle: gymName, // iOS only — shows gym name as a subtitle
  body,
  data: enrichedData,
});
```

**Impact:** `send-push/index.ts` message construction would need to accept and forward a `subtitle` field. The mobile `expo-notifications` handler already shows whatever the OS delivers — no mobile-side change needed for the banner. This is low-effort, high-impact for iOS multi-gym users.

### Step 7: i18n — update notification copy (mobile-coder)

If the inbox list renders `gym_name` as a chip or line, add locale keys:

**Files:** `apps/mobile-app/locales/{en,sr}/notifications.json`

```json
{
  "fromGym": "from {{gymName}}"
}
```

## Platform Constraints (Important)

- **iOS:** Custom notification icons are NOT supported. iOS always shows the app icon. The only way to identify the gym is via title, subtitle, or body text. Subtitle (Step 6) is the best option.
- **Android:** Custom small icons require native configuration at build time (not per-push). Large icons (thumbnail images) CAN be set per-notification using `richContent` or Expo's `android` notification options, but Expo's managed workflow has limited support. For MVP, rely on text differentiation.
- **In-app inbox:** Full control — gym logo can be rendered freely.

## Testing Requirements

1. **Multi-gym user** — Join 2+ gyms, trigger notifications from each (happy hour, streak), verify each push shows the gym name.
2. **Single-gym user** — Verify notifications still read naturally (gym name suffix doesn't look weird when there's only one gym).
3. **Inbox** — Open notifications tab, verify gym logos render correctly with fallback for gyms without logos.
4. **iOS subtitle** — If Step 6 is implemented, verify the subtitle line shows the gym name on iOS.

## Workspace Assignment

- **edge-function-agent** — Steps 1, 2, 4, 5 (audit + update all notification senders)
- **mobile-coder** — Steps 3, 6, 7 (inbox UI + subtitle + i18n)
- **supabase-dba** — No schema changes needed (data field is JSONB, already flexible)
- **admin-coder** — No changes needed
