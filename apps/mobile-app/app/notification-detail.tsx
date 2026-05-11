/**
 * SWEATDROP — Notification Detail Screen
 *
 * Interstitial screen shown when a user taps a push notification or an
 * inbox row. Displays the full notification message with gym attribution
 * (logo, name chip) and a contextual CTA button.
 *
 * Multi-gym routing logic:
 *   - Home gym notification  → primary CTA follows the pre-computed deep link
 *   - Non-home gym notification → CTA routes to /gym-detail (NOT the deep link,
 *     which would render in the wrong gym context)
 *   - No gym context → CTA follows deep link if available, else Dismiss
 *
 * AGENT NOTE: [2026-05-11] — mobile-coder
 * Part of multi-gym notification differentiation sprint.
 * Related: docs/plans/feature_notification_detail_screen_multi_gym_routing.md
 * Related files:
 *   - apps/mobile-app/lib/notifications.ts (NotificationTapPayload)
 *   - apps/mobile-app/app/_layout.tsx      (handleNotificationTap routing)
 *   - apps/mobile-app/app/notifications.tsx (inbox handlePress)
 *
 * AGENT NOTE: [2026-05-11] — mobile-ui-ux-agent
 * UI polish pass: aligned glass card treatment with stats.tsx / gym-detail.tsx
 * (PlatformBlur + asymmetric borders + GLASS_BG). Added type badge, ring
 * borders on icon/logo, LinearGradient CTA, tinted dismiss button, clock-icon
 * timestamp prefix.
 */

import { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '@/components/ScreenHeader';
import { PlatformBlur } from '@/components/PlatformBlur';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useGymStore } from '@/lib/stores/useGymStore';
import { supabase } from '@/lib/supabase';
import { theme as t, fontStyles, hexToRgba } from '@/lib/theme';
import { log } from '@/lib/logger';

// ─── Design tokens ────────────────────────────────────────────────────────────

const GLASS_BG = 'rgba(18, 18, 28, 0.80)';

// ─── Type icon mapping (mirrors notifications.tsx TYPE_META) ─────────────────

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_META: Record<string, { icon: IoniconsName; color: string }> = {
  session_ended:          { icon: 'fitness-outline',       color: '#00E5FF' },
  badge_earned:           { icon: 'ribbon-outline',        color: '#FFD700' },
  rank_overtaken:         { icon: 'trending-up-outline',   color: '#FF5252' },
  reward_claimed:         { icon: 'gift-outline',          color: '#00E5FF' },
  streak_reminder:        { icon: 'flame-outline',         color: '#FF9100' },
  streak_at_risk:         { icon: 'flame-outline',         color: '#FF5252' },
  weekly_results:         { icon: 'trophy-outline',        color: '#FFD700' },
  reengagement_7d:        { icon: 'heart-outline',         color: '#FF69B4' },
  reengagement_14d:       { icon: 'heart-outline',         color: '#FF69B4' },
  re_engagement:          { icon: 'heart-outline',         color: '#FF69B4' },
  drops_expiry_30d:       { icon: 'time-outline',          color: '#FF9100' },
  drops_expiry_7d:        { icon: 'time-outline',          color: '#FF5252' },
  drops_expiring:         { icon: 'time-outline',          color: '#FF5252' },
  arena_prize:            { icon: 'medal-outline',         color: '#FFD700' },
  arena_prize_unverified: { icon: 'medal-outline',         color: '#FFD700' },
  arena_ended:            { icon: 'flag-outline',          color: '#B0B0B0' },
  arena_cancelled:        { icon: 'close-circle-outline',  color: '#B0B0B0' },
  leaderboard_prize:      { icon: 'podium-outline',        color: '#FFD700' },
  prize_ready:            { icon: 'gift-outline',          color: '#FFD700' },
  reminder:               { icon: 'notifications-outline', color: '#00E5FF' },
  comeback_offer:         { icon: 'star-outline',          color: '#FF9100' },
  happy_hour:             { icon: 'flash-outline',         color: '#FFD700' },
  happy_hour_reminder:    { icon: 'flash-outline',         color: '#FFD700' },
  campaign:               { icon: 'megaphone-outline',     color: '#00E5FF' },
};

const DEFAULT_META = { icon: 'notifications-outline' as IoniconsName, color: '#808080' };

function getMeta(type: string | undefined) {
  if (!type) return DEFAULT_META;
  return TYPE_META[type] ?? DEFAULT_META;
}

// ─── CTA label resolver ───────────────────────────────────────────────────────

function getActionKey(type: string | undefined, isHomeGym: boolean): string {
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

// ─── Relative timestamp ───────────────────────────────────────────────────────

function relativeTime(
  iso: string | undefined,
  tFn: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return tFn('justNow');
  if (mins < 60) return tFn('minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tFn('hoursAgo', { count: hours });
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationDetailScreen() {
  const router = useThrottledRouter();
  const insets = useSafeAreaInsets();
  const { t: tNotif } = useTranslation('notifications');
  const branding = useBranding();
  const homeGymId = useGymStore((s) => s.homeGymId);

  const {
    notificationId,
    title,
    body,
    type,
    gymId,
    gymName,
    gymLogoUrl,
    deepLink,
    createdAt,
  } = useLocalSearchParams<{
    notificationId?: string;
    title: string;
    body: string;
    type?: string;
    gymId?: string;
    gymName?: string;
    gymLogoUrl?: string;
    deepLink?: string;
    createdAt?: string;
  }>();

  const isGymScoped = !!gymId;
  const isHomeGym = !gymId || gymId === homeGymId;

  const hasCta = isHomeGym ? !!deepLink : isGymScoped;
  const actionKey = getActionKey(type, isHomeGym);
  const meta = getMeta(type);

  // Mark notification as read on mount
  useEffect(() => {
    if (!notificationId) return;
    void supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .then(({ error }) => {
        if (error) log.warn('[NotificationDetail] Failed to mark read:', error.message);
      });
  }, [notificationId]);

  const handleCta = useCallback(() => {
    if (isHomeGym && deepLink) {
      router.replace(deepLink as any);
    } else if (!isHomeGym && isGymScoped && gymId) {
      router.replace(`/gym-detail?gymId=${gymId}` as any);
    } else if (!isGymScoped && deepLink) {
      router.replace(deepLink as any);
    } else {
      router.back();
    }
  }, [isHomeGym, isGymScoped, deepLink, gymId, router]);

  const handleDismiss = useCallback(() => {
    router.back();
  }, [router]);

  const timestamp = relativeTime(createdAt, tNotif);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={tNotif('detailTitle')} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Glass card ─── */}
        <Animated.View
          entering={FadeInDown.delay(0).duration(350).springify()}
          style={styles.cardOuter}
        >
          <PlatformBlur
            intensity={40}
            tint="dark"
            style={styles.cardBlur}
            androidColor="rgba(14,17,24,0.97)"
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardInner}
            >
              {/* Logo / icon */}
              <Animated.View
                entering={FadeInDown.delay(60).duration(350).springify()}
                style={styles.logoWrap}
              >
                {gymLogoUrl ? (
                  <Image
                    source={{ uri: gymLogoUrl }}
                    style={[
                      styles.gymLogo,
                      { borderColor: hexToRgba(branding.primary, 0.28) },
                    ]}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View
                    style={[
                      styles.iconCircle,
                      {
                        backgroundColor: hexToRgba(meta.color, 0.12),
                        borderColor: hexToRgba(meta.color, 0.28),
                      },
                    ]}
                  >
                    <Ionicons name={meta.icon} size={34} color={meta.color} />
                  </View>
                )}
              </Animated.View>

              {/* Notification type badge */}
              {type ? (
                <Animated.View
                  entering={FadeInDown.delay(100).duration(350).springify()}
                  style={[
                    styles.typeBadge,
                    {
                      backgroundColor: hexToRgba(meta.color, 0.10),
                      borderColor: hexToRgba(meta.color, 0.22),
                    },
                  ]}
                >
                  <Ionicons
                    name={meta.icon}
                    size={10}
                    color={meta.color}
                    style={styles.typeBadgeIcon}
                  />
                  <Text style={[styles.typeBadgeText, { color: meta.color }]}>
                    {type.replace(/_/g, ' ')}
                  </Text>
                </Animated.View>
              ) : null}

              {/* Gym name pill */}
              {gymName ? (
                <Animated.View
                  entering={FadeInDown.delay(140).duration(350).springify()}
                  style={[
                    styles.gymPill,
                    { borderColor: hexToRgba(branding.primary, 0.2) },
                  ]}
                >
                  <Ionicons
                    name="business-outline"
                    size={11}
                    color={branding.primary}
                    style={styles.gymPillIcon}
                  />
                  <Text
                    style={[styles.gymPillText, { color: branding.primary }]}
                    numberOfLines={1}
                  >
                    {gymName}
                  </Text>
                </Animated.View>
              ) : null}

              {/* Title */}
              {title ? (
                <Animated.Text
                  entering={FadeInDown.delay(180).duration(350).springify()}
                  style={styles.title}
                >
                  {title}
                </Animated.Text>
              ) : null}

              {/* Body */}
              {body ? (
                <Animated.Text
                  entering={FadeInDown.delay(240).duration(350).springify()}
                  style={styles.body}
                >
                  {body}
                </Animated.Text>
              ) : null}

              {/* Timestamp */}
              {timestamp ? (
                <Animated.View
                  entering={FadeInDown.delay(300).duration(350).springify()}
                  style={styles.timestampRow}
                >
                  <Ionicons name="time-outline" size={12} color={t.colors.textTertiary} />
                  <Text style={styles.timestamp}>{timestamp}</Text>
                </Animated.View>
              ) : null}
            </LinearGradient>
          </PlatformBlur>
        </Animated.View>

        {/* ─── Non-home gym warning ─── */}
        {!isHomeGym && gymName ? (
          <Animated.View
            entering={FadeInDown.delay(360).duration(350).springify()}
            style={styles.nonHomeWarning}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color="#FF9100"
              style={styles.warningIcon}
            />
            <Text style={styles.warningText}>
              {tNotif('fromGymNotHome', { gymName })}
            </Text>
          </Animated.View>
        ) : null}

        {/* ─── CTA button ─── */}
        <Animated.View
          entering={FadeInDown.delay(420).duration(350).springify()}
          style={styles.ctaWrap}
        >
          {hasCta ? (
            <Pressable
              style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.85 : 1 }]}
              onPress={handleCta}
            >
              <LinearGradient
                colors={[branding.primary, hexToRgba(branding.primary, 0.78)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <Text style={[styles.ctaText, { color: branding.onPrimary }]}>
                  {tNotif(actionKey)}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.dismissButton,
              {
                borderColor: hexToRgba(branding.primary, 0.20),
                backgroundColor: hexToRgba(branding.primary, 0.05),
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={handleDismiss}
          >
            <Text style={styles.dismissText}>{tNotif('actionDismiss')}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    flexGrow: 1,
  },

  // ── Glass card ──
  cardOuter: {
    borderRadius: 20,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    borderLeftColor: 'rgba(255,255,255,0.07)',
    borderRightColor: 'rgba(255,255,255,0.05)',
    borderBottomColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
  },
  cardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardInner: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 12,
  },

  // ── Icon / logo ──
  logoWrap: {
    marginBottom: 4,
  },
  gymLogo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },

  // ── Type badge ──
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeIcon: {
    marginRight: 4,
  },
  typeBadgeText: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 11,
    letterSpacing: 1.2,
  },

  // ── Gym pill ──
  gymPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    maxWidth: '80%',
  },
  gymPillIcon: {
    marginRight: 4,
  },
  gymPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },

  // ── Notification content ──
  title: {
    ...fontStyles.bodySemiBold,
    fontSize: 22,
    color: t.colors.text,
    textAlign: 'center',
    lineHeight: 30,
  },
  body: {
    ...fontStyles.body,
    fontSize: 15,
    color: t.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  timestamp: {
    ...fontStyles.body,
    fontSize: 12,
    color: t.colors.textTertiary,
  },

  // ── Non-home gym warning ──
  nonHomeWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    marginHorizontal: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,145,0,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,145,0,0.18)',
    gap: 8,
  },
  warningIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  warningText: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#FF9100',
    flex: 1,
    lineHeight: 19,
  },

  // ── CTA area ──
  ctaWrap: {
    marginTop: 24,
    gap: 12,
  },
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  dismissButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dismissText: {
    ...fontStyles.body,
    fontSize: 15,
    color: t.colors.textSecondary,
  },
});
