import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
import { TIER_COLORS } from './BadgeCard';
import type { AchievementTier } from '@/hooks/useAllBadges';

// AGENT NOTE: [2026-04-25] - mobile-coder
// Shareable badge card — 1:1 square asset captured by react-native-view-shot
// and handed to expo-sharing when the user taps "Share Badge".
//
// Design philosophy: the badge is the hero. The card is a flat, cohesive
// dark surface (no two-tone halves, no top wash, no accent-colored brand
// header). Tier colour drives only the rings + earned pill — text colour
// stays neutral white-on-dark so the badge artwork is the visual punch.
//
// Inspired by the Apple Fitness award screen and Strava achievement
// share — both lean on a dark backdrop and a single hero element instead
// of marketing chrome. No tagline, no tier label, no decorative pills.

const CARD_SIZE = Dimensions.get('window').width - 48;

export interface ShareableBadgeData {
  badgeName: string;
  badgeDescription?: string | null;
  badgeImageUrl?: string | null;
  badgeType: 'global' | 'gym';
  earnedAt?: string | null;
  gymName?: string | null;
  username?: string | null;
  brandColor?: string;
  brandColorDark?: string;
  // Tier still flows through so we can pick the ring colour from the
  // shared TIER_COLORS palette. We deliberately don't render any tier
  // text/pill — the colour says it.
  tier?: AchievementTier | null;
}

function formatDate(dateString: string): string {
  return fmtDate(dateString, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getBadgeCategoryColor(badgeName: string, brandPrimary: string): string {
  const name = badgeName.toLowerCase();
  if (name.includes('streak') || name.includes('warm-up') || name.includes('unstoppable') || name.includes('iron will'))
    return '#FF9500';
  if (name.includes('drop') || name.includes('collector') || name.includes('hoarder') || name.includes('legend'))
    return '#30D158';
  if (name.includes('gym') || name.includes('explorer'))
    return '#BF5AF2';
  return brandPrimary;
}

export function ShareableBadgeCard({ data }: { data: ShareableBadgeData }) {
  const brandColor = data.brandColor || theme.colors.primary;
  const tierColor = data.tier ? TIER_COLORS[data.tier] : null;
  const accent = tierColor || getBadgeCategoryColor(data.badgeName, brandColor);

  const COIN_OUTER = 152;
  const COIN_INNER = 128;
  const COIN_IMG = 92;

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={['#0A0A14', '#131726', '#0A0A14']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.card}
      >
        {/* Center block — flex:1 so the hero + info stack is vertically
            centered between the top edge and the footer. */}
        <View style={styles.centerBlock}>
          <View style={styles.hero}>
            {/* Outer halo — iOS shadow paints the coloured glow, Android
                falls back to a softly tinted border (Android elevation
                ignores shadowColor). Earned only artefact. */}
            <View
              style={[
                styles.halo,
                {
                  width: COIN_OUTER + 22,
                  height: COIN_OUTER + 22,
                  borderRadius: (COIN_OUTER + 22) / 2,
                  shadowColor: accent,
                  borderColor: hexToRgba(accent, 0.18),
                },
              ]}
            />

            <View
              style={[
                styles.outerRing,
                {
                  width: COIN_OUTER,
                  height: COIN_OUTER,
                  borderRadius: COIN_OUTER / 2,
                  borderColor: hexToRgba(accent, 0.32),
                },
              ]}
            >
              <View
                style={[
                  styles.innerRing,
                  {
                    width: COIN_INNER,
                    height: COIN_INNER,
                    borderRadius: COIN_INNER / 2,
                    borderColor: accent,
                    backgroundColor: hexToRgba(accent, 0.06),
                  },
                ]}
              >
                {/* Diagonal sheen */}
                <LinearGradient
                  colors={[
                    hexToRgba(accent, 0.22),
                    'transparent',
                    hexToRgba(accent, 0.05),
                  ]}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: COIN_INNER / 2 }]}
                />
                {/* Top-left specular highlight */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.55, y: 0.55 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: COIN_INNER / 2 }]}
                />

                {data.badgeImageUrl ? (
                  <Image
                    source={{ uri: data.badgeImageUrl }}
                    style={{ width: COIN_IMG, height: COIN_IMG, borderRadius: 999 }}
                    contentFit="contain"
                  />
                ) : (
                  <Ionicons name="trophy" size={COIN_IMG * 0.6} color={accent} />
                )}
              </View>
            </View>

            {/* Earned check — pinned to the bottom-right of the inner ring,
                same anchor as BadgeCard so the share image reads as the
                same artefact captured at a higher resolution. */}
            <View style={[styles.checkBadge, { backgroundColor: accent }]}>
              <Ionicons name="checkmark" size={14} color="#000" />
            </View>
          </View>

          <Text style={styles.badgeName} numberOfLines={2}>
            {data.badgeName}
          </Text>

          {data.badgeDescription && (
            <Text style={styles.badgeDescription} numberOfLines={2}>
              {data.badgeDescription}
            </Text>
          )}

          {data.earnedAt && (
            <View
              style={[
                styles.earnedPill,
                {
                  backgroundColor: hexToRgba(accent, 0.12),
                  borderColor: hexToRgba(accent, 0.28),
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={13} color={accent} />
              <Text style={[styles.earnedText, { color: accent }]}>
                Earned {formatDate(data.earnedAt)}
              </Text>
            </View>
          )}

          {data.gymName && (
            <View style={styles.gymRow}>
              <Ionicons name="business-outline" size={12} color="rgba(255,255,255,0.4)" />
              <Text style={styles.gymText} numberOfLines={1}>
                {data.gymName}
              </Text>
            </View>
          )}
        </View>

        {/* Footer — neutral wordmark, no brand colour. The coin already
            carries the colour; this block just signs the image. */}
        <View style={styles.footer}>
          {data.username ? (
            <Text style={styles.username}>@{data.username}</Text>
          ) : null}
          <View style={styles.brandMark}>
            <Ionicons name="water" size={11} color="rgba(255,255,255,0.32)" />
            <Text style={styles.brandText}>SweatDrop</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 30,
    paddingBottom: 22,
    alignItems: 'center',
  },

  /* ── Center block (badge + info, vertically centered) ── */
  centerBlock: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  halo: {
    position: 'absolute',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
  },
  outerRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  checkBadge: {
    position: 'absolute',
    bottom: -2,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A0A14',
  },

  badgeName: {
    ...fontStyles.heading,
    fontSize: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.4,
    marginBottom: 6,
    lineHeight: 28,
    maxWidth: '90%',
  },
  badgeDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    maxWidth: '85%',
    ...fontStyles.body,
  },

  earnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  earnedText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },

  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gymText: {
    ...fontStyles.bodyMedium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    maxWidth: CARD_SIZE * 0.7,
  },

  /* ── Footer (signature block, neutral colours) ── */
  footer: {
    alignItems: 'center',
    gap: 4,
  },
  username: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 0.2,
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandText: {
    ...fontStyles.heading,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.32)',
    letterSpacing: 1.4,
  },
});
