import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, getNumberStyle } from '@/lib/theme';

// AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.8)
// Shareable workout card component — Instagram Stories format (9:16 ratio).
// To enable sharing, install:
//   pnpm add react-native-view-shot expo-sharing --filter sweatdrop-mobile-app
// Then wrap this component with <ViewShot ref={...}> and use captureRef + Sharing.shareAsync.
// See: https://docs.expo.dev/versions/latest/sdk/sharing/

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48; // 24px padding on each side
const CARD_HEIGHT = CARD_WIDTH * (16 / 9); // 9:16 ratio (portrait)

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ShareableWorkoutData {
  dropsEarned: number;
  durationSeconds: number;
  machineType: string;
  machineName: string;
  calories?: number;
  multiplier?: number;
  streakDays?: number;
  rank?: number;
  gymName?: string;
  username?: string;
  /** Primary branding color (hex) */
  brandColor?: string;
  /** Dark variant of branding color */
  brandColorDark?: string;
  /** Text color on brand background */
  brandOnPrimary?: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

const MACHINE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  treadmill: 'walk-outline',
  bike: 'bicycle-outline',
  elliptical: 'fitness-outline',
  weight: 'barbell-outline',
};

/**
 * A beautifully styled shareable workout card in Instagram Stories format (9:16).
 * Designed to be captured with `react-native-view-shot` and shared via `expo-sharing`.
 *
 * Usage:
 * ```tsx
 * import ViewShot, { captureRef } from 'react-native-view-shot';
 * import * as Sharing from 'expo-sharing';
 *
 * const ref = useRef<ViewShot>(null);
 *
 * const share = async () => {
 *   const uri = await captureRef(ref, { format: 'png', quality: 1 });
 *   await Sharing.shareAsync(uri);
 * };
 *
 * <ViewShot ref={ref} options={{ format: 'png', quality: 1 }}>
 *   <ShareableWorkoutCard data={workoutData} />
 * </ViewShot>
 * ```
 */
export function ShareableWorkoutCard({ data }: { data: ShareableWorkoutData }) {
  const brandColor = data.brandColor || theme.colors.primary;
  const brandDark = data.brandColorDark || '#00B8CC';
  const brandOnPrimary = data.brandOnPrimary || '#000000';
  const machineIcon = MACHINE_ICONS[data.machineType] || 'fitness-outline';

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={['#050510', '#0A0E1A', '#050510']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.card}
      >
        {/* Top glow accent */}
        <View style={[styles.topGlow, { backgroundColor: hexToRgba(brandColor, 0.08) }]} />

        {/* ── Header: Brand + Gym ── */}
        <View style={styles.headerSection}>
          <View style={styles.brandRow}>
            <Ionicons name="water" size={28} color={brandColor} />
            <Text style={[styles.brandName, { color: brandColor }]}>SweatDrop</Text>
          </View>
          {data.gymName && (
            <Text style={[styles.gymName, { color: hexToRgba(brandColor, 0.6) }]}>{data.gymName}</Text>
          )}
        </View>

        {/* ── Hero: Drops Earned ── */}
        <View style={styles.heroSection}>
          <View style={[styles.dropsCircle, { borderColor: hexToRgba(brandColor, 0.4) }]}>
            <LinearGradient
              colors={[hexToRgba(brandColor, 0.12), hexToRgba(brandColor, 0.04)]}
              style={styles.dropsCircleInner}
            >
              <Ionicons name="water" size={32} color={brandColor} />
              <Text style={[styles.dropsValue, getNumberStyle(48), { color: brandColor }]}>
                {data.dropsEarned}
              </Text>
              <Text style={[styles.dropsLabel, { color: hexToRgba(brandColor, 0.7) }]}>drops earned</Text>
            </LinearGradient>
          </View>

          {/* Multiplier badge */}
          {data.multiplier && data.multiplier > 1 && (
            <View style={[styles.multiplierBadge, { backgroundColor: hexToRgba(brandColor, 0.15) }]}>
              <Ionicons name="flash" size={14} color={brandColor} />
              <Text style={[styles.multiplierText, { color: brandColor }]}>×{data.multiplier.toFixed(1)} multiplier</Text>
            </View>
          )}
        </View>

        {/* ── Stats Grid ── */}
        <View style={styles.statsGrid}>
          {/* Duration */}
          <View style={[styles.statCard, { borderColor: hexToRgba(brandColor, 0.12) }]}>
            <Ionicons name="time-outline" size={20} color={brandColor} />
            <Text style={[styles.statValue, getNumberStyle(20), { color: '#fff' }]}>
              {formatDuration(data.durationSeconds)}
            </Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>

          {/* Machine */}
          <View style={[styles.statCard, { borderColor: hexToRgba(brandColor, 0.12) }]}>
            <Ionicons name={machineIcon} size={20} color={brandColor} />
            <Text style={[styles.statValue, { color: '#fff', fontSize: 16, fontWeight: '700' }]} numberOfLines={1}>
              {data.machineName}
            </Text>
            <Text style={styles.statLabel}>Equipment</Text>
          </View>

          {/* Calories */}
          {data.calories ? (
            <View style={[styles.statCard, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <Ionicons name="flame-outline" size={20} color={theme.colors.secondary} />
              <Text style={[styles.statValue, getNumberStyle(20), { color: '#fff' }]}>
                ~{Math.round(data.calories)}
              </Text>
              <Text style={styles.statLabel}>Calories</Text>
            </View>
          ) : null}

          {/* Streak */}
          {data.streakDays && data.streakDays > 0 ? (
            <View style={[styles.statCard, { borderColor: 'rgba(255, 145, 0, 0.15)' }]}>
              <Text style={{ fontSize: 20 }}>🔥</Text>
              <Text style={[styles.statValue, getNumberStyle(20), { color: '#fff' }]}>
                {data.streakDays}
              </Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
          ) : null}
        </View>

        {/* ── Rank (if available) ── */}
        {data.rank && (
          <View style={[styles.rankBanner, { borderColor: hexToRgba(brandColor, 0.15) }]}>
            <Ionicons name="podium-outline" size={18} color={brandColor} />
            <Text style={[styles.rankText, { color: '#fff' }]}>
              Ranked <Text style={[getNumberStyle(16), { color: brandColor }]}>#{data.rank}</Text> this week
            </Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <View style={styles.footerContent}>
            {data.username && (
              <Text style={styles.footerUsername}>@{data.username}</Text>
            )}
            <View style={styles.footerBrand}>
              <Ionicons name="water" size={14} color={hexToRgba(brandColor, 0.4)} />
              <Text style={[styles.footerApp, { color: hexToRgba(brandColor, 0.4) }]}>sweatdrop.app</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    justifyContent: 'space-between',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    borderRadius: 24,
  },

  // ── Header ──
  headerSection: {
    alignItems: 'center',
    gap: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  gymName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Hero ──
  heroSection: {
    alignItems: 'center',
    gap: 12,
  },
  dropsCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dropsCircleInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropsValue: {
    marginTop: 4,
  },
  dropsLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  multiplierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  multiplierText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  statCard: {
    width: '46%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '600',
  },

  // ── Rank Banner ──
  rankBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Footer ──
  footer: {
    alignItems: 'center',
    gap: 10,
  },
  footerDivider: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1,
  },
  footerContent: {
    alignItems: 'center',
    gap: 4,
  },
  footerUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerApp: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
