import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { fontStyles, getNumberStyle, hexToRgba } from '@/lib/theme';
import { PressableCard } from '@/components/PressableCard';
import { LiquidFill } from '@/components/home/LiquidFill';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = 10;
const CARD_PAD = 16;
const HERO_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.58;
const SIDE_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) * 0.42;
const HERO_H = 162;
const SIDE_H = (HERO_H - CARD_GAP) / 2;
const ACTION_W = (SCREEN_W - CARD_PAD * 2 - CARD_GAP) / 2;


function getStreakColor(streak: number, primary: string): string {
  if (streak >= 60) return '#FFD700';
  if (streak >= 30) return primary;
  if (streak >= 14) return '#FF3B30';
  if (streak >= 7) return '#FFD700';
  return '#FF6B00';
}

function getStreakIcon(streak: number): React.ComponentProps<typeof Ionicons>['name'] {
  if (streak >= 60) return 'trophy';
  if (streak >= 30) return 'flash';
  if (streak >= 14) return 'flame';
  if (streak >= 7) return 'star';
  return 'flame-outline';
}

function getStreakLabel(streak: number, t: (key: string) => string): string {
  if (streak >= 60) return t('rings.streak_legend');
  if (streak >= 30) return t('rings.streak_unstoppable');
  if (streak >= 14) return t('rings.streak_fire');
  if (streak >= 7) return t('rings.streak_week');
  return t('rings.streak');
}

export interface HappyHourSlot {
  label: string;
  time: string;
  endTime: string;
  endAt: string; // ISO string for countdown
  startAt?: string; // ISO string — used to compute total duration
  multiplier: number;
  inMinutes: number;
  isToday: boolean;
}

export interface StatsCardsProps {
  streakDays: number;
  todayDrops: number;
  todayBonusDrops?: number;
  dailyCap: number;
  weeklyDrops: number;
  weeklyCap: number;
  primaryColor: string;
  isCheckedIn: boolean;
  gymName: string;
  onCheckinPress: () => void;
  nextRewardName: string | null;
  nextRewardImageUrl?: string | null;
  nextRewardPriceDrops?: number;
  localDropsBalance?: number;
  dropsToNextReward: number;
  onRewardPress: () => void;
  nextHappyHour: HappyHourSlot | null;
  isHappyHourActive: boolean;
  onHappyHourPress: () => void;
  onStreakPress: () => void;
  onTodayPress: () => void;
  onWeeklyPress: () => void;
}

const GREEN = '#4CD964';
const GOLD = '#FFD700';
const WATER_BLUE = '#00E5FF';

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}


// ── Next Reward Card ─────────────────────────────────────────────────────────
const THUMB = 52;

interface NextRewardCardProps {
  eyebrow: string;
  title: string;
  imageUrl?: string | null;
  progressPercent: number;
  progressLabel: string;
  primary: string;
  onPress?: () => void;
}

function NextRewardCard({ eyebrow, title, imageUrl, progressPercent, progressLabel, primary, onPress }: NextRewardCardProps) {
  const barAnim = useAnimatedStyle(() => ({
    width: withTiming(`${Math.min(progressPercent, 100)}%` as any, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    }),
  }));
  return (
    <PressableCard style={[styles.rewardCard, { borderColor: hexToRgba(primary, 0.22) }]} onPress={onPress}>
      <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(38,32,58,0.97)">
        <LinearGradient
          colors={[hexToRgba(primary, 0.12), 'rgba(10,10,20,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.rewardInner}>
          {/* Thumbnail */}
          <View style={[styles.rewardThumb, { borderColor: hexToRgba(primary, 0.28) }]}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.rewardThumbImage} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.rewardThumbPlaceholder, { backgroundColor: hexToRgba(primary, 0.14) }]}>
                <Ionicons name="gift-outline" size={22} color={hexToRgba(primary, 0.75)} />
              </View>
            )}
          </View>
          {/* Info */}
          <View style={styles.rewardInfo}>
            <Text style={styles.rewardEyebrow}>{eyebrow.toUpperCase()}</Text>
            <Text style={styles.rewardTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.rewardBarTrack}>
              <View style={[styles.rewardBarBg, { backgroundColor: hexToRgba(primary, 0.12) }]}>
                <Animated.View style={[styles.rewardBarFillWrap, barAnim]}>
                  <LinearGradient
                    colors={[primary, hexToRgba(primary, 0.55)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.rewardBarFill}
                  />
                </Animated.View>
              </View>
              <Text style={[styles.rewardProgressLabel, { color: hexToRgba(primary, 0.70) }]} numberOfLines={1}>
                {progressLabel}
              </Text>
            </View>
          </View>
          {/* Chevron */}
          <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.22)" />
        </View>
      </PlatformBlur>
    </PressableCard>
  );
}

export const StatsCards: React.FC<StatsCardsProps> = React.memo(function StatsCards({
  streakDays,
  todayDrops,
  todayBonusDrops = 0,
  dailyCap,
  weeklyDrops,
  weeklyCap,
  primaryColor,
  isCheckedIn,
  gymName,
  onCheckinPress,
  nextRewardName,
  nextRewardImageUrl,
  nextRewardPriceDrops = 0,
  localDropsBalance = 0,
  dropsToNextReward,
  onRewardPress,
  nextHappyHour,
  isHappyHourActive,
  onHappyHourPress,
  onStreakPress,
  onTodayPress,
  onWeeklyPress,
}) {
  const { t } = useTranslation('home');

  const streakColor = getStreakColor(streakDays, primaryColor);
  const streakIcon = getStreakIcon(streakDays);
  const streakLabel = getStreakLabel(streakDays, t);
  const capReached = dailyCap > 0 && todayDrops >= dailyCap;
  const overCap = dailyCap > 0 && todayDrops > dailyCap && todayBonusDrops > 0;
  const checkinColor = isCheckedIn ? GREEN : 'rgba(255,255,255,0.55)';
  const hhColor = isHappyHourActive ? GOLD : nextHappyHour ? GOLD : 'rgba(255,255,255,0.25)';

  const dailyPct = dailyCap > 0 ? Math.min((todayDrops / dailyCap) * 100, 100) : 0;

  // Glow pulse for active Happy Hour card
  const hhGlowOpacity = useSharedValue(0);
  useEffect(() => {
    if (isHappyHourActive) {
      hhGlowOpacity.value = 0;
      hhGlowOpacity.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      hhGlowOpacity.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.ease) });
    }
  }, [isHappyHourActive, hhGlowOpacity]);

  const hhGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + hhGlowOpacity.value * 0.18,
  }));

  // Countdown state for the "ends in" progress bar
  const [hhSecondsLeft, setHhSecondsLeft] = useState<number | null>(null);
  const [hhTotalSeconds, setHhTotalSeconds] = useState<number | null>(null);
  const hhCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hhProgressPct = useSharedValue(100);

  useEffect(() => {
    if (hhCountdownRef.current) clearInterval(hhCountdownRef.current);
    if (!isHappyHourActive || !nextHappyHour?.endAt) {
      setHhSecondsLeft(null);
      setHhTotalSeconds(null);
      hhProgressPct.value = 100;
      return;
    }
    const endMs = new Date(nextHappyHour.endAt).getTime();
    const startMs = nextHappyHour.startAt ? new Date(nextHappyHour.startAt).getTime() : null;
    const totalSec = startMs ? Math.max(0, Math.round((endMs - startMs) / 1000)) : null;
    setHhTotalSeconds(totalSec);
    const tick = () => {
      const left = Math.max(0, Math.round((endMs - Date.now()) / 1000));
      setHhSecondsLeft(left);
      if (totalSec && totalSec > 0) {
        hhProgressPct.value = withTiming(
          Math.max(0, Math.min(100, (left / totalSec) * 100)),
          { duration: 950, easing: Easing.out(Easing.linear) },
        );
      }
    };
    tick();
    hhCountdownRef.current = setInterval(tick, 1000);
    return () => {
      if (hhCountdownRef.current) clearInterval(hhCountdownRef.current);
    };
  }, [isHappyHourActive, nextHappyHour?.endAt, nextHappyHour?.startAt, hhProgressPct]);

  const hhProgressBarStyle = useAnimatedStyle(() => ({
    width: `${hhProgressPct.value}%` as any,
  }));

  return (
    <View style={styles.wrapper}>

      {/* ── Row 1: Hero + Side cards ─────────────────────────────────────── */}
      <View style={styles.topRow}>

        {/* Hero card — daily goal with liquid wave fill */}
        <PressableCard
          style={[styles.heroCard, { borderColor: hexToRgba(WATER_BLUE, 0.28) }]}
          onPress={onTodayPress}
        >
          <View style={styles.liquidHeroInner}>
            <LiquidFill
              width={HERO_W}
              height={HERO_H}
              fillPercent={dailyPct / 100}
              color={capReached ? 'rgba(74, 222, 128, 0.35)' : 'rgba(0, 229, 255, 0.28)'}
              colorEnd={capReached ? 'rgba(22, 163, 74, 0.50)' : 'rgba(0, 184, 204, 0.45)'}
              borderRadius={18}
            />
            <Ionicons
              name={capReached ? 'checkmark-circle-outline' : 'water-outline'}
              size={150}
              color={capReached ? 'rgba(74,222,128,0.06)' : 'rgba(0,229,255,0.06)'}
              style={styles.watermark}
            />
            <View style={styles.cardBlurFill} pointerEvents="box-none">
              <View style={styles.heroLabelRow}>
                <View style={[styles.heroIconWrap, { backgroundColor: capReached ? 'rgba(74,222,128,0.18)' : 'rgba(0,229,255,0.18)' }]}>
                  <Ionicons
                    name={capReached ? 'checkmark-circle' : 'water-outline'}
                    size={13}
                    color={capReached ? GREEN : WATER_BLUE}
                  />
                </View>
                <Text style={styles.heroEyebrow}>{t('cards.dailyGoal')}</Text>
              </View>

              <Text style={[styles.heroNumber, { color: capReached ? GREEN : '#fff' }]}>
                {dailyCap > 0 ? `${todayDrops}/${dailyCap}` : `${todayDrops}`}
              </Text>

              {overCap && (
                <View style={styles.bonusRow}>
                  <Ionicons name="flash" size={10} color={GREEN} />
                  <Text style={[styles.bonusLabel, { color: GREEN }]}>+{todayBonusDrops}</Text>
                </View>
              )}

              <Text style={styles.heroSub}>{t('cards.kcalToday')}</Text>
            </View>
          </View>
        </PressableCard>

        {/* Side column */}
        <View style={styles.sideCol}>

          {/* Streak */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(streakColor, 0.22) }]}
            onPress={onStreakPress}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(38,32,58,0.97)">
              <LinearGradient
                colors={[hexToRgba(streakColor, 0.10), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(streakColor, 0.14) }]}>
                  <Ionicons name={streakIcon} size={13} color={streakColor} />
                </View>
                <Text style={styles.sideEyebrow} numberOfLines={1}>{t('statsStreak')}</Text>
              </View>
              <Text style={[styles.sideNumber, { color: streakColor }]}>{streakDays}{' '}
                <Text style={styles.sideUnit}>{t('unitDays')}</Text>
              </Text>
              <Text style={styles.sideSub} numberOfLines={1}>{t('cards.activeDays')}</Text>
            </PlatformBlur>
          </PressableCard>

          {/* Weekly progress */}
          <PressableCard
            style={[styles.sideCard, { borderColor: hexToRgba(primaryColor, 0.22) }]}
            onPress={onWeeklyPress}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(38,32,58,0.97)">
              <LinearGradient
                colors={[hexToRgba(primaryColor, 0.10), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.sideCardInner}>
                <View style={[styles.sideIconWrap, { backgroundColor: hexToRgba(primaryColor, 0.14) }]}>
                  <Ionicons name="calendar-outline" size={13} color={primaryColor} />
                </View>
                <Text style={styles.sideEyebrow} numberOfLines={1}>{t('cards.weeklyProgress')}</Text>
              </View>
              <Text style={[styles.sideNumber, { color: primaryColor }]}>
                {weeklyCap > 0
                  ? `${formatCompact(weeklyDrops)}/${formatCompact(weeklyCap)}`
                  : formatCompact(weeklyDrops)}
                {weeklyCap > 0 && (
                  <Ionicons name="water" size={12} color={hexToRgba(primaryColor, 0.85)} />
                )}
              </Text>
            </PlatformBlur>
          </PressableCard>

        </View>
      </View>

      {/* ── Row 2: Action cards ───────────────────────────────────────────── */}
      <View style={styles.actionsRow}>

        {/* Check-in */}
        <PressableCard
          style={[styles.actionCard, { borderColor: hexToRgba(checkinColor, 0.18) }]}
          onPress={isCheckedIn ? undefined : onCheckinPress}
          disabled={isCheckedIn}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.cardBlurFill} androidColor="rgba(38,32,58,0.97)">
            <LinearGradient
              colors={[hexToRgba(isCheckedIn ? GREEN : 'rgba(255,255,255,1)', 0.06), 'rgba(10,10,20,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.actionInner}>
              <View style={[styles.actionIconWrap, { backgroundColor: hexToRgba(checkinColor, 0.12) }]}>
                <Ionicons
                  name={isCheckedIn ? 'checkmark-circle' : 'qr-code-outline'}
                  size={20}
                  color={isCheckedIn ? GREEN : 'rgba(255,255,255,0.72)'}
                />
              </View>
              <View style={styles.actionInfo}>
                <Text style={[styles.actionTitle, isCheckedIn && { color: GREEN }]} numberOfLines={1}>
                  {isCheckedIn ? t('cards.checkedIn') : t('cards.checkIn')}
                </Text>
                <Text style={styles.actionSub} numberOfLines={1}>
                  {isCheckedIn ? (gymName || t('cards.checkedIn')) : t('cards.checkInDrops')}
                </Text>
              </View>
              {!isCheckedIn && <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.20)" />}
            </View>
          </PlatformBlur>
        </PressableCard>

        {/* Happy Hour */}
        <View style={styles.actionPulseWrap}>
          {/* Glow ring — absolute, behind the card */}
          {isHappyHourActive && (
            <Animated.View
              style={[styles.hhGlowRing, { borderColor: hexToRgba(GOLD, 0.78) }, hhGlowStyle]}
              pointerEvents="none"
            />
          )}
          <PressableCard
            style={[styles.actionCard, { borderColor: hexToRgba(hhColor, isHappyHourActive ? 0.5 : 0.18) }]}
            onPress={onHappyHourPress}
          >
            <PlatformBlur intensity={50} tint="dark" style={styles.hhCardBlur} androidColor="rgba(38,32,58,0.97)">
              <LinearGradient
                colors={[hexToRgba(hhColor === 'rgba(255,255,255,0.25)' ? '#ffffff' : hhColor, 0.06), 'rgba(10,10,20,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.actionInner}>
                <View style={[styles.actionIconWrap, { backgroundColor: hexToRgba(hhColor, 0.12) }]}>
                  <Ionicons
                    name={isHappyHourActive ? 'flash' : 'flash-outline'}
                    size={20}
                    color={hhColor}
                  />
                </View>
                <View style={styles.actionInfo}>
                  {/* Title row with multiplier badge inline when live */}
                  <View style={styles.hhTitleRow}>
                    <Text style={[styles.actionTitle, { color: isHappyHourActive ? GOLD : 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>
                      {t('cards.happyHourTitle')}
                    </Text>
                    {isHappyHourActive && nextHappyHour && (
                      <View style={styles.hhMultiplierBadge}>
                        <Text style={styles.hhMultiplierText}>×{nextHappyHour.multiplier}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.actionSub} numberOfLines={1}>
                    {isHappyHourActive && nextHappyHour
                      ? (() => {
                          if (hhSecondsLeft !== null) {
                            const totalMin = Math.floor(hhSecondsLeft / 60);
                            const h = Math.floor(totalMin / 60);
                            const m = totalMin % 60;
                            const s = hhSecondsLeft % 60;
                            const timeStr = h > 0
                              ? `${h}h ${String(m).padStart(2, '0')}m`
                              : m > 0
                                ? `${m}m ${String(s).padStart(2, '0')}s`
                                : `${s}s`;
                            return `${t('happyHour.live')} · ${t('cards.endsIn', { time: timeStr })}`;
                          }
                          return `${t('happyHour.live')} · ${t('cards.endsAt', { time: nextHappyHour.endTime })}`;
                        })()
                      : nextHappyHour
                        ? nextHappyHour.isToday
                          ? `×${nextHappyHour.multiplier} · ${t('cards.hhToday')} ${nextHappyHour.time}`
                          : `×${nextHappyHour.multiplier} · ${t('cards.hhTomorrow')} ${nextHappyHour.time}`
                        : t('cards.happyHourNone')}
                  </Text>
                </View>
              </View>
              {/* Countdown progress bar — only when live */}
              {isHappyHourActive && hhTotalSeconds !== null && (
                <View style={styles.hhProgressTrack}>
                  <Animated.View style={[styles.hhProgressFill, hhProgressBarStyle]} />
                </View>
              )}
            </PlatformBlur>
          </PressableCard>
        </View>
      </View>

      {/* ── Full-width: Next reward ───────────────────────────────────────── */}
      {nextRewardName ? (
        <NextRewardCard
          title={nextRewardName}
          imageUrl={nextRewardImageUrl}
          progressPercent={nextRewardPriceDrops > 0
            ? Math.min((localDropsBalance ?? 0) / nextRewardPriceDrops * 100, 100)
            : 0}
          progressLabel={dropsToNextReward > 0
            ? `${formatCompact(dropsToNextReward)} ${t('rings.toUnlock')}`
            : t('rings.canAfford')}
          primary={primaryColor}
          eyebrow={t('nextAward')}
          onPress={onRewardPress}
        />
      ) : null}
    </View>
  );
});

const GLASS_BG = 'rgba(10, 10, 20, 0.52)';

const styles = StyleSheet.create({
  wrapper: {
    gap: CARD_GAP,
    marginBottom: 20,
  },

  /* ── Top row ── */
  topRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    height: HERO_H,
  },

  /* Hero card */
  watermark: {
    position: 'absolute',
    right: -45,
    bottom: -20,
  },
  heroCard: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(8, 12, 24, 0.97)',
    borderWidth: 1,
  },
  liquidHeroInner: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 18,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  heroIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    ...fontStyles.heading,
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroNumber: {
    ...getNumberStyle(26),
    lineHeight: 30,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroSub: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  bonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  bonusLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
  },

  /* Side column */
  sideCol: {
    flex: 1,
    gap: CARD_GAP,
  },
  sideCard: {
    flex: 1,
    height: SIDE_H,
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
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideEyebrow: {
    ...fontStyles.heading,
    fontSize: 8,
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    flex: 1,
  },
  sideNumber: {
    ...getNumberStyle(16),
    lineHeight: 19,
  },
  sideUnit: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },
  sideSub: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  /* Shared blur fill */
  cardBlurFill: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-start',
  },

  /* Action cards row */
  actionsRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    justifyContent: 'space-between',
  },
  actionCard: {
    width: ACTION_W,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    minHeight: 64,
  },
  actionPulseWrap: {
    width: ACTION_W,
    position: 'relative',
  },
  hhGlowRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 19,
    borderWidth: 1,
    zIndex: -1,
  },
  hhCardBlur: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    justifyContent: 'flex-start',
  },
  hhTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  hhMultiplierBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.40)',
  },
  hhMultiplierText: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: GOLD,
    letterSpacing: 0.5,
  },
  hhProgressTrack: {
    marginTop: 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    overflow: 'hidden',
  },
  hhProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: GOLD,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
  },
  actionSub: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    marginTop: 2,
  },

  /* ── Next Reward Card ── */
  rewardCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
  },
  rewardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  rewardThumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  rewardThumbImage: {
    width: THUMB,
    height: THUMB,
  },
  rewardThumbPlaceholder: {
    width: THUMB,
    height: THUMB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rewardEyebrow: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.38)',
  },
  rewardTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.2,
  },
  rewardBarTrack: {
    gap: 5,
    marginTop: 6,
  },
  rewardBarBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rewardBarFillWrap: {
    height: '100%',
  },
  rewardBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  rewardProgressLabel: {
    ...fontStyles.body,
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
