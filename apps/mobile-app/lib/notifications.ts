/**
 * SWEATDROP — Push Notification Module
 *
 * AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.1)
 * Reference: docs/plans/mvp_full_audit_and_build_plan.md
 *
 * Handles:
 *   1. Permission request + Expo push token registration
 *   2. Storing token in profiles.expo_push_token via Supabase
 *   3. Foreground notification handler (shows banner)
 *   4. Notification response handler (deep linking on tap)
 *
 * Backend Edge Functions that send push notifications:
 *   - send-push           (generic sender, called by others)
 *   - streak-reminder     (daily 18:00 UTC — "🔥 Streak at risk!")
 *   - re-engagement       (7d / 14d inactive nudges)
 *   - drops-expiry-warning (30d / 7d before expiry)
 *
 * Token is saved once per session. If token changes (app reinstall, device change),
 * it will be updated automatically on next app launch.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

type NotificationsModule = typeof import('expo-notifications');
type NotificationSubscription = { remove: () => void };

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (!PUSH_NOTIFICATIONS_ENABLED) {
    return null;
  }
  // No __DEV__ guard: EAS dev-client builds support push notifications.
  // If the module isn't available (e.g. Expo Go), the import will fail gracefully.
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications')
      .then((module) => {
        if (
          typeof module?.getPermissionsAsync !== 'function' ||
          typeof module?.requestPermissionsAsync !== 'function'
        ) {
          return null;
        }
        return module;
      })
      .catch(() => null);
  }
  return notificationsModulePromise;
}

/**
 * Feature flag driven by EXPO_PUBLIC_PUSH_ENABLED env var.
 * Set to "true" (string) in .env / EAS build profile to activate push.
 * Falls back to `false` — all push registration / listeners become no-ops.
 */
export const PUSH_NOTIFICATIONS_ENABLED =
  (process.env.EXPO_PUBLIC_PUSH_ENABLED ?? '').toLowerCase() === 'true';

/**
 * Authoritative env tag for THIS install. Stamped onto the token row in
 * `profiles.expo_push_token_env` so backend senders can refuse cross-env
 * delivery. Falls back to env var, then 'production' to fail-closed (a build
 * that forgets to set EXPO_PUBLIC_APP_ENV is treated as prod, never the
 * reverse — this guarantees prod tokens cannot accidentally be tagged dev).
 */
export const APP_ENV: 'production' | 'preview' | 'development' = (() => {
  const raw =
    (Constants.expoConfig?.extra?.appEnv as string | undefined) ??
    process.env.EXPO_PUBLIC_APP_ENV ??
    'production';
  if (raw === 'preview' || raw === 'development') return raw;
  return 'production';
})();

const APP_BUNDLE_ID: string | null =
  (Constants.expoConfig?.extra?.bundleId as string | undefined) ?? null;

/** Push notification event types (mirrors backend/types/sweatdrop.ts NotificationTrigger) */
type NotificationTrigger =
  | 'session_ended'
  | 'badge_earned'
  | 'rank_overtaken'
  | 'reward_claimed'
  | 'streak_reminder'
  | 'streak_at_risk'
  | 'weekly_results'
  | 'reengagement_7d'
  | 'reengagement_14d'
  | 're_engagement'
  | 'drops_expiry_30d'
  | 'drops_expiry_7d'
  | 'drops_expiring'
  | 'arena_prize'
  | 'arena_prize_unverified'
  | 'arena_ended'
  | 'arena_cancelled'
  | 'leaderboard_prize'
  | 'prize_ready'
  | 'reminder'
  | 'comeback_offer'
  | 'happy_hour'
  | 'happy_hour_reminder'
  | 'campaign';
  // TODO: friend_request, challenge_invite, direct_message — out of scope, follow-up sprint

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NOTIFICATION HANDLER CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Must be called ONCE at app startup (before any notification arrives).
 */
export function configureNotificationHandler(): void {
  void getNotificationsModule().then((Notifications) => {
    if (!Notifications || typeof Notifications.setNotificationHandler !== 'function') {
      log.debug('[Notifications] expo-notifications unavailable, handler not configured');
      return;
    }
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false, // We don't use badge count in MVP
        }),
      });
    } catch (error) {
      log.warn('[Notifications] Failed to set notification handler:', error);
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOKEN REGISTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Register for push notifications and return the Expo push token.
 *
 * Flow:
 *   1. Check if physical device (push doesn't work on simulator)
 *   2. Check/request notification permissions
 *   3. Get Expo push token
 *
 * @returns The Expo push token string, or null if registration fails
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    log.debug('[Notifications] expo-notifications unavailable, skipping push registration');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      log.debug('[Notifications] Permission not granted:', finalStatus);
      return null;
    }

    // Get the project ID for Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
      process.env.EAS_PROJECT_ID;

    if (!projectId) {
      log.warn(
        '[Notifications] No EAS project ID found. Set EXPO_PUBLIC_EAS_PROJECT_ID in apps/mobile-app/.env and EAS build env.',
      );
      return null;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    log.debug('[Notifications] Expo push token:', token);

    // Android-specific: set notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'SweatDrop',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00E5FF',
        sound: 'default',
      });
    }

    return token;
  } catch (error) {
    log.error('[Notifications] Failed to register:', error);
    return null;
  }
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return 'unsupported';
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/**
 * Clear the push token from the user's profile in Supabase.
 * Called on logout — MUST be invoked before supabase.auth.signOut()
 * so the user still has auth to update their own profile row.
 *
 * @param userId - The authenticated user's ID
 */
export async function clearPushToken(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        expo_push_token: null,
        expo_push_token_env: null,
        expo_push_token_bundle: null,
        expo_push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      log.error('[Notifications] Failed to clear push token:', error.message);
    } else {
      log.debug('[Notifications] Push token cleared from profile');
    }
  } catch (error) {
    log.error('[Notifications] Error clearing push token:', error);
  }
}

/**
 * Save the push token to the user's profile in Supabase.
 *
 * Re-writes the row when EITHER the token string OR the env tag has changed.
 * The env-only case is critical: legacy rows backfilled by migration
 * 20260508140000 carry env='production' regardless of the actual install
 * environment; on the dev/preview build that mismatch must be corrected on
 * the next foreground sync, otherwise that user's token would be permanently
 * mistagged.
 *
 * @param userId - The authenticated user's ID
 * @param token  - The Expo push token string
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token, expo_push_token_env, expo_push_token_bundle')
      .eq('id', userId)
      .single();

    const tokenUnchanged = profile?.expo_push_token === token;
    const envUnchanged = profile?.expo_push_token_env === APP_ENV;
    const bundleUnchanged = profile?.expo_push_token_bundle === APP_BUNDLE_ID;
    if (tokenUnchanged && envUnchanged && bundleUnchanged) {
      log.debug('[Notifications] Token + env + bundle already match, skipping update');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        expo_push_token: token,
        expo_push_token_env: APP_ENV,
        expo_push_token_bundle: APP_BUNDLE_ID,
        expo_push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      log.error('[Notifications] Failed to save token:', error.message);
    } else {
      log.debug(
        '[Notifications] Token saved to profile',
        { env: APP_ENV, bundle: APP_BUNDLE_ID },
      );
    }
  } catch (error) {
    log.error('[Notifications] Error saving token:', error);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NOTIFICATION RESPONSE HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Data payload shape from our Edge Functions */
export interface NotificationData {
  type?: NotificationTrigger;
  session_id?: string;
  drops_earned?: string;
  multiplier?: string;
  badge_id?: string;
  badge_name?: string;
  gym_id?: string;
  new_rank?: string;
  period?: string;
  arena_id?: string;
  arena_name?: string;
  /** Deep-link target for campaign push (e.g. '/store', '/challenges') */
  deep_link?: string;
  /** Campaign-specific fields */
  campaign_id?: string;
  discount_code?: string;
  /** Leaderboard / arena prize fields */
  redemption_id?: string;
  redemption_code?: string;
  rank?: string;
  /** 'pending' | 'pending_verification' — set by edge functions (Phase 2) */
  redemption_status?: string;
  /** 'true' | 'false' string — mobile should pattern-match this string */
  requires_verification?: string;
  /** Originating gym name — stamped by all gym-scoped edge functions */
  gym_name?: string;
  /** Originating gym logo URL — stamped by all gym-scoped edge functions */
  gym_logo_url?: string;
  /**
   * Origin environment of the push (stamped server-side by send-push). When
   * present and != this install's APP_ENV, the deep link is suppressed —
   * defense-in-depth against cross-env token leakage that survives the
   * server-side env filter (e.g. caller passed `data: { app_env: 'production' }`
   * but the underlying token routes to a dev install).
   */
  app_env?: 'production' | 'preview' | 'development';
}

/**
 * Full notification content forwarded to the handleNotificationTap callback.
 * Carries the OS-level title + body alongside the structured data payload so
 * the detail screen can display the complete message with gym attribution.
 */
export interface NotificationTapPayload {
  title: string;
  body: string;
  data: NotificationData;
}

/**
 * Handle notification tap — returns a deep link path based on notification data.
 * Called when user taps a notification (foreground or background).
 *
 * @param data - The notification data payload
 * @returns Route path for expo-router navigation, or null for no navigation
 */
export function getDeepLinkFromNotification(data: NotificationData): string | null {
  // Cross-env guard: if the push was authored by a different environment
  // (e.g. dev cron leaked through to a prod install via a mistagged token),
  // refuse to navigate. The user has already seen the OS banner; we don't
  // compound the confusion by routing them into a screen whose underlying
  // ID doesn't exist in the local DB ("gym not found", etc.).
  if (data?.app_env && data.app_env !== APP_ENV) {
    log.warn(
      '[Notifications] Cross-env push tap ignored',
      { payload_env: data.app_env, app_env: APP_ENV, type: data?.type },
    );
    return null;
  }

  if (!data?.type) {
    return data?.deep_link ? sanitizeDeepLink(data.deep_link) : null;
  }

  switch (data.type) {
    case 'session_ended':
      if (data.session_id) {
        return `/session-summary?sessionId=${data.session_id}&drops=${data.drops_earned || '0'}&duration=0&multiplier=${data.multiplier || '1'}`;
      }
      return '/home';

    case 'badge_earned':
      return '/trophy-room';

    case 'rank_overtaken':
      return '/leaderboard';

    case 'reward_claimed':
      return '/redemptions';

    case 'streak_reminder':
    case 'streak_at_risk':
    case 're_engagement':
      return '/home';

    case 'weekly_results':
      return '/leaderboard';

    case 'reengagement_7d':
    case 'reengagement_14d':
      return '/home';

    case 'drops_expiry_30d':
    case 'drops_expiry_7d':
    case 'drops_expiring':
      return '/wallet';

    case 'arena_prize':
    case 'arena_prize_unverified':
    case 'leaderboard_prize': {
      // When requires_verification is 'true', append verify=1 so the redemptions
      // screen can auto-open the VerificationSheet to explain the verify step.
      const needsVerify = data.requires_verification === 'true';
      if (data.redemption_id) {
        const base = `/redemptions?highlight=${data.redemption_id}`;
        return needsVerify ? `${base}&verify=1` : base;
      }
      return needsVerify ? '/redemptions?verify=1' : '/redemptions';
    }

    case 'arena_ended':
      if (data.arena_id) return `/arena/${data.arena_id}`;
      return '/arenas';

    case 'arena_cancelled':
      if (data.arena_id) return `/arena/${data.arena_id}`;
      return '/arenas';

    case 'prize_ready':
      // Fired by send-prize-ready-push edge function when staff marks prize fulfilled.
      if (data.redemption_id) {
        return `/redemptions?highlight=${data.redemption_id}`;
      }
      return '/redemptions';

    case 'reminder':
      if (data.deep_link) return sanitizeDeepLink(data.deep_link);
      if (data.gym_id) return `/gym-detail?gymId=${data.gym_id}`;
      return '/home';

    case 'comeback_offer':
      if (data.deep_link) return sanitizeDeepLink(data.deep_link);
      if (data.gym_id) return `/gym-detail?gymId=${data.gym_id}`;
      return '/store';

    case 'happy_hour':
      return '/home';

    case 'happy_hour_reminder':
      if (data.gym_id) return `/gym-detail?gymId=${data.gym_id}`;
      return '/home';

    case 'campaign':
      if (data.deep_link) return sanitizeDeepLink(data.deep_link);
      if (data.gym_id) return `/gym-detail?gymId=${data.gym_id}`;
      return '/home';

    default:
      return '/home';
  }
}

const ALLOWED_DEEP_LINK_PREFIXES = [
  '/home', '/store', '/challenges', '/wallet', '/leaderboard',
  '/trophy-room', '/arenas', '/redemptions', '/profile',
  '/workout-history', '/gym-detail', '/challenge-detail',
  '/reward-detail', '/arena', '/session-summary', '/gyms', '/happy-hours',
  '/notification-detail',
];

function sanitizeDeepLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return '/home';
  const pathOnly = trimmed.split('?')[0];
  if (ALLOWED_DEEP_LINK_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(p + '/'))) {
    return trimmed;
  }
  log.warn('[Notifications] Blocked unknown deep link target:', trimmed);
  return '/home';
}

/**
 * Add listeners for notification events.
 * Returns cleanup function to remove listeners.
 *
 * @param onNotificationTap - Callback when user taps a notification.
 *                            Receives the deep link path (or null) and the full
 *                            notification content payload (title, body, data).
 */
export function addNotificationListeners(
  onNotificationTap: (deepLink: string | null, payload: NotificationTapPayload | null) => void
): () => void {
  let receivedSubscription: NotificationSubscription | null = null;
  let responseSubscription: NotificationSubscription | null = null;

  void getNotificationsModule().then((Notifications) => {
    if (
      !Notifications ||
      typeof Notifications.addNotificationReceivedListener !== 'function' ||
      typeof Notifications.addNotificationResponseReceivedListener !== 'function'
    ) {
      log.debug('[Notifications] expo-notifications unavailable, listeners not attached');
      return;
    }

    // Foreground: notification received while app is open
    receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data as NotificationData;
        log.debug('[Notifications] Received (foreground):', data?.type);
        // The notification banner is shown automatically via setNotificationHandler
      }
    );

    // Background/Killed: user tapped a notification
    responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const content = response.notification.request.content;
        const data = content.data as NotificationData;
        const title = (content.title ?? '') as string;
        const body = (content.body ?? '') as string;
        log.debug('[Notifications] Tapped:', data?.type);
        const deepLink = getDeepLinkFromNotification(data);
        onNotificationTap(deepLink, { title, body, data });
      }
    );
  });

  // Return cleanup function
  return () => {
    receivedSubscription?.remove();
    responseSubscription?.remove();
  };
}

/**
 * Check if the app was opened from a notification (cold start).
 * Should be called once on app startup.
 *
 * @returns The full notification content (data + title + body) if the app was
 *          opened from a notification tap, null otherwise.
 */
export async function getInitialNotification(): Promise<NotificationTapPayload | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications || typeof Notifications.getLastNotificationResponseAsync !== 'function') {
    return null;
  }
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    const content = response.notification.request.content;
    const data = content.data as NotificationData;
    const title = (content.title ?? '') as string;
    const body = (content.body ?? '') as string;
    log.debug('[Notifications] App opened from notification:', data?.type);
    return { data, title, body };
  }
  return null;
}
