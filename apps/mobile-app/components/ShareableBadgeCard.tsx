import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, getNumberStyle } from '@/lib/theme';

// AGENT NOTE: [2026-03-03] - mobile-coder
// Shareable badge card for social sharing — 1:1 square format.
// Captured with react-native-view-shot and shared via expo-sharing.
// Used from BadgeDetailModal when the user taps "Share to Social".

const CARD_SIZE = Dimensions.get('window').width - 48;

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ShareableBadgeData {
  badgeName: string;
  badgeDescription?: string | null;
  badgeType: 'global' | 'gym';
  earnedAt?: string | null;
  gymName?: string | null;
  username?: string | null;
  brandColor?: string;
  brandColorDark?: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Badge category color mapping (matches BadgeCard)
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
  const categoryColor = getBadgeCategoryColor(data.badgeName, brandColor);

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={['#050510', '#0C1020', '#050510']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.card}
      >
        {/* Top radial glow */}
        <View style={[styles.topGlow, { backgroundColor: hexToRgba(categoryColor, 0.06) }]} />

        {/* Brand header */}
        <View style={styles.brandHeader}>
          <Ionicons name="water" size={18} color={hexToRgba(brandColor, 0.5)} />
          <Text style={[styles.brandName, { color: hexToRgba(brandColor, 0.5) }]}>SweatDrop</Text>
        </View>

        {/* Badge icon circle */}
        <View style={styles.badgeHero}>
          <View
            style={[
              styles.outerRing,
              { borderColor: hexToRgba(categoryColor, 0.25) },
            ]}
          >
            <View
              style={[
                styles.innerRing,
                {
                  borderColor: categoryColor,
                  backgroundColor: hexToRgba(categoryColor, 0.08),
                },
              ]}
            >
              <Ionicons name="trophy" size={48} color={categoryColor} />
            </View>
          </View>

          {/* Check badge */}
          <View style={[styles.checkBadge, { backgroundColor: categoryColor }]}>
            <Ionicons name="checkmark" size={14} color="#000" />
          </View>
        </View>

        {/* Badge name */}
        <Text style={styles.badgeName}>{data.badgeName}</Text>

        {/* Badge description */}
        {data.badgeDescription && (
          <Text style={styles.badgeDescription}>{data.badgeDescription}</Text>
        )}

        {/* Earned date */}
        {data.earnedAt && (
          <View style={styles.earnedRow}>
            <View style={[styles.earnedPill, { backgroundColor: hexToRgba(categoryColor, 0.1) }]}>
              <Ionicons name="checkmark-circle" size={14} color={categoryColor} />
              <Text style={[styles.earnedText, { color: categoryColor }]}>
                Earned {formatDate(data.earnedAt)}
              </Text>
            </View>
          </View>
        )}

        {/* Gym name */}
        {data.gymName && (
          <View style={styles.gymRow}>
            <Ionicons name="business-outline" size={13} color="rgba(255,255,255,0.3)" />
            <Text style={styles.gymText}>{data.gymName}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <View style={styles.footerContent}>
            {data.username && (
              <Text style={styles.username}>@{data.username}</Text>
            )}
            <View style={styles.footerBrand}>
              <Ionicons name="water" size={12} color={hexToRgba(brandColor, 0.3)} />
              <Text style={[styles.footerApp, { color: hexToRgba(brandColor, 0.3) }]}>
                sweatdrop.app
              </Text>
            </View>
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
    borderRadius: 24,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    borderRadius: 24,
  },
  brandHeader: {
    position: 'absolute',
    top: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  badgeHero: {
    alignItems: 'center',
    marginBottom: 16,
  },
  outerRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#050510',
  },
  badgeName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  badgeDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    maxWidth: '85%',
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
    fontSize: 12,
    fontWeight: '600',
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  gymText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    alignItems: 'center',
    gap: 8,
  },
  footerDivider: {
    width: 32,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 1,
  },
  footerContent: {
    alignItems: 'center',
    gap: 3,
  },
  username: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  footerApp: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
