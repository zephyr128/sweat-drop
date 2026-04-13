/**
 * CompeteStatsCards
 * Premium glass stat cards for the Compete tab.
 *
 * Layout:
 *   1. Weekly hero card (full width): rank, rival list with gaps-to-first,
 *      inline weekly reward pills, footer with user's prize
 *   2. Monthly + All-time side-by-side row
 *   3. Monthly progress card: drops progress + reward pills
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
import type { LeaderboardReward } from '@/hooks/useLeaderboardRewards';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_PAD = 16;
const HERO_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.58;
const SIDE_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.42;
const HERO_H = 174;
const SIDE_H = (HERO_H - CARD_GAP) / 2;
const PROGRESS_H_WITH_REWARDS = 140;
const PROGRESS_H_NO_REWARDS = 122;

const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';
const GREEN = '#4ade80';
const PURPLE = '#9B59B6';
const GLASS_BG = 'rgba(10, 10, 20, 0.52)';
const MEDAL_COLORS = [GOLD, SILVER, BRONZE] as const;

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
  const safe = Number.isFinite(n) ? n : 0;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)}k`;
  if (Number.isInteger(safe)) return String(safe);
  return safe.toFixed(1).replace(/\.0$/, '');
}

function rewardForRank(
  rank: number,
  rewards: LeaderboardReward[],
): LeaderboardReward | undefined {
  return rewards.find((r) => r.rank_position === rank);
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

// ── Reward pills row ──────────────────────────────────────────────────────────
function RewardPills({
  rewards,
  userRank,
}: {
  rewards: LeaderboardReward[];
  userRank: number;
}) {
  if (!rewards.length) return null;
  return (
    <View style={pillStyles.row}>
      {rewards.slice(0, 3).map((r, i) => {
        const color = MEDAL_COLORS[i] ?? GOLD;
        const isYours = userRank > 0 && r.rank_position === userRank;
        return (
          <View
            key={r.id}
            style={[
              pillStyles.pill,
              {
                borderColor: hexToRgba(color, isYours ? 0.75 : 0.25),
                backgroundColor: hexToRgba(color, isYours ? 0.16 : 0.06),
              },
            ]}
          >
            <Ionicons
              name="gift-outline"
              size={8}
              color={isYours ? color : hexToRgba(color, 0.55)}
            />
            <Text
              style={[
                pillStyles.pillRank,
                { color: isYours ? color : hexToRgba(color, 0.65) },
              ]}
            >
              #{r.rank_position}
            </Text>
            <Text
              style={[
                pillStyles.pillName,
                { color: isYours ? color : 'rgba(255,255,255,0.50)' },
              ]}
              numberOfLines={1}
            >
              {r.reward_name}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
const pillStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 4,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
    flex: 1,
    minWidth: 0,
  },
  pillRank: {
    ...fontStyles.heading,
    fontSize: 8,
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  pillName: {
    ...fontStyles.body,
    fontSize: 8,
    flexShrink: 1,
  },
});

// ── Props ────────────────────────────────────────────────────────────────────
export interface CompeteStatsCardsProps {
  weekly: PeriodRankInfo;
  monthly: PeriodRankInfo;
  allTime: PeriodRankInfo;
  primaryColor: string;
  loading?: boolean;
  weeklyRewards?: LeaderboardReward[];
  monthlyRewards?: LeaderboardReward[];
  onLeaderboardPress?: (period: LeaderboardPeriod) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CompeteStatsCards({
  weekly,
  monthly,
  allTime,
  primaryColor,
  loading = false,
  weeklyRewards = [],
  monthlyRewards = [],
  onLeaderboardPress,
}: CompeteStatsCardsProps) {
  const { t } = useTranslation('home');

  const heroColor = rankColor(weekly.rank, primaryColor);
  const weeklyProgressPct =
    weekly.leaderDrops > 0
      ? Math.min((weekly.myDrops / weekly.leaderDrops) * 100, 100)
      : 0;

  // Positive means improvement (lower rank number is better): #4 -> #2 = +2 places
  const monthlyDelta =
    monthly.rank > 0 && weekly.rank > 0 ? monthly.rank - weekly.rank : null;

  const userWeeklyReward = rewardForRank(weekly.rank, weeklyRewards);
  const userMonthlyReward = rewardForRank(monthly.rank, monthlyRewards);
  const progressCardHeight = monthlyRewards.length > 0 ? PROGRESS_H_WITH_REWARDS : PROGRESS_H_NO_REWARDS;

  return (
    <View style={styles.wrapper}>

      {/* ══ Top row: one large + two small ═════════════════════════════════ */}
      <View style={styles.topRow}>
        <PressableCard
          style={[styles.weeklyCard, { borderColor: hexToRgba(heroColor, 0.30) }]}
          onPress={() => onLeaderboardPress?.('weekly')}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.cardBlur} androidColor="rgba(38,32,58,0.97)">
          <LinearGradient
            colors={[hexToRgba(heroColor, 0.16), 'rgba(10,10,20,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons
            name="podium-outline"
            size={150}
            color={hexToRgba(heroColor, 0.1)}
            style={styles.watermark}
          />

          {/* Header row */}
          <View style={styles.rowBetween}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.iconWrap18, { backgroundColor: hexToRgba(heroColor, 0.14) }]}>
                <Ionicons name="trophy-outline" size={10} color={heroColor} />
              </View>
              <Text style={styles.eyebrow}>{t('compete.weekly')}</Text>
            </View>
            <Text style={[styles.memberCount, { color: hexToRgba(heroColor, 0.45) }]}>
              {weekly.totalMembers > 0 ? t('compete.outOf', { total: weekly.totalMembers }) : ''}
            </Text>
          </View>

          {/* Rank number */}
          <View style={styles.rankBlock}>
            <Text style={[styles.rankNumber, { color: heroColor }]}>
              {loading ? '–' : rankOrdinal(weekly.rank)}
            </Text>
          </View>

          {/* Rival mini-list with gaps */}
          {!loading && weekly.neighbors.length > 0 && (
            <View style={styles.rivalList}>
              {weekly.neighbors.map((n, i) => {
                const dotColor = n.isMe
                  ? heroColor
                  : i === 0
                  ? SILVER
                  : 'rgba(255,255,255,0.28)';
                const myGapToFirst = n.isMe && n.rank !== 1
                  ? Math.max(0, weekly.leaderDrops - n.drops)
                  : 0;
                return (
                  <View key={i} style={styles.rivalRow}>
                    <View style={[styles.rivalDot, { backgroundColor: dotColor }]} />
                    <Text
                      style={[
                        styles.rivalName,
                        n.isMe && { color: heroColor, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {n.isMe ? `${t('compete.you')} (${rankOrdinal(n.rank)})` : `${rankOrdinal(n.rank)} ${n.username}`}
                    </Text>
                    <Text style={styles.rivalDrops} numberOfLines={1}>
                      {formatK(n.drops)}
                      {myGapToFirst > 0 && (
                        <Text style={styles.rivalGap}>{` · +${formatK(myGapToFirst)} ${t('compete.toFirst')}`}</Text>
                      )}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Footer: prize CTA */}
          <View style={[styles.cardFooter, { borderTopColor: hexToRgba(heroColor, 0.12) }]}>
            <Ionicons name="gift-outline" size={12} color={hexToRgba(GOLD, 0.70)} />
            {userWeeklyReward ? (
              <Text style={[styles.footerText, { color: GOLD }]} numberOfLines={1}>
                {t('prizes.yourPrize', { defaultValue: 'Your prize:' })}{' '}
                <Text style={styles.footerTextBold}>{userWeeklyReward.reward_name}</Text>
              </Text>
            ) : (
              <Text style={[styles.footerText, { color: 'rgba(255,255,255,0.40)' }]}>
                {t('prizes.topThreeForPrize', { defaultValue: 'Top 3 wins a prize' })}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.25)" style={{ marginLeft: 'auto' as any }} />
          </View>
          </PlatformBlur>
        </PressableCard>

        {/* Right side: monthly + all-time stacked */}
        <View style={styles.sideCol}>
          {/* Monthly */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(GOLD, 0.22) }]}
            onPress={() => onLeaderboardPress?.('monthly')}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlur} androidColor="rgba(38,32,58,0.97)">
            <LinearGradient
              colors={[hexToRgba(GOLD, 0.12), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.eyebrowRow}>
              <View style={[styles.iconWrap18, { backgroundColor: hexToRgba(GOLD, 0.14) }]}>
                <Ionicons name="calendar-outline" size={10} color={GOLD} />
              </View>
              <Text style={[styles.eyebrow, { color: hexToRgba(GOLD, 0.65) }]}>{t('compete.monthly')}</Text>
            </View>
            <View style={styles.sideRankRow}>
              <Text
                style={[
                  styles.sideNumber,
                  { color: monthly.rank > 0 ? rankColor(monthly.rank, primaryColor) : 'rgba(255,255,255,0.35)' },
                ]}
              >
                {loading ? '–' : rankOrdinal(monthly.rank)}
              </Text>
              {!loading && monthly.totalMembers > 0 && (
                <Text style={styles.sideSub}>{`/ ${monthly.totalMembers}`}</Text>
              )}
            </View>
            {/* Trend delta */}
            {!loading && monthlyDelta !== null && monthlyDelta !== 0 && (
              <View style={styles.trendRow}>
                <Ionicons
                  name={monthlyDelta > 0 ? 'arrow-up' : 'arrow-down'}
                  size={9}
                  color={monthlyDelta > 0 ? GREEN : 'rgba(255,100,100,0.85)'}
                />
                <Text
                  style={[
                    styles.trendText,
                    { color: monthlyDelta > 0 ? GREEN : 'rgba(255,100,100,0.85)' },
                  ]}
                >
                  {Math.abs(monthlyDelta)} {t('compete.places')}
                </Text>
              </View>
            )}
            {/* Reward for user's monthly rank */}
            {!loading && userMonthlyReward ? (
              <View style={styles.sideRewardRow}>
                <Ionicons name="gift-outline" size={9} color={hexToRgba(GOLD, 0.70)} />
                <Text style={[styles.sideRewardText, { color: GOLD }]} numberOfLines={1}>
                  {userMonthlyReward.reward_name}
                </Text>
              </View>
            ) : null}
            </PlatformBlur>
          </PressableCard>

          {/* All-time */}
          <PressableCard
            style={[
              styles.sideCard,
              { borderColor: hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.24) },
            ]}
            onPress={() => onLeaderboardPress?.('all_time')}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlur} androidColor="rgba(38,32,58,0.97)">
            <LinearGradient
              colors={[hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.14), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.eyebrowRow}>
              <View
                style={[
                  styles.iconWrap18,
                  { backgroundColor: hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.14) },
                ]}
              >
                <Ionicons
                  name={allTime.rank === 1 ? 'trophy' : 'medal-outline'}
                  size={10}
                  color={allTime.rank === 1 ? GOLD : BRONZE}
                />
              </View>
              <Text
                style={[
                  styles.eyebrow,
                  { color: hexToRgba(allTime.rank === 1 ? GOLD : BRONZE, 0.65) },
                ]}
              >
                {t('compete.allTime')}
              </Text>
            </View>
            <View style={styles.sideRankRow}>
              <Text
                style={[
                  styles.sideNumber,
                  {
                    color:
                      allTime.rank > 0
                        ? rankColor(allTime.rank, primaryColor)
                        : 'rgba(255,255,255,0.35)',
                  },
                ]}
              >
                {loading ? '–' : rankOrdinal(allTime.rank)}
              </Text>
              {!loading && allTime.totalMembers > 0 && (
                <Text style={styles.sideSub}>{`/ ${allTime.totalMembers}`}</Text>
              )}
            </View>
            {/* All-time #1: star celebration; otherwise sub-text */}
            {!loading && allTime.rank === 1 ? (
              <View style={styles.trendRow}>
                <Ionicons name="star" size={9} color={GOLD} />
                <Text style={[styles.trendText, { color: GOLD }]}>
                  {t('compete.allTimeRecord')}
                </Text>
              </View>
            ) : null}
            </PlatformBlur>
          </PressableCard>
        </View>
      </View>

      <PressableCard
        style={[styles.progressCard, { borderColor: hexToRgba(PURPLE, 0.26), height: progressCardHeight }]}
        onPress={() => onLeaderboardPress?.('monthly')}
      >
        <PlatformBlur intensity={50} tint="dark" style={styles.cardBlur} androidColor="rgba(38,32,58,0.97)">
          <LinearGradient
            colors={[hexToRgba(PURPLE, 0.14), 'rgba(10,10,20,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Header */}
          <View style={styles.eyebrowRow}>
            <View style={[styles.iconWrap18, { backgroundColor: hexToRgba(PURPLE, 0.18) }]}>
              <Ionicons name="trending-up-outline" size={10} color={PURPLE} />
            </View>
            <Text style={[styles.eyebrow, { color: hexToRgba(PURPLE, 0.80) }]}>
              {t('compete.monthlyProgress', { defaultValue: 'THIS MONTH · PROGRESS TO #1' })}
            </Text>
          </View>

          {/* Big number: my drops / leader drops */}
          <View style={styles.progressNumberRow}>
            <Text style={[styles.progressBig, { color: PURPLE }]}>
              {formatK(monthly.myDrops)}
            </Text>
            <Text style={styles.progressDenom}>
              {' / '}{formatK(monthly.leaderDrops)}{' '}
              <Text style={styles.progressLabel}>
                {t('drops', { defaultValue: 'drops' })}
              </Text>
            </Text>
          </View>

          {/* Bar */}
          <View style={{ marginTop: 6 }}>
            <AnimBar
              pct={monthly.leaderDrops > 0 ? (monthly.myDrops / monthly.leaderDrops) * 100 : 0}
              color={PURPLE}
            />
          </View>

          {/* Under-bar: gap to #1 */}
          <View style={styles.progressSubRow}>
            {monthly.dropsToFirst > 0 ? (
              <Text style={[styles.progressSub, { color: hexToRgba(PURPLE, 0.70) }]}>
                {`${formatK(monthly.dropsToFirst)} `}
                <Text style={{ color: 'rgba(255,255,255,0.40)' }}>
                  {t('compete.toFirst')}
                </Text>
              </Text>
            ) : (
              <Text style={[styles.progressSub, { color: GOLD }]}>
                {t('compete.leading')}
              </Text>
            )}
          </View>

          {/* Reward pills */}
          {monthlyRewards.length > 0 && (
            <RewardPills rewards={monthlyRewards} userRank={monthly.rank} />
          )}
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

  /* Top layout: one large + two small */
  topRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    height: HERO_H,
  },
  weeklyCard: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  watermark: {
    position: 'absolute',
    right: -30,
    bottom: -20,
    opacity: 1,
  },

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
  sideNumber: {
    ...getNumberStyle(22),
    lineHeight: 26,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sideRankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  sideSub: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
  },
  sideRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  sideRewardText: {
    ...fontStyles.body,
    fontSize: 9,
    flex: 1,
  },

  progressCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  progressNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 4,
  },
  progressBig: {
    ...getNumberStyle(26),
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  progressDenom: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  progressLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  progressSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 4,
    gap: 6,
  },
  progressSub: {
    ...fontStyles.body,
    fontSize: 11,
    flexShrink: 1,
  },

  /* Shared — flex:1 fills fixed-height parents (weekly / side cards) */
  cardBlur: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-start',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  eyebrow: {
    ...fontStyles.heading,
    fontSize: 8,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  memberCount: {
    ...fontStyles.body,
    fontSize: 9,
  },
  iconWrap18: {
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Rank block */
  rankBlock: {
    marginBottom: 6,
    minHeight: 38,
    justifyContent: 'center',
  },
  rankNumber: {
    ...getNumberStyle(32),
    lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  /* Rival list */
  rivalList: {
    gap: 4,
    marginBottom: 6,
  },
  rivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rivalDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    flexShrink: 0,
  },
  rivalName: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    flex: 1,
  },
  rivalDrops: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
  },
  rivalGap: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.30)',
  },

  /* Bar */
  barWrap: {
    marginBottom: 0,
    marginTop: 2,
  },

  /* Card footer */
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    ...fontStyles.body,
    fontSize: 11,
    flex: 1,
  },
  footerTextBold: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
  },

  /* Trend */
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
});
