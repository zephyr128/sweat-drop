# Feature: Notification Detail Screen — Multi-Gym Aware Routing

## Context

**Problem:** When a multi-gym user taps a push notification, `getDeepLinkFromNotification()` computes a route and `_layout.tsx` immediately navigates there. Many notification types (`streak_reminder`, `re_engagement`, `happy_hour`, `campaign`, etc.) deep link to `/home` or `/gym-detail?gymId=X`. The issue:

1. If the user's **home gym** is Gym A and Gym B sends a notification, tapping it navigates to `/home` — which shows Gym A's branded context. The user has no idea the notification came from Gym B.
2. If the deep link is `/gym-detail?gymId=gymB`, the user is taken to the gym profile page — but without seeing the notification message itself.
3. Notifications from non-home gyms should **not** blindly deep-link into gym-specific flows (e.g. `/store`, `/challenges`) because those screens render in the home gym's context, not the originating gym's context.

**Solution:** Introduce a **Notification Detail** interstitial screen (`/notification-detail`) that:
- Displays the full notification message with clear gym attribution (logo, name)
- **Home gym notifications:** Shows the notification + a CTA button that continues to the deep link destination
- **Non-home gym notifications:** Shows the notification + a "View Gym" secondary action (navigates to `/gym-detail?gymId=X`) but does NOT deep link into gym-scoped screens that would render in the wrong gym context

This screen is also useful from the **inbox** (`/notifications`): tapping a notification row now opens the detail screen instead of silently deep-linking.

## Dependencies

- [x] All notification senders stamp `gym_id`, `gym_name`, `gym_logo_url` in data payload (completed — CHANGELOG `[Unreleased]` multi-gym notification differentiation)
- [x] `user_notifications` table stores `data` JSONB with gym fields
- [x] `useGymStore` exposes `homeGymId`
- [x] `getDeepLinkFromNotification()` in `lib/notifications.ts` computes deep links
- [x] `notifications.tsx` inbox screen renders notification list with gym pills
- [ ] No database/backend changes needed

## Execution Plan

### Step 1: Create Notification Detail Screen (mobile-coder)

**New file:** `apps/mobile-app/app/notification-detail.tsx`

**Route params** (passed via `router.push` query string or `useLocalSearchParams`):

```typescript
interface NotificationDetailParams {
  /** Notification ID from user_notifications table (for mark-read) */
  notificationId?: string;
  /** Notification title (from push data or inbox row) */
  title: string;
  /** Notification body text */
  body: string;
  /** Notification type (e.g. 'streak_reminder', 'campaign') */
  type?: string;
  /** Originating gym ID */
  gymId?: string;
  /** Originating gym name */
  gymName?: string;
  /** Originating gym logo URL */
  gymLogoUrl?: string;
  /** Pre-computed deep link (output of getDeepLinkFromNotification) */
  deepLink?: string;
  /** ISO timestamp */
  createdAt?: string;
}
```

**Screen layout (glassmorphic, branded, SWEATDROP design system):**

```
┌─────────────────────────────────────────┐
│  ← Back                                 │   ScreenHeader
├─────────────────────────────────────────┤
│                                         │
│         ┌──────────────────┐            │
│         │   [Gym Logo]     │            │   64×64 rounded gym logo
│         │   or type icon   │            │   fallback: notification type icon
│         └──────────────────┘            │
│                                         │
│         ┌─── gym pill ───┐              │   Gym name chip (if gym_name present)
│         │ 🏢 Vortex Gym  │              │
│         └────────────────┘              │
│                                         │
│   🔥 Streak at risk!                    │   Title — large, bold
│                                         │
│   Don't lose your 12-day streak.        │   Body — multi-line, secondary color
│   Train today to keep it alive.         │
│                                         │
│         2 hours ago                     │   Relative timestamp
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  IF home gym:                   │    │
│  │  [  ●  Go to Home  ]           │    │   Primary CTA → deep link
│  │                                 │    │
│  │  IF non-home gym:               │    │
│  │  [  ●  View Gym  ]             │    │   Secondary CTA → /gym-detail
│  │  (no deep link into             │    │
│  │   gym-scoped screens)           │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Logic:**

```typescript
const { homeGymId } = useGymStore();
const isHomeGym = !params.gymId || params.gymId === homeGymId;
const isGymScoped = !!params.gymId;

// CTA behavior:
if (isHomeGym && params.deepLink) {
  // Primary button: "Go" → router.replace(params.deepLink)
  // Uses replace so back-button returns to notifications inbox, not this interstitial
}
if (!isHomeGym && isGymScoped) {
  // Secondary button: "View Gym" → router.push(`/gym-detail?gymId=${params.gymId}`)
  // Does NOT follow the original deep link — it would render in wrong gym context
}
if (!isGymScoped && params.deepLink) {
  // Non-gym notification (rare) — follow deep link directly
}
```

**Components / patterns to use:**
- `ScreenHeader` with back button
- `LinearGradient` background (`['#000000', '#0A0E1A', '#000000']`)
- `expo-image` `<Image>` for gym logo (with fallback)
- `Ionicons` type icon (reuse `TYPE_META` mapping from `notifications.tsx`)
- `useBranding()` for primary color
- `FadeInDown` entrance animations (staggered)
- `useGymStore` for `homeGymId`
- `useLocalSearchParams` for route params
- `useThrottledRouter` for navigation
- Mark notification as read via `useNotifications().markRead([id])` on mount (if `notificationId` present)

**Design notes:**
- Glass card treatment for the notification content area
- The CTA button label should be contextual based on notification type:
  - `streak_reminder` → "Start Workout" (home gym) / "View Gym" (non-home)
  - `arena_prize` / `leaderboard_prize` → "View Prize" (home gym)
  - `campaign` → deep_link label or "View Offer" (home gym)
  - `drops_expiring` → "View Wallet" (home gym)
  - Generic fallback → "View" (home gym) / "View Gym" (non-home)
- Non-home gym notifications show an info chip: "This notification is from [Gym Name], not your home gym."

### Step 2: Register Screen in Stack Navigator (mobile-coder)

**File:** `apps/mobile-app/app/_layout.tsx`

Add to `StackNavigator`:

```typescript
<Stack.Screen name="notification-detail" options={{ headerShown: false }} />
```

Add `'/notification-detail'` to the `ALLOWED_DEEP_LINK_PREFIXES` array in `lib/notifications.ts`.

### Step 3: Update Push Notification Tap Handler (mobile-coder)

**File:** `apps/mobile-app/app/_layout.tsx`

**Current behavior** (lines 528–549):
`handleNotificationTap` receives a deep link string and does `routerPush(deepLink)`.

**New behavior:**
Instead of navigating directly to the deep link, route to `/notification-detail` with the full notification data so the user sees gym attribution before navigating further.

The `addNotificationListeners` callback currently only receives the deep link string. We need to also forward the raw notification data so we can extract `title`, `body`, `gym_id`, `gym_name`, `gym_logo_url`, and `type`.

**Changes to `lib/notifications.ts`:**

1. Change the `addNotificationListeners` callback signature from:
   ```typescript
   onNotificationTap: (deepLink: string | null) => void
   ```
   to:
   ```typescript
   onNotificationTap: (deepLink: string | null, notificationContent: NotificationTapPayload | null) => void
   ```

2. Export a new interface:
   ```typescript
   export interface NotificationTapPayload {
     title: string;
     body: string;
     data: NotificationData;
   }
   ```

3. In the response listener, extract `title` and `body` from `response.notification.request.content` and forward them alongside the deep link.

4. In `getInitialNotification`, also return `title` + `body` (change return type to `{ data, title, body } | null`).

**Changes to `_layout.tsx`:**

Update `handleNotificationTap` to build a `/notification-detail?...` URL instead of pushing the raw deep link:

```typescript
const handleNotificationTap = useCallback(
  (deepLink: string | null, payload: NotificationTapPayload | null) => {
    if (shouldRequireEmailVerification(notifSessionRef.current?.user)) {
      routerReplace('/(onboarding)/verify-email');
      return;
    }
    if (payload) {
      const params = new URLSearchParams();
      params.set('title', payload.title ?? '');
      params.set('body', payload.body ?? '');
      if (payload.data?.type) params.set('type', payload.data.type);
      if (payload.data?.gym_id) params.set('gymId', payload.data.gym_id);
      if (payload.data?.gym_name) params.set('gymName', payload.data.gym_name);
      if (payload.data?.gym_logo_url) params.set('gymLogoUrl', payload.data.gym_logo_url);
      if (deepLink) params.set('deepLink', deepLink);
      routerPush(`/notification-detail?${params.toString()}`);
    } else if (deepLink) {
      // Fallback for notifications without content (shouldn't happen)
      routerPush(deepLink);
    }
  },
  [routerPush, routerReplace],
);
```

**Important:** The deduplication logic (`lastHandledDeepLink`) should still work — just change the dedup key to include the notification-detail path.

### Step 4: Update Inbox Tap Handler (mobile-coder)

**File:** `apps/mobile-app/app/notifications.tsx`

**Current behavior** (lines 173–186):
`handlePress` calls `getDeepLinkFromNotification(item.data)` and `router.push(deepLink)`.

**New behavior:**
Route to `/notification-detail` with the inbox item's data instead of deep linking:

```typescript
const handlePress = useCallback(
  (item: AppNotification) => {
    if (!item.read_at) {
      void markRead([item.id]);
    }
    const deepLink = getDeepLinkFromNotification(
      item.data as Parameters<typeof getDeepLinkFromNotification>[0],
    );
    const params = new URLSearchParams();
    params.set('notificationId', item.id);
    params.set('title', item.title);
    params.set('body', item.body);
    params.set('type', item.type);
    if (item.data?.gym_id) params.set('gymId', item.data.gym_id as string);
    if (item.data?.gym_name) params.set('gymName', item.data.gym_name as string);
    if (item.data?.gym_logo_url) params.set('gymLogoUrl', item.data.gym_logo_url as string);
    if (deepLink) params.set('deepLink', deepLink);
    params.set('createdAt', item.created_at);
    router.push(`/notification-detail?${params.toString()}`);
  },
  [markRead, router],
);
```

### Step 5: i18n Keys (mobile-coder)

**Files:**
- `apps/mobile-app/locales/en/notifications.json`
- `apps/mobile-app/locales/sr/notifications.json`

**New keys:**

```json
// EN
{
  "detailTitle": "Notification",
  "fromGymNotHome": "This notification is from {{gymName}}",
  "actionGoHome": "Go to Home",
  "actionStartWorkout": "Start Workout",
  "actionViewPrize": "View Prize",
  "actionViewOffer": "View Offer",
  "actionViewWallet": "View Wallet",
  "actionViewLeaderboard": "View Leaderboard",
  "actionViewTrophies": "View Trophies",
  "actionView": "View",
  "actionViewGym": "View Gym",
  "actionDismiss": "Dismiss"
}
```

```json
// SR
{
  "detailTitle": "Obaveštenje",
  "fromGymNotHome": "Ovo obaveštenje je od {{gymName}}",
  "actionGoHome": "Idi na početnu",
  "actionStartWorkout": "Započni trening",
  "actionViewPrize": "Pogledaj nagradu",
  "actionViewOffer": "Pogledaj ponudu",
  "actionViewWallet": "Pogledaj novčanik",
  "actionViewLeaderboard": "Pogledaj rang listu",
  "actionViewTrophies": "Pogledaj trofeje",
  "actionView": "Pogledaj",
  "actionViewGym": "Pogledaj teretanu",
  "actionDismiss": "Zatvori"
}
```

### Step 6: CTA Label Resolver Helper (mobile-coder)

**File:** `apps/mobile-app/app/notification-detail.tsx` (inside the screen file)

Create a helper that maps `(notificationType, isHomeGym)` → i18n action key:

```typescript
function getActionLabel(type: string | undefined, isHomeGym: boolean): string {
  if (!isHomeGym) return 'actionViewGym';

  switch (type) {
    case 'streak_reminder':
    case 'streak_at_risk':
    case 're_engagement':
    case 'reengagement_7d':
    case 'reengagement_14d':
      return 'actionStartWorkout';
    case 'arena_prize':
    case 'arena_prize_unverified':
    case 'leaderboard_prize':
    case 'prize_ready':
      return 'actionViewPrize';
    case 'campaign':
    case 'comeback_offer':
      return 'actionViewOffer';
    case 'drops_expiry_30d':
    case 'drops_expiry_7d':
    case 'drops_expiring':
      return 'actionViewWallet';
    case 'weekly_results':
    case 'rank_overtaken':
      return 'actionViewLeaderboard';
    case 'badge_earned':
      return 'actionViewTrophies';
    default:
      return 'actionView';
  }
}
```

## Workspace Assignment

- **mobile-coder** — All steps (1–6). This is a purely mobile-side feature.
- **supabase-dba** — No changes needed. `user_notifications.data` JSONB already carries all gym fields.
- **edge-function-agent** — No changes needed. All senders already stamp gym context (completed in prior sprint).
- **admin-coder** — No changes needed.

## Testing Requirements

1. **Multi-gym user, notification from home gym:**
   - Trigger a `streak_reminder` from home gym → tap OS banner → notification-detail shows gym logo + "Start Workout" CTA → CTA navigates to `/home`
2. **Multi-gym user, notification from non-home gym:**
   - Trigger a `campaign` from non-home gym → tap OS banner → notification-detail shows non-home gym logo + info chip "from Gym B" + "View Gym" CTA → CTA navigates to `/gym-detail?gymId=gymB`
   - Verify: does NOT navigate to `/store` or `/home` (wrong gym context)
3. **Single-gym user:**
   - All notifications should show the primary CTA (since home gym === only gym) and deep link normally
4. **Inbox:**
   - Tap any notification row → opens `/notification-detail` → CTA works correctly
   - Back button returns to inbox
5. **Cold start:**
   - Kill app → receive notification → tap OS banner → app opens → notification-detail screen shows
6. **Notification without gym context:**
   - `badge_earned` has no `gym_id` → notification-detail shows type icon (ribbon), CTA is "View Trophies", navigates to `/trophy-room`
7. **Non-home gym "View Gym" flow:**
   - From notification-detail → "View Gym" → gym-detail screen shows the correct gym profile

## Edge Cases

- **`gym_logo_url` is null:** Fall back to notification type icon (reuse `TYPE_META` from `notifications.tsx`)
- **`gym_name` is null:** Don't show gym pill; treat as generic notification
- **`deep_link` is null:** Show only "Dismiss" action (no navigation CTA)
- **Notification data is minimal (old push before gym fields were added):** Graceful degradation — show notification title/body, no gym attribution, direct deep link if available

## Mobile Agent Prompt

> **Task:** Implement the Notification Detail screen per `docs/plans/feature_notification_detail_screen_multi_gym_routing.md`.
>
> **Context:** Multi-gym users can't tell which gym sent a notification when they tap it. The app currently deep-links straight to a destination screen (like `/home`), but that screen shows the home gym's branding, not the notification's originating gym. We need an interstitial screen that shows the full notification message with gym attribution before navigating.
>
> **Execute Steps 1–6 in order:**
>
> 1. Create `apps/mobile-app/app/notification-detail.tsx` — a full notification detail screen with gym logo, gym name pill, title, body, timestamp, and a contextual CTA button. If the notification is from the home gym, the CTA follows the deep link. If from a different gym, the CTA goes to "View Gym" (`/gym-detail`). Use SWEATDROP design system: `LinearGradient` background, `ScreenHeader`, `FadeInDown` animations, glassmorphic card, `useBranding()`. Read `useLocalSearchParams` for all params. Mark notification read on mount if `notificationId` is present.
>
> 2. Register the screen in `_layout.tsx` StackNavigator: `<Stack.Screen name="notification-detail" options={{ headerShown: false }} />`. Add `'/notification-detail'` to `ALLOWED_DEEP_LINK_PREFIXES` in `lib/notifications.ts`.
>
> 3. Update `lib/notifications.ts`: export a `NotificationTapPayload` interface. Change `addNotificationListeners` to forward `title`, `body`, and the full `data` alongside the deep link. Update `getInitialNotification` to also return `title` + `body`. Update `_layout.tsx` `handleNotificationTap` to build a `/notification-detail?...` URL with all notification fields (title, body, type, gymId, gymName, gymLogoUrl, deepLink) instead of pushing the raw deep link.
>
> 4. Update `notifications.tsx` inbox: change `handlePress` to navigate to `/notification-detail` with the item's title, body, type, gym data, computed deep link, and createdAt, instead of directly deep-linking.
>
> 5. Add i18n keys to `locales/{en,sr}/notifications.json`: `detailTitle`, `fromGymNotHome`, `actionGoHome`, `actionStartWorkout`, `actionViewPrize`, `actionViewOffer`, `actionViewWallet`, `actionViewLeaderboard`, `actionViewTrophies`, `actionView`, `actionViewGym`, `actionDismiss`.
>
> 6. Implement `getActionLabel(type, isHomeGym)` helper inside the notification-detail screen to resolve the CTA button's i18n key based on notification type and whether the originating gym is the home gym.
>
> **Design reference:** Match the existing detail screens (reward-detail, gym-detail): dark gradient background, glassmorphic content card, staggered FadeInDown animations, branded primary-color CTA button. The gym logo should be 64×64 rounded. Non-home gym notifications should show a subtle info banner "This notification is from [Gym Name]" in a muted warning style.
>
> **Critical rules:**
> - React Native only — `<View>`, `<Text>`, `<Pressable>`, `StyleSheet`
> - `@supabase/supabase-js` (NOT `@supabase/ssr`)
> - `useGymStore` for `homeGymId`
> - Do NOT break existing notification handling for non-gym notifications
> - Use `router.replace()` for the CTA navigation (so back-button from destination returns to inbox, not the interstitial)
> - EN + SR locale parity
