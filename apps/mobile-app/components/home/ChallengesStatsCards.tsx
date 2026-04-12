/**
 * ChallengesStatsCards
 * Premium glass stat cards for the Challenges tab.
 *
 * Layout:
 *   Top row:
 *     Hero card (left)  — overall completion % with animated arc bar + completed/total
 *     Side col (right)  — "completed" count + "drops earned" from challenges
 *   Bottom row         — challenge row preview (1 item) + View all
 *   Footer CTA         — Trophy Room
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { fontStyles, getNumberStyle, hexToRgba } from '@/lib/theme';
import { PressableCard } from '@/components/PressableCard';
import type { ChallengeProgress } from '@/hooks/useChallengeProgress';
import type { UserBadge } from '@/hooks/useUserBadges';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_PAD = 16;
const HERO_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.58;
const SIDE_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.42;
const HERO_H = 162;
const SIDE_H = (HERO_H - CARD_GAP) / 2;
const RING_SIZE = 60;
const RING_STROKE = 5;
const ORANGE = '#FF9F4A';
const GREEN = '#4ade80';
const GLASS_BG = 'rgba(10, 10, 20, 0.52)';

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
      <Animated.View style={barStyles.fillWrap}>
        <Animated.View style={[barStyles.fillWrap, anim]}>
          <LinearGradient
            colors={[color, hexToRgba(color, 0.55)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={barStyles.fill}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
const barStyles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  fillWrap: { height: '100%', width: '100%' },
  fill: { height: '100%', borderRadius: 2 },
});

// ── Mini ring ─────────────────────────────────────────────────────────────────
function MiniRing({ pct, color }: { pct: number; color: string }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={RING_STROKE} fill="none" />
      <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke={color} strokeWidth={RING_STROKE} fill="none"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
    </Svg>
  );
}

// ── Challenge type label ──────────────────────────────────────────────────────
function useChallengeTypeLabel(t: (k: string) => string) {
  return (type: ChallengeProgress['challenge_type']) => {
    switch (type) {
      case 'daily': return t('daily');
      case 'weekly': return t('weekly');
      case 'monthly': return t('monthly');
      case 'streak': return t('streak');
      case 'milestone': return t('milestone');
      case 'checkin_streak': return t('checkinStreak');
      case 'checkin_count': return t('checkinCount');
      default: return t('challenge');
    }
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ChallengesStatsCardsProps {
  challenges: ChallengeProgress[];
  earnedBadges?: UserBadge[];
  loading: boolean;
  isUnlocked: boolean;
  gymId: string | null;
  onChallengePress: (id: string) => void;
  onViewActiveChallenges: () => void;
  onViewCompletedChallenges: () => void;
  onTrophyRoomPress: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ChallengesStatsCards({
  challenges,
  earnedBadges = [],
  loading,
  isUnlocked,
  gymId,
  onChallengePress,
  onViewActiveChallenges,
  onViewCompletedChallenges,
  onTrophyRoomPress,
}: ChallengesStatsCardsProps) {
  const { t } = useTranslation('home');
  const typeLabel = useChallengeTypeLabel(t);

  const total = challenges.length;
  const completed = challenges.filter((c) => c.is_completed).length;
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalDropsEarned = challenges
    .filter((c) => c.is_completed)
    .reduce((sum, c) => sum + c.reward_drops, 0);

  const allDone = total > 0 && completed === total;

  // Show active (in-progress) first, then completed
  const sortedChallenges = [...challenges].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    return b.progress_percentage - a.progress_percentage;
  });

  function formatK(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  return (
    <View style={styles.wrapper}>

      {/* ── Top row: hero + side ── */}
      <View style={styles.topRow}>

        {/* Hero card — overall completion */}
        <PressableCard
          style={[styles.heroCard, { borderColor: hexToRgba(allDone ? GREEN : ORANGE, 0.30) }]}
          onPress={onViewActiveChallenges}
          disabled={!isUnlocked}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
            <LinearGradient
              colors={[hexToRgba(allDone ? GREEN : ORANGE, 0.16), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Watermark */}
            <Ionicons name="flame-outline" size={96} color={hexToRgba(allDone ? GREEN : ORANGE, 0.07)} style={styles.watermark} />

            {/* Eyebrow */}
            <View style={styles.heroLabelRow}>
              <View style={[styles.heroIconWrap, { backgroundColor: hexToRgba(allDone ? GREEN : ORANGE, 0.14) }]}>
                <Ionicons name={allDone ? 'checkmark-circle' : 'flame-outline'} size={12} color={allDone ? GREEN : ORANGE} />
              </View>
              <Text style={styles.heroEyebrow}>{t('challenges.overallProgress')}</Text>
            </View>

            {/* Big number */}
            <Text style={[styles.heroNumber, { color: allDone ? GREEN : ORANGE }]}>
              {loading ? '–' : `${overallPct}%`}
            </Text>
            <Text style={styles.heroSub}>
              {loading ? '' : `${completed} / ${total} ${t('challenges.completed')}`}
            </Text>

            {/* Status line */}
            {allDone ? (
              <View style={styles.heroStatusRow}>
                <Ionicons name="star" size={11} color={GREEN} />
                <Text style={[styles.heroStatus, { color: GREEN }]}>{t('challenges.allDone')}</Text>
              </View>
            ) : total > 0 ? (
              <View style={styles.heroStatusRow}>
                <Ionicons name="time-outline" size={11} color={hexToRgba(ORANGE, 0.7)} />
                <Text style={[styles.heroStatus, { color: hexToRgba(ORANGE, 0.85) }]}>
                  {`${total - completed} ${t('challenges.remaining')}`}
                </Text>
              </View>
            ) : null}

            {/* Progress ring bottom-right */}
            {!loading && total > 0 && (
              <View style={styles.heroRingWrap} pointerEvents="none">
                <MiniRing pct={overallPct} color={allDone ? GREEN : ORANGE} />
              </View>
            )}
          </PlatformBlur>
        </PressableCard>

        {/* Side column */}
        <View style={styles.sideCol}>

          {/* Completed count */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(GREEN, 0.20) }]}
            onPress={onViewCompletedChallenges}
            disabled={!isUnlocked}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
              <LinearGradient
                colors={[hexToRgba(GREEN, 0.10), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(GREEN, 0.14) }]}>
                  <Ionicons name="checkmark-done-outline" size={11} color={GREEN} />
                </View>
                <Text style={[styles.sideEyebrow, { color: hexToRgba(GREEN, 0.65) }]} numberOfLines={1}>
                  {t('challenges.done')}
                </Text>
              </View>
              <Text style={[styles.sideNumber, { color: loading ? 'rgba(255,255,255,0.35)' : GREEN }]}>
                {loading ? '–' : String(completed)}
              </Text>
              <Text style={styles.sideSub} numberOfLines={1}>{t('challenges.ofTotal', { total })}</Text>
            </PlatformBlur>
          </PressableCard>

          {/* Drops earned from challenges */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(ORANGE, 0.20) }]}
            onPress={onViewActiveChallenges}
            disabled={!isUnlocked}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.97)">
              <LinearGradient
                colors={[hexToRgba(ORANGE, 0.10), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(ORANGE, 0.14) }]}>
                  <Ionicons name="water-outline" size={11} color={ORANGE} />
                </View>
                <Text style={[styles.sideEyebrow, { color: hexToRgba(ORANGE, 0.65) }]} numberOfLines={1}>
                  {t('challenges.earned')}
                </Text>
              </View>
              <Text style={[styles.sideNumber, { color: loading ? 'rgba(255,255,255,0.35)' : ORANGE }]}>
                {loading ? '–' : formatK(totalDropsEarned)}
              </Text>
              <Text style={styles.sideSub} numberOfLines={1}>{t('drops')}</Text>
            </PlatformBlur>
          </PressableCard>

        </View>
      </View>

      {/* ── Earned Badges Grid ── */}
      {earnedBadges.length > 0 && (
        <PressableCard
          style={[styles.badgesCard, { borderColor: hexToRgba(ORANGE, 0.22) }]}
          onPress={onTrophyRoomPress}
          disabled={!isUnlocked}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.badgesBlur} androidColor="rgba(10,10,20,0.97)">
            <LinearGradient
              colors={[hexToRgba(ORANGE, 0.12), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.badgesHeader}>
              <View style={[styles.badgesIconWrap, { backgroundColor: hexToRgba(ORANGE, 0.14) }]}>
                <Ionicons name="trophy-outline" size={12} color={ORANGE} />
              </View>
              <Text style={[styles.badgesEyebrow, { color: hexToRgba(ORANGE, 0.75) }]}>
                {t('earnedBadges', { count: earnedBadges.length })}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={hexToRgba(ORANGE, 0.45)} />
            </View>
            <View style={styles.badgesGrid}>
              {earnedBadges.slice(0, 6).map((badge, i) => (
                <View key={badge.badge_id} style={styles.badgeCell}>
                  {badge.badge_image_url ? (
                    <Image
                      source={badge.badge_image_url}
                      style={styles.badgeImage}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={[styles.badgePlaceholder, { backgroundColor: hexToRgba(ORANGE, 0.10) }]}>
                      <Ionicons name="ribbon-outline" size={16} color={hexToRgba(ORANGE, 0.6)} />
                    </View>
                  )}
                </View>
              ))}
              {earnedBadges.length > 6 && (
                <View style={[styles.badgeCell, styles.badgeOverflow, { backgroundColor: hexToRgba(ORANGE, 0.10) }]}>
                  <Text style={[styles.badgeOverflowText, { color: ORANGE }]}>+{earnedBadges.length - 6}</Text>
                </View>
              )}
            </View>
          </PlatformBlur>
        </PressableCard>
      )}

      {/* ── Active Challenges header ── */}
      {!loading && sortedChallenges.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('activeChallenges').toUpperCase()}</Text>
        </View>
      )}

      {/* ── Challenge rows ── */}
      {loading ? (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow} />
          ))}
        </View>
      ) : challenges.length > 0 ? (
        <View style={styles.rowsWrap}>
          {sortedChallenges.slice(0, 1).map((ch) => {
            const pct = Math.max(0, Math.min(100, ch.progress_percentage || 0));
            const rowColor = ch.is_completed ? GREEN : ORANGE;
            return (
              <PressableCard
                key={ch.challenge_id}
                style={[styles.challengeRow, { borderColor: hexToRgba(rowColor, 0.20) }]}
                onPress={() => { if (isUnlocked && gymId) onChallengePress(ch.challenge_id); }}
                disabled={!isUnlocked}
              >
                <PlatformBlur intensity={40} tint="dark" style={styles.rowBlur} androidColor="rgba(10,10,20,0.95)">
                  <LinearGradient
                    colors={[hexToRgba(rowColor, 0.10), 'rgba(10,10,20,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {/* Icon */}
                  <View style={[styles.rowIconWrap, { backgroundColor: hexToRgba(rowColor, 0.14) }]}>
                    {ch.badge_image_url ? (
                      <Image source={ch.badge_image_url} style={styles.rowIconImage} contentFit="cover" transition={150} />
                    ) : (
                      <Ionicons name={ch.is_completed ? 'checkmark-circle' : 'flame-outline'} size={16} color={rowColor} />
                    )}
                  </View>
                  {/* Body */}
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{ch.challenge_name}</Text>
                      <Text style={[styles.rowPct, { color: rowColor }]}>{Math.round(pct)}%</Text>
                    </View>
                    <AnimBar pct={pct} color={rowColor} />
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {typeLabel(ch.challenge_type)} · {ch.reward_drops} {t('drops')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.20)" />
                </PlatformBlur>
              </PressableCard>
            );
          })}

          {/* View all link if there are more challenges */}
          {sortedChallenges.length > 1 && (
            <TouchableOpacity style={styles.viewAllBtn} onPress={onViewActiveChallenges} activeOpacity={0.7} disabled={!isUnlocked}>
              <Text style={styles.viewAllText}>{t('viewAllChallenges')}</Text>
              <Ionicons name="chevron-forward" size={13} color={hexToRgba(ORANGE, 0.7)} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[styles.emptyState, { borderColor: hexToRgba(ORANGE, 0.12) }]}>
          <Ionicons name="trophy-outline" size={22} color={hexToRgba(ORANGE, 0.4)} />
          <Text style={styles.emptyText}>{t('noChallenges')}</Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: CARD_GAP, marginBottom: 20 },

  /* Top row */
  topRow: { flexDirection: 'row', gap: CARD_GAP, height: HERO_H },

  /* Hero card */
  heroCard: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  watermark: { position: 'absolute', right: -8, bottom: -4 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroIconWrap: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: {
    ...fontStyles.heading,
    fontSize: 9,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroNumber: {
    ...getNumberStyle(34),
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroSub: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 2,
    marginBottom: 6,
  },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroStatus: { ...fontStyles.body, fontSize: 11, letterSpacing: 0.2 },
  heroRingWrap: { position: 'absolute', bottom: 12, right: 12 },

  /* Side column */
  sideCol: { width: SIDE_W, gap: CARD_GAP },
  sideCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  sideCardInner: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  sideIconWrap: { width: 18, height: 18, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
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
  sideSub: { ...fontStyles.body, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 },

  /* Challenge rows */
  skeletonWrap: { gap: CARD_GAP },
  skeletonRow: {
    height: 72,
    borderRadius: 16,
    backgroundColor: hexToRgba(ORANGE, 0.06),
    borderWidth: 1,
    borderColor: hexToRgba(ORANGE, 0.10),
  },
  rowsWrap: { gap: CARD_GAP },
  challengeRow: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  rowBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  rowIconImage: { width: '100%', height: '100%' },
  rowBody: { flex: 1, gap: 5, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { ...fontStyles.bodySemiBold, fontSize: 13, color: '#fff', flex: 1 },
  rowPct: { ...fontStyles.heading, fontSize: 12 },
  rowMeta: { ...fontStyles.body, fontSize: 10, color: 'rgba(255,255,255,0.38)', letterSpacing: 0.2 },

  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  viewAllText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: hexToRgba(ORANGE, 0.75),
  },

  /* Empty state */
  emptyState: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(14,14,24,0.6)',
    borderWidth: 1,
  },
  emptyText: { ...fontStyles.body, fontSize: 13, color: 'rgba(255,255,255,0.4)', flex: 1 },

  /* Earned badges grid card */
  badgesCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  badgesBlur: { flex: 1, padding: 12 },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  badgesIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgesEyebrow: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flex: 1,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeCell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: 'hidden',
  },
  badgeImage: {
    width: '100%',
    height: '100%',
  },
  badgePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOverflow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOverflowText: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  /* Section header above challenge rows */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.4,
  },

  /* Shared blur fill */
  cardBlurFill: { flex: 1, padding: 12, justifyContent: 'flex-start' },
});
