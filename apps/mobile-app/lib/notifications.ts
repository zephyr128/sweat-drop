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
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

/**
 * Feature flag: set to `true` once Organization Apple Developer account is active
 * and the expo-notifications plugin is re-enabled in app.config.js.
 *
 * While `false`, all push notification registration / listeners are no-ops.
 * This avoids crashes on Personal Development teams that lack the Push
 * Notifications entitlement.
 */
export const PUSH_NOTIFICATIONS_ENABLED = false;

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
  | 'drops_expiry_30d'
  | 'drops_expiry_7d'
  | 'arena_prize'
  | 'arena_ended'
  | 'leaderboard_prize';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NOTIFICATION HANDLER CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Configure how notifications are displayed when the app is in the foreground.
 * Must be called ONCE at app startup (before any notification arrives).
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false, // We don't use badge count in MVP
      shouldShowBanner: true,
      shouldShowList: true,
    }),
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
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('[Notifications] Skipping push registration — not a physical device');
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
      console.log('[Notifications] Permission not granted:', finalStatus);
      return null;
    }

    // Get the project ID for Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[Notifications] No EAS project ID found — using default token generation');
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });

    const token = tokenData.data;
    console.log('[Notifications] Expo push token:', token);

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
    console.error('[Notifications] Failed to register:', error);
    return null;
  }
}

/**
 * Save the push token to the user's profile in Supabase.
 * Only updates if the token has changed (avoids unnecessary writes).
 *
 * @param userId - The authenticated user's ID
 * @param token  - The Expo push token string
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    // Check if token already matches (avoid unnecessary update)
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .single();

    if (profile?.expo_push_token === token) {
      console.log('[Notifications] Token already saved, skipping update');
      return;
    }

    // Update the profile with the new token
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (error) {
      console.error('[Notifications] Failed to save token:', error.message);
    } else {
      console.log('[Notifications] Token saved to profile');
    }
  } catch (error) {
    console.error('[Notifications] Error saving token:', error);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NOTIFICATION RESPONSE HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Data payload shape from our Edge Functions */
interface NotificationData {
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
}

/**
 * Handle notification tap — returns a deep link path based on notification data.
 * Called when user taps a notification (foreground or background).
 *
 * @param data - The notification data payload
 * @returns Route path for expo-router navigation, or null for no navigation
 */
export function getDeepLinkFromNotification(data: NotificationData): string | null {
  if (!data?.type) return null;

  switch (data.type) {
    case 'session_ended':
      // Navigate to session summary
      if (data.session_id) {
        return `/session-summary?sessionId=${data.session_id}&drops=${data.drops_earned || '0'}&duration=0&multiplier=${data.multiplier || '1'}`;
      }
      return '/home';

    case 'badge_earned':
      // Navigate to trophy room
      return '/trophy-room';

    case 'rank_overtaken':
      // Navigate to leaderboard
      return '/leaderboard';

    case 'reward_claimed':
      // Navigate to redemptions
      return '/redemptions';

    case 'streak_reminder':
    case 'streak_at_risk':
      // Navigate to home (start a workout)
      return '/home';

    case 'weekly_results':
      // Navigate to leaderboard
      return '/leaderboard';

    case 'reengagement_7d':
    case 'reengagement_14d':
      // Navigate to home
      return '/home';

    case 'drops_expiry_30d':
    case 'drops_expiry_7d':
      return '/wallet';

    case 'arena_prize':
      if (data.arena_id) return `/arena/${data.arena_id}`;
      return '/redemptions';

    case 'arena_ended':
      if (data.arena_id) return `/arena/${data.arena_id}`;
      return '/arenas';

    case 'leaderboard_prize':
      return '/leaderboard';

    default:
      return '/home';
  }
}

/**
 * Add listeners for notification events.
 * Returns cleanup function to remove listeners.
 *
 * @param onNotificationTap - Callback when user taps a notification.
 *                            Receives the deep link path (or null).
 */
export function addNotificationListeners(
  onNotificationTap: (deepLink: string | null) => void
): () => void {
  // Foreground: notification received while app is open
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const data = notification.request.content.data as NotificationData;
      console.log('[Notifications] Received (foreground):', data?.type);
      // The notification banner is shown automatically via setNotificationHandler
    }
  );

  // Background/Killed: user tapped a notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as NotificationData;
      console.log('[Notifications] Tapped:', data?.type);
      const deepLink = getDeepLinkFromNotification(data);
      onNotificationTap(deepLink);
    }
  );

  // Return cleanup function
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Check if the app was opened from a notification (cold start).
 * Should be called once on app startup.
 *
 * @returns The notification data if app was opened from notification, null otherwise
 */
export async function getInitialNotification(): Promise<NotificationData | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (response) {
    const data = response.notification.request.content.data as NotificationData;
    console.log('[Notifications] App opened from notification:', data?.type);
    return data;
  }
  return null;
}
