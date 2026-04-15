/**
 * ArenasStatsCards
 * Premium glass stat cards for the Arenas tab.
 *
 * Layout:
 *   Top row:
 *     Hero card (left)  — user's best rank across active arenas + drops score
 *     Side col (right)  — active arenas count + top prize
 *   Arena rows         — up to 3 arenas, each as premium glass card with sponsor logo,
 *                        rank badge, progress, days left
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { fontStyles, getNumberStyle, hexToRgba } from '@/lib/theme';
import { PressableCard } from '@/components/PressableCard';
import type { AvailableArena } from '@/hooks/useAvailableArenas';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_PAD = 16;
const HERO_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.58;
const SIDE_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.42;
const HERO_H = 162;
const SIDE_H = (HERO_H - CARD_GAP) / 2;
const CYAN = '#22D3EE';
const GREEN = '#4ade80';
const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';
const GLASS_BG = 'rgba(10, 10, 20, 0.52)';

const SCORING_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  total_drops: 'water',
  days_visited: 'calendar-outline',
  variety_score: 'barbell-outline',
  streak_days: 'flame-outline',
};

function rankColor(rank: number | null): string {
  if (rank === 1) return GOLD;
  if (rank === 2) return SILVER;
  if (rank === 3) return BRONZE;
  if (rank !== null && rank > 0 && rank <= 10) return CYAN;
  return 'rgba(255,255,255,0.55)';
}

function formatScore(n: number | null): string {
  if (n === null || n === 0) return '–';
  const safe = Number.isFinite(n) ? n : 0;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)}k`;
  if (Number.isInteger(safe)) return String(safe);
  return safe.toFixed(1).replace(/\.0$/, '');
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

// ── Props ─────────────────────────────────────────────────────────────────────
export interface ArenasStatsCardsProps {
  activeArenas: AvailableArena[];
  isUnlocked: boolean;
  onArenaPress: (arenaId: string) => void;
  onViewAllArenas: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ArenasStatsCards({
  activeArenas,
  isUnlocked,
  onArenaPress,
  onViewAllArenas,
}: ArenasStatsCardsProps) {
  const { t } = useTranslation('home');

  const joined = activeArenas.filter((a) => a.user_opted_in);
  const totalActive = activeArenas.length;

  // Best rank among joined arenas
  const bestRanked = joined
    .filter((a) => a.user_rank !== null)
    .sort((a, b) => (a.user_rank ?? 999) - (b.user_rank ?? 999))[0] ?? null;

  const bestRank = bestRanked?.user_rank ?? null;
  const bestScore = bestRanked?.user_score ?? null;
  const heroColor = CYAN;

  // Top prize: from the best arena the user is in, or the first active arena
  const prizeSource = bestRanked ?? activeArenas[0] ?? null;
  const topPrize = prizeSource?.prizes?.[0]?.prize ?? null;

  return (
    <View style={styles.wrapper}>

      {/* ── Top row: hero + side ── */}
      <View style={styles.topRow}>

        {/* Hero card — best rank */}
        <PressableCard
          style={[styles.heroCard, { borderColor: hexToRgba(heroColor, 0.30) }]}
          onPress={bestRanked ? () => onArenaPress(bestRanked.arena_id) : onViewAllArenas}
          disabled={!isUnlocked}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.52)">
            <LinearGradient
              colors={[hexToRgba(heroColor, 0.28), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Watermark */}
            <MaterialCommunityIcons name="sword-cross" size={150} color={hexToRgba(heroColor, 0.1)} style={styles.watermark} />

            {/* Eyebrow */}
            <View style={styles.heroLabelRow}>
              <View style={[styles.heroIconWrap, { backgroundColor: hexToRgba(heroColor, 0.14) }]}>
                <Ionicons name="trophy-outline" size={12} color={heroColor} />
              </View>
              <Text style={styles.heroEyebrow}>{t('arenas.bestRank')}</Text>
            </View>

            {/* Big rank */}
            <Text style={[styles.heroRankNumber, { color: heroColor }]}>
              {bestRank !== null ? `#${bestRank}` : '–'}
            </Text>

            {bestRanked ? (
              <>
                <Text style={styles.heroSub} numberOfLines={1}>{bestRanked.name}</Text>
                {bestRank === 1 ? (
                  <View style={styles.heroScoreRow}>
                    <Ionicons name="shield-checkmark" size={11} color={hexToRgba(heroColor, 0.85)} />
                    <Text style={[styles.heroScore, { color: hexToRgba(heroColor, 0.85) }]}>
                      {t('arenas.youLead')}
                    </Text>
                  </View>
                ) : bestScore !== null && bestRanked.leader_score !== null ? (
                  <View style={styles.heroScoreRow}>
                    <Ionicons name="trending-up" size={11} color={hexToRgba(heroColor, 0.7)} />
                    <Text style={[styles.heroScore, { color: hexToRgba(heroColor, 0.85) }]}>
                      {`+${formatScore(bestRanked.leader_score - bestScore)} ${t('arenas.toFirst')}`}
                    </Text>
                  </View>
                ) : bestScore !== null && bestScore > 0 ? (
                  <View style={styles.heroScoreRow}>
                    <Ionicons name="water" size={11} color={hexToRgba(heroColor, 0.7)} />
                    <Text style={[styles.heroScore, { color: hexToRgba(heroColor, 0.85) }]}>
                      {`${formatScore(bestScore)} ${t('arenas.score')}`}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.heroSub}>{t('arenas.joinToRank')}</Text>
            )}
          </PlatformBlur>
        </PressableCard>

        {/* Side column */}
        <View style={styles.sideCol}>

          {/* Active arenas count */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(GREEN, 0.22) }]}
            onPress={onViewAllArenas}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.52)">
              <LinearGradient
                colors={[hexToRgba(GREEN, 0.24), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(GREEN, 0.16) }]}>
                  <MaterialCommunityIcons name="sword-cross" size={11} color={GREEN} />
                </View>
                <Text style={[styles.sideEyebrow, { color: hexToRgba(GREEN, 0.65) }]} numberOfLines={1}>
                  {t('arenas.active')}
                </Text>
              </View>
              <Text style={[styles.sideNumber, { color: totalActive > 0 ? GREEN : 'rgba(255,255,255,0.35)' }]}>
                {String(totalActive)}
              </Text>
              <Text style={styles.sideSub} numberOfLines={1}>{t('arenas.available')}</Text>
            </PlatformBlur>
          </PressableCard>

          {/* Top prize */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(GOLD, 0.22) }]}
            onPress={bestRanked ? () => onArenaPress(bestRanked.arena_id) : onViewAllArenas}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(10,10,20,0.52)">
              <LinearGradient
                colors={[hexToRgba(GOLD, 0.24), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(GOLD, 0.16) }]}>
                  <Ionicons name="gift-outline" size={11} color={GOLD} />
                </View>
                <Text style={[styles.sideEyebrow, { color: hexToRgba(GOLD, 0.65) }]} numberOfLines={1}>
                  {t('arenas.topPrize')}
                </Text>
              </View>
              {topPrize ? (
                <>
                  <Text style={[styles.sidePrizeText, { color: GOLD }]} numberOfLines={2}>
                    {topPrize}
                  </Text>
                </>
              ) : (
                <Text style={[styles.sideNumber, { color: 'rgba(255,255,255,0.35)' }]}>–</Text>
              )}
            </PlatformBlur>
          </PressableCard>

        </View>
      </View>

      {/* ── Arena rows ── */}
      {activeArenas.length > 0 ? (
        <View style={styles.rowsWrap}>
          {activeArenas.slice(0, 3).map((arena) => {
            const isUpcoming = arena.arena_status === 'upcoming';
            const targetDate = isUpcoming ? new Date(arena.start_date) : new Date(arena.end_date);
            const daysLeft = Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
            const arenaPrimary = arena.card_color || CYAN;
            const scoringIcon = SCORING_ICONS[arena.scoring_model] ?? 'water';

            // Progress: score vs top scorer (if known via gym_score_breakdown)
            const topScore = arena.gym_score_breakdown?.[0]?.score ?? null;
            const progressPct = topScore && arena.user_score
              ? Math.min((arena.user_score / topScore) * 100, 100)
              : 0;

            return (
              <PressableCard
                key={arena.arena_id}
                style={[styles.arenaRow, { borderColor: hexToRgba(arenaPrimary, 0.22) }]}
                onPress={() => onArenaPress(arena.arena_id)}
                disabled={!isUnlocked}
              >
                <PlatformBlur intensity={40} tint="dark" style={styles.rowBlur} androidColor="rgba(10,10,20,0.52)">
                  <LinearGradient
                    colors={[hexToRgba(arenaPrimary, 0.24), 'rgba(10,10,20,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />

                  {/* Sponsor logo / icon */}
                  {arena.sponsor_logo ? (
                    <View style={styles.sponsorWrap}>
                      <Image source={arena.sponsor_logo} style={styles.sponsorImage} contentFit="contain" transition={200} />
                    </View>
                  ) : (
                    <View style={[styles.sponsorPlaceholder, { backgroundColor: hexToRgba(arenaPrimary, 0.14) }]}>
                      <MaterialCommunityIcons name="sword-cross" size={18} color={arenaPrimary} />
                    </View>
                  )}

                  {/* Info */}
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <Text style={styles.arenaName} numberOfLines={1}>{arena.name}</Text>
                      {/* Rank badge */}
                      {arena.user_opted_in ? (
                        <View style={[styles.rankBadge, { backgroundColor: hexToRgba(rankColor(arena.user_rank), 0.16) }]}>
                          <Text style={[styles.rankText, { color: rankColor(arena.user_rank) }]}>
                            {arena.user_rank ? `#${arena.user_rank}` : '–'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.rankBadge, { backgroundColor: hexToRgba(arenaPrimary, 0.12) }]}>
                          <Text style={[styles.rankText, { color: hexToRgba(arenaPrimary, 0.8) }]}>{t('joinArena')}</Text>
                        </View>
                      )}
                    </View>

                    {/* Score progress bar (only for joined arenas with score data) */}
                    {arena.user_opted_in && progressPct > 0 && (
                      <View style={styles.progressWrap}>
                        <AnimBar pct={progressPct} color={arenaPrimary} />
                      </View>
                    )}

                    <View style={styles.arenaMetaRow}>
                      <View style={styles.metaPill}>
                        <Ionicons name="people-outline" size={10} color="rgba(255,255,255,0.45)" />
                        <Text style={styles.metaText}>{arena.participant_count}</Text>
                      </View>
                      <View style={styles.metaPill}>
                        <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.45)" />
                        <Text style={styles.metaText}>
                          {isUpcoming
                            ? t('startsIn', { days: daysLeft })
                            : `${daysLeft} ${t('daysLeft')}`}
                        </Text>
                      </View>
                      <View style={styles.metaPill}>
                        <Ionicons name={scoringIcon} size={10} color={hexToRgba(arenaPrimary, 0.6)} />
                      </View>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.20)" />
                </PlatformBlur>
              </PressableCard>
            );
          })}

          {activeArenas.length > 3 && (
            <TouchableOpacity style={styles.viewAllBtn} onPress={onViewAllArenas} activeOpacity={0.7}>
              <Text style={styles.viewAllText}>{t('viewAll')}</Text>
              <Ionicons name="chevron-forward" size={13} color={hexToRgba(CYAN, 0.7)} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <PressableCard
          style={[styles.emptyState, { borderColor: hexToRgba(CYAN, 0.14) }]}
          onPress={onViewAllArenas}
        >
          <PlatformBlur intensity={40} tint="dark" style={styles.emptyBlur} androidColor="rgba(10,10,20,0.52)">
            <LinearGradient
              colors={[hexToRgba(CYAN, 0.20), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.emptyInner}>
              <View style={[styles.emptyIconWrap, { backgroundColor: hexToRgba(CYAN, 0.12) }]}>
                <MaterialCommunityIcons name="sword-cross" size={24} color={CYAN} />
              </View>
              <View style={styles.emptyTextWrap}>
                <Text style={styles.emptyTitle}>{t('noArenas')}</Text>
                <Text style={styles.emptySub}>{t('noArenasSubtitle')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={hexToRgba(CYAN, 0.45)} />
            </View>
          </PlatformBlur>
        </PressableCard>
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
  watermark: { position: 'absolute', right: -30, bottom: -20 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  heroIconWrap: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  heroEyebrow: {
    ...fontStyles.heading,
    fontSize: 11,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroRankNumber: {
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
  heroScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroScore: { ...fontStyles.body, fontSize: 11, letterSpacing: 0.2 },

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
    fontSize: 10,
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
  sidePrizeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },

  /* Arena rows */
  rowsWrap: { gap: CARD_GAP },
  arenaRow: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  rowBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  sponsorWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sponsorImage: { width: 34, height: 34, borderRadius: 6 },
  sponsorPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, gap: 5, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  arenaName: { ...fontStyles.bodySemiBold, fontSize: 13, color: '#fff', flex: 1 },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  rankText: { ...fontStyles.heading, fontSize: 11 },
  progressWrap: { marginVertical: 2 },
  arenaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { ...fontStyles.body, fontSize: 10, color: 'rgba(255,255,255,0.40)' },

  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  viewAllText: { ...fontStyles.bodySemiBold, fontSize: 13, color: hexToRgba(CYAN, 0.75) },

  /* Empty state */
  emptyState: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  emptyBlur: { flex: 1 },
  emptyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTextWrap: { flex: 1 },
  emptyTitle: { ...fontStyles.bodySemiBold, fontSize: 14, color: '#FFFFFF', marginBottom: 2 },
  emptySub: { ...fontStyles.body, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 15 },

  /* Shared */
  cardBlurFill: { flex: 1, padding: 12, justifyContent: 'flex-start' },
});
