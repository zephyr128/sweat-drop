/**
 * CompeteStatsCards
 * Premium glass stat cards for the Compete tab with emotional context per period:
 *   - Hero (weekly): mini rival list — who's above/below you
 *   - Monthly side card: rank + trend arrow (delta from weekly rank as proxy)
 *   - All-time side card: celebration if #1, "rekorder" badge
 *   - Full-width: monthly drops progress bar
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { fontStyles, getNumberStyle, hexToRgba } from '@/lib/theme';
import { PressableCard } from '@/components/PressableCard';
import type { PeriodRankInfo } from '@/hooks/useCompeteStats';
import type { LeaderboardPeriod } from '@/components/LeaderboardPreview';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_PAD = 16;

const HERO_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.58;
const SIDE_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.42;
const HERO_H = 162;
const SIDE_H = (HERO_H - CARD_GAP) / 2;

const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';
const GREEN = '#4ade80';
const GLASS_BG = 'rgba(10, 10, 20, 0.52)';

function rankColor(rank: number, primary: string): string {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  if (rank > 0 && rank <= 10) return primary;
  return 'rgba(255,255,255,0.65)';
}

function rankOrdinal(rank: number): string {
  if (rank <= 0) return '–';
  return `#${rank}`;
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Animated progress bar ─────────────────────────────────────────────────────
function AnimBar({ pct, color }: { pct: number; color: string }) {
  const anim = useAnimatedStyle(() => ({
    width: withTiming(`${Math.min(pct, 100)}%` as any, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    }),
  }));
  return (
    <View style={[barStyles.track, { backgroundColor: hexToRgba(color, 0.12) }]}>
      <Animated.View style={[barStyles.fillWrap, anim]}>
        <LinearGradient
          colors={[color, hexToRgba(color, 0.55)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={barStyles.fill}
        />
      </Animated.View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  fillWrap: { height: '100%' },
  fill: { height: '100%', borderRadius: 2 },
});

// ── Props ────────────────────────────────────────────────────────────────────
export interface CompeteStatsCardsProps {
  weekly: PeriodRankInfo;
  monthly: PeriodRankInfo;
  allTime: PeriodRankInfo;
  primaryColor: string;
  loading?: boolean;
  onLeaderboardPress?: (period: LeaderboardPeriod) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CompeteStatsCards({
  weekly,
  monthly,
  allTime,
  primaryColor,
  loading = false,
  onLeaderboardPress,
}: CompeteStatsCardsProps) {
  const { t } = useTranslation('home');

  const heroColor = rankColor(weekly.rank, primaryColor);
  const weeklyProgressPct = weekly.leaderDrops > 0
    ? Math.min((weekly.myDrops / weekly.leaderDrops) * 100, 100)
    : 0;

  // Monthly delta: compare monthly rank vs weekly rank as a rough trend proxy
  const monthlyDelta = (monthly.rank > 0 && weekly.rank > 0)
    ? weekly.rank - monthly.rank  // positive = monthly is better
    : null;

  return (
    <View style={styles.wrapper}>

      {/* ── Top row: hero (weekly) + side (monthly + all-time) ── */}
      <View style={styles.topRow}>

        {/* Hero card — weekly rank with rival context */}
        <PressableCard
          style={[styles.heroCard, { borderColor: hexToRgba(heroColor, 0.30) }]}
          onPress={() => onLeaderboardPress?.('weekly')}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
            <LinearGradient
              colors={[hexToRgba(heroColor, 0.16), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Ionicons
              name="podium-outline"
              size={96}
              color={hexToRgba(heroColor, 0.07)}
              style={styles.watermark}
            />
            <View style={styles.heroLabelRow}>
              <View style={[styles.heroIconWrap, { backgroundColor: hexToRgba(heroColor, 0.14) }]}>
                <Ionicons name="trophy-outline" size={12} color={heroColor} />
              </View>
              <Text style={styles.heroEyebrow}>{t('compete.weekly')}</Text>
            </View>

            <Text style={[styles.heroRankNumber, { color: heroColor }]}>
              {loading ? '–' : rankOrdinal(weekly.rank)}
            </Text>
            <Text style={styles.heroSub}>
              {weekly.totalMembers > 0 ? t('compete.outOf', { total: weekly.totalMembers }) : ''}
            </Text>

            {/* Rival mini-list */}
            {!loading && weekly.neighbors.length > 0 && (
              <View style={styles.rivalList}>
                {weekly.neighbors.map((n, i) => {
                  const dotColor = n.isMe ? heroColor : (i === 0 ? SILVER : 'rgba(255,255,255,0.30)');
                  const delta = n.isMe ? null : (weekly.myDrops - n.drops);
                  return (
                    <View key={i} style={styles.rivalRow}>
                      <View style={[styles.rivalDot, { backgroundColor: dotColor }]} />
                      <Text
                        style={[styles.rivalName, n.isMe && { color: heroColor, fontWeight: '700' }]}
                        numberOfLines={1}
                      >
                        {n.isMe ? `${t('compete.you')} (${rankOrdinal(n.rank)})` : n.username}
                      </Text>
                      {!n.isMe && delta !== null && (
                        <Text style={[styles.rivalDelta, { color: delta > 0 ? GREEN : 'rgba(255,100,100,0.85)' }]}>
                          {delta > 0 ? `+${formatK(delta)}` : formatK(delta)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Progress bar vs leader */}
            {!loading && weekly.leaderDrops > 0 && (
              <View style={styles.heroBarWrap}>
                <AnimBar pct={weeklyProgressPct} color={heroColor} />
              </View>
            )}
          </PlatformBlur>
        </PressableCard>

        {/* Side column: monthly + all-time */}
        <View style={styles.sideCol}>

          {/* Monthly rank — with trend delta */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(GOLD, 0.20) }]}
            onPress={() => onLeaderboardPress?.('monthly')}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
              <LinearGradient
                colors={[hexToRgba(GOLD, 0.10), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(GOLD, 0.14) }]}>
                  <Ionicons name="calendar-outline" size={11} color={GOLD} />
                </View>
                <Text style={[styles.sideEyebrow, { color: hexToRgba(GOLD, 0.65) }]} numberOfLines={1}>
                  {t('compete.monthly')}
                </Text>
              </View>
              <Text style={[styles.sideNumber, { color: monthly.rank > 0 ? rankColor(monthly.rank, primaryColor) : 'rgba(255,255,255,0.35)' }]}>
                {loading ? '–' : rankOrdinal(monthly.rank)}
              </Text>
              {/* Trend indicator */}
              {!loading && monthlyDelta !== null && monthlyDelta !== 0 && (
                <View style={styles.trendRow}>
                  <Ionicons
                    name={monthlyDelta > 0 ? 'arrow-up' : 'arrow-down'}
                    size={10}
                    color={monthlyDelta > 0 ? GREEN : 'rgba(255,100,100,0.85)'}
                  />
                  <Text style={[styles.trendText, { color: monthlyDelta > 0 ? GREEN : 'rgba(255,100,100,0.85)' }]}>
                    {Math.abs(monthlyDelta)} {t('compete.places')}
                  </Text>
                </View>
              )}
              {!loading && (monthlyDelta === null || monthlyDelta === 0) && monthly.totalMembers > 0 && (
                <Text style={styles.sideSub} numberOfLines={1}>
                  {`/ ${monthly.totalMembers}`}
                </Text>
              )}
            </PlatformBlur>
          </PressableCard>

          {/* All-time rank — celebration if #1 */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.22) }]}
            onPress={() => onLeaderboardPress?.('all_time')}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
              <LinearGradient
                colors={[hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.12), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.14) }]}>
                  <Ionicons name={allTime.rank === 1 ? 'trophy' : 'medal-outline'} size={11} color={allTime.rank === 1 ? GOLD : BRONZE} />
                </View>
                <Text style={[styles.sideEyebrow, { color: hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.65) }]} numberOfLines={1}>
                  {t('compete.allTime')}
                </Text>
              </View>
              <Text style={[styles.sideNumber, { color: allTime.rank > 0 ? rankColor(allTime.rank, primaryColor) : 'rgba(255,255,255,0.35)' }]}>
                {loading ? '–' : rankOrdinal(allTime.rank)}
              </Text>
              {/* Celebration or sub-text */}
              {!loading && allTime.rank === 1 ? (
                <View style={styles.trendRow}>
                  <Ionicons name="star" size={10} color={GOLD} />
                  <Text style={[styles.trendText, { color: GOLD }]}>{t('compete.allTimeRecord')}</Text>
                </View>
              ) : !loading && allTime.totalMembers > 0 ? (
                <Text style={styles.sideSub} numberOfLines={1}>
                  {`/ ${allTime.totalMembers}`}
                </Text>
              ) : null}
            </PlatformBlur>
          </PressableCard>

        </View>
      </View>

      {/* ── Full-width: monthly drops progress ── */}
      <PressableCard
        style={[styles.monthlyProgressCard, { borderColor: hexToRgba(primaryColor, 0.22) }]}
        onPress={() => onLeaderboardPress?.('monthly')}
      >
        <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
          <LinearGradient
            colors={[hexToRgba(primaryColor, 0.12), 'rgba(10,10,20,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.wideCardRow}>
            <View style={[styles.wideIconWrap, { backgroundColor: hexToRgba(primaryColor, 0.14) }]}>
              <Ionicons name="trending-up-outline" size={18} color={primaryColor} />
            </View>
            <View style={styles.wideInfo}>
              <Text style={[styles.wideEyebrow, { color: hexToRgba(primaryColor, 0.65) }]}>{t('compete.thisMonth')}</Text>
              <Text style={[styles.wideNumber, { color: primaryColor }]}>
                {formatK(monthly.myDrops)}
                <Text style={styles.wideDenom}>{` ${t('drops')}`}</Text>
              </Text>
              <View style={{ marginTop: 6 }}>
                <AnimBar pct={monthly.leaderDrops > 0 ? (monthly.myDrops / monthly.leaderDrops) * 100 : 0} color={primaryColor} />
                <Text style={[styles.barLabel, { color: hexToRgba(primaryColor, 0.55) }]}>
                  {monthly.dropsToFirst > 0
                    ? `${formatK(monthly.dropsToFirst)} ${t('compete.toFirst')}`
                    : t('compete.leading')}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.20)" />
          </View>
        </PlatformBlur>
      </PressableCard>

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: CARD_GAP,
    marginBottom: 20,
  },

  /* Top row */
  topRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    height: HERO_H,
  },

  /* Hero card */
  heroCard: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  watermark: {
    position: 'absolute',
    right: -8,
    bottom: -4,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heroIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    ...fontStyles.heading,
    fontSize: 9,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroRankNumber: {
    ...getNumberStyle(30),
    lineHeight: 34,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroSub: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
    marginBottom: 6,
  },
  heroBarWrap: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
  },

  /* Rival mini-list */
  rivalList: {
    gap: 3,
  },
  rivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rivalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  rivalName: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    flex: 1,
  },
  rivalDelta: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 0.3,
    flexShrink: 0,
  },

  /* Side column */
  sideCol: {
    width: SIDE_W,
    gap: CARD_GAP,
  },
  sideCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  sideCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  sideIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideEyebrow: {
    ...fontStyles.heading,
    fontSize: 8,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    flex: 1,
  },
  sideNumber: {
    ...getNumberStyle(20),
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sideSub: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  trendText: {
    ...fontStyles.body,
    fontSize: 8,
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  /* Full-width monthly progress card */
  monthlyProgressCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    minHeight: 70,
  },
  wideCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  wideIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  wideInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  wideEyebrow: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  wideNumber: {
    ...getNumberStyle(18),
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  wideDenom: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
  },
  barLabel: {
    ...fontStyles.body,
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0.1,
  },

  /* Shared */
  cardBlurFill: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-start',
  },
});
