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
// Shareable badge card for social sharing — 1:1 square format.
// Captured with react-native-view-shot and shared via expo-sharing.
// Used from BadgeDetailModal when the user taps "Share Badge".
//
// Visual identity mirrors BadgeCard + BadgeDetailModal so the user gets
// a single coherent badge "moment" across the in-app card, the detail
// modal, and what their followers see in the share image. Tier colour
// drives the rings, gradients, and the tier pill; falls back to a
// category colour for legacy badges that don't have a tier set.

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
  tier?: AchievementTier | null;
  tierLabel?: string | null;
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

  // The share image is wider than the in-app coin so the inner-ring +
  // outer-ring sizes are scaled up proportionally. They keep the same
  // ratio so the rendered card reads as the same artefact as the modal.
  const COIN_OUTER = 132;
  const COIN_INNER = 110;
  const COIN_IMG = 80;

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={['#050510', '#0C1020', '#050510']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.card}
      >
        {/* Tier-tinted radial wash at the top so the badge looks enthroned
            rather than sitting on a flat dark surface. */}
        <View style={[styles.topGlow, { backgroundColor: hexToRgba(accent, 0.10) }]} />

        {/* Brand header — small, top-left, leaves the badge to be the hero. */}
        <View style={styles.brandHeader}>
          <Ionicons name="water" size={16} color={hexToRgba(brandColor, 0.65)} />
          <Text style={[styles.brandName, { color: hexToRgba(brandColor, 0.65) }]}>SweatDrop</Text>
        </View>

        {/* Tier pill — top-right when present. Tells the audience how rare
            the badge is at a glance. */}
        {data.tierLabel && (
          <View
            style={[
              styles.tierPill,
              {
                backgroundColor: hexToRgba(accent, 0.14),
                borderColor: hexToRgba(accent, 0.4),
              },
            ]}
          >
            <View style={[styles.tierDot, { backgroundColor: accent }]} />
            <Text style={[styles.tierPillText, { color: accent }]}>{data.tierLabel.toUpperCase()}</Text>
          </View>
        )}

        {/* Badge hero — outer ring + inner ring + earned check, just like
            BadgeCard but scaled up for the share format. */}
        <View style={styles.badgeHero}>
          <View
            style={[
              styles.outerRing,
              {
                width: COIN_OUTER,
                height: COIN_OUTER,
                borderRadius: COIN_OUTER / 2,
                borderColor: hexToRgba(accent, 0.28),
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
              {/* Top-left specular */}
              <LinearGradient
                colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']}
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

          <View style={[styles.checkBadge, { backgroundColor: accent }]}>
            <Ionicons name="checkmark" size={14} color="#000" />
          </View>
        </View>

        <Text style={styles.badgeName} numberOfLines={2}>{data.badgeName}</Text>

        {data.badgeDescription && (
          <Text style={styles.badgeDescription} numberOfLines={2}>{data.badgeDescription}</Text>
        )}

        {data.earnedAt && (
          <View style={styles.earnedRow}>
            <View style={[styles.earnedPill, { backgroundColor: hexToRgba(accent, 0.10) }]}>
              <Ionicons name="checkmark-circle" size={14} color={accent} />
              <Text style={[styles.earnedText, { color: accent }]}>
                Earned {formatDate(data.earnedAt)}
              </Text>
            </View>
          </View>
        )}

        {data.gymName && (
          <View style={styles.gymRow}>
            <Ionicons name="business-outline" size={13} color="rgba(255,255,255,0.35)" />
            <Text style={styles.gymText} numberOfLines={1}>{data.gymName}</Text>
          </View>
        )}

        {/* Footer — divider + username + tagline */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <View style={styles.footerContent}>
            {data.username && (
              <Text style={styles.username}>@{data.username}</Text>
            )}
            <Text style={styles.tagline}>SCAN. TRAIN. EARN.</Text>
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
    paddingTop: 56,
    paddingBottom: 56,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  brandHeader: {
    position: 'absolute',
    top: 20,
    left: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    ...fontStyles.heading,
    fontSize: 14,
    letterSpacing: 1.4,
  },
  tierPill: {
    position: 'absolute',
    top: 22,
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 11,
    borderWidth: 1,
  },
  tierDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  tierPillText: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  badgeHero: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 18,
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
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#050510',
  },
  badgeName: {
    ...fontStyles.heading,
    fontSize: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 8,
    lineHeight: 28,
  },
  badgeDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    maxWidth: '85%',
    ...fontStyles.body,
  },
  earnedRow: {
    marginBottom: 8,
  },
  earnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  earnedText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  gymText: {
    ...fontStyles.bodyMedium,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    maxWidth: CARD_SIZE * 0.7,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
  },
  footerDivider: {
    width: 36,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1,
  },
  footerContent: {
    alignItems: 'center',
    gap: 4,
  },
  username: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tagline: {
    ...fontStyles.heading,
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.28)',
    letterSpacing: 2.4,
  },
});
