import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fontStyles, hexToRgba } from '@/lib/theme';

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
  multiplier: number;
  inMinutes: number;
  isToday: boolean;
}

export interface StatsCardsProps {
  currentRank: number;
  streakDays: number;
  todayDrops: number;
  todayBonusDrops?: number;
  dailyCap: number;
  primaryColor: string;
  isCheckedIn: boolean;
  gymName: string;
  onCheckinPress: () => void;
  nextRewardName: string | null;
  dropsToNextReward: number;
  onRewardPress: () => void;
  nextHappyHour: HappyHourSlot | null;
  isHappyHourActive: boolean;
  onHappyHourPress: () => void;
  onRankPress: () => void;
  onStreakPress: () => void;
  onDropsPress: () => void;
}

// Shared glass surface background — matches challenge cards, invite CTA, etc.
const GLASS_BG = 'rgba(18, 18, 28, 0.80)';
const TODAY_COLOR = '#E8E8E8';
const GOLD = '#FFD700';
const GREEN = '#4CD964';

export const StatsCards: React.FC<StatsCardsProps> = ({
  currentRank,
  streakDays,
  todayDrops,
  todayBonusDrops = 0,
  dailyCap,
  primaryColor,
  isCheckedIn,
  gymName,
  onCheckinPress,
  nextRewardName,
  dropsToNextReward,
  onRewardPress,
  nextHappyHour,
  isHappyHourActive,
  onHappyHourPress,
  onRankPress,
  onStreakPress,
  onDropsPress,
}) => {
  const { t } = useTranslation('home');

  const streakColor = getStreakColor(streakDays, primaryColor);
  const streakIcon = getStreakIcon(streakDays);
  const streakLabel = getStreakLabel(streakDays, t);
  const capReached = dailyCap > 0 && todayDrops >= dailyCap;
  const overCap = dailyCap > 0 && todayDrops > dailyCap && todayBonusDrops > 0;

  return (
    <View style={styles.wrapper}>

      {/* ── Row 1: Rank / Streak / Today ── */}
      <View style={styles.row}>

        {/* Rank → Leaderboard */}
        <TouchableOpacity
          style={[styles.statCardOuter, { borderColor: hexToRgba(primaryColor, 0.28) }]}
          onPress={onRankPress}
          activeOpacity={0.7}
        >
          <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
            <LinearGradient
              colors={[hexToRgba(primaryColor, 0.14), hexToRgba(primaryColor, 0.06)]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons name="podium-outline" size={17} color={primaryColor} />
              <Text style={[styles.statValue, { color: primaryColor }]}>
                #{currentRank > 0 ? currentRank : '—'}
              </Text>
              <Text style={styles.statLabel}>{t('rings.rank')}</Text>
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>

        {/* Streak → Workout history */}
        <TouchableOpacity
          style={[styles.statCardOuter, { borderColor: hexToRgba(streakColor, 0.28) }]}
          onPress={onStreakPress}
          activeOpacity={0.7}
        >
          <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
            <LinearGradient
              colors={[hexToRgba(streakColor, 0.14), hexToRgba(streakColor, 0.06)]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons name={streakIcon} size={17} color={streakColor} />
              <Text style={[styles.statValue, { color: streakColor }]}>{streakDays}d</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{streakLabel}</Text>
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>

        {/* Today drops → Wallet */}
        <TouchableOpacity
          style={[
            styles.statCardOuter,
            capReached
              ? { borderColor: 'rgba(76,217,100,0.35)' }
              : { borderColor: 'rgba(232,232,232,0.18)' },
          ]}
          onPress={onDropsPress}
          activeOpacity={0.7}
        >
          <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
            <LinearGradient
              colors={
                capReached
                  ? ['rgba(76,217,100,0.14)', 'rgba(76,217,100,0.06)']
                  : ['rgba(232,232,232,0.08)', 'rgba(232,232,232,0.03)']
              }
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons
                name={capReached ? 'checkmark-circle' : 'water-outline'}
                size={17}
                color={capReached ? GREEN : TODAY_COLOR}
              />
              <Text style={[styles.statValue, capReached && { color: GREEN }]}>
                {dailyCap > 0 ? `${todayDrops}/${dailyCap}` : `${todayDrops}`}
              </Text>
              {overCap ? (
                <View style={styles.bonusRow}>
                  <Ionicons name="flash" size={9} color="rgba(76,217,100,0.85)" />
                  <Text style={styles.bonusLabel}>+{todayBonusDrops}</Text>
                </View>
              ) : (
                <Text style={styles.statLabel}>{t('rings.today')}</Text>
              )}
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>
      </View>

      {/* ── Row 2: Check-in + Happy Hour ── */}
      <View style={styles.row}>

        {/* Check-in — disabled + green when already checked in */}
        <TouchableOpacity
          style={[
            styles.halfCardOuter,
            isCheckedIn
              ? { borderColor: 'rgba(76,217,100,0.35)' }
              : { borderColor: 'rgba(255,255,255,0.12)' },
          ]}
          onPress={isCheckedIn ? undefined : onCheckinPress}
          activeOpacity={isCheckedIn ? 1 : 0.75}
          disabled={isCheckedIn}
        >
          <BlurView intensity={50} tint="dark" style={styles.halfCardBlur}>
            <LinearGradient
              colors={
                isCheckedIn
                  ? ['rgba(76,217,100,0.16)', 'rgba(76,217,100,0.06)']
                  : ['rgba(255,255,255,0.06)', 'rgba(18,18,28,0.80)']
              }
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.halfCardGradient}
            >
              <Ionicons
                name={isCheckedIn ? 'checkmark-circle' : 'qr-code-outline'}
                size={20}
                color={isCheckedIn ? GREEN : 'rgba(255,255,255,0.65)'}
              />
              <View style={styles.halfCardInfo}>
                <Text
                  style={[styles.halfCardTitle, isCheckedIn && { color: GREEN }]}
                  numberOfLines={1}
                >
                  {isCheckedIn ? gymName || t('cards.checkedIn') : t('cards.checkIn')}
                </Text>
                <Text style={styles.halfCardSub}>
                  {isCheckedIn ? t('cards.checkedIn') : t('cards.checkInDrops')}
                </Text>
              </View>
              {!isCheckedIn && (
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.22)" />
              )}
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>

        {/* Happy Hour */}
        <TouchableOpacity
          style={[
            styles.halfCardOuter,
            isHappyHourActive
              ? { borderColor: 'rgba(255,214,0,0.40)' }
              : nextHappyHour
                ? { borderColor: 'rgba(255,214,0,0.18)' }
                : { borderColor: 'rgba(255,255,255,0.08)' },
          ]}
          onPress={onHappyHourPress}
          activeOpacity={0.75}
        >
          <BlurView intensity={50} tint="dark" style={styles.halfCardBlur}>
            <LinearGradient
              colors={
                isHappyHourActive
                  ? ['rgba(255,214,0,0.16)', 'rgba(255,214,0,0.06)']
                  : nextHappyHour
                    ? ['rgba(255,214,0,0.08)', 'rgba(18,18,28,0.80)']
                    : ['rgba(255,255,255,0.04)', 'rgba(18,18,28,0.80)']
              }
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.halfCardGradient}
            >
              <Ionicons
                name={isHappyHourActive ? 'flash' : 'flash-outline'}
                size={20}
                color={isHappyHourActive ? GOLD : nextHappyHour ? GOLD : 'rgba(255,255,255,0.3)'}
              />
              <View style={styles.halfCardInfo}>
                {isHappyHourActive && nextHappyHour ? (
                  <>
                    <Text style={[styles.halfCardTitle, { color: GOLD }]}>
                      x{nextHappyHour.multiplier} {t('happyHour.live')}
                    </Text>
                    <Text style={styles.halfCardSub}>
                      {t('cards.endsAt', { time: nextHappyHour.endTime })}
                    </Text>
                  </>
                ) : nextHappyHour ? (
                  <>
                    <Text style={[styles.halfCardTitle, { color: GOLD }]}>
                      x{nextHappyHour.multiplier}
                    </Text>
                    <Text style={styles.halfCardSub} numberOfLines={1}>
                      {nextHappyHour.isToday
                        ? `${t('cards.hhToday')} ${nextHappyHour.time}`
                        : `${t('cards.hhTomorrow')} ${nextHappyHour.time}`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.halfCardTitle, { color: 'rgba(255,255,255,0.3)' }]}>—</Text>
                    <Text style={styles.halfCardSub}>{t('cards.noHappyHour')}</Text>
                  </>
                )}
              </View>
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>
      </View>

      {/* ── Full-width: Next reward card (always visible when available) ── */}
      {nextRewardName && dropsToNextReward > 0 ? (
        <TouchableOpacity
          style={[styles.fullCardOuter, { borderColor: hexToRgba(primaryColor, 0.28) }]}
          onPress={onRewardPress}
          activeOpacity={0.8}
        >
          <BlurView intensity={50} tint="dark" style={styles.fullCardBlur}>
            <LinearGradient
              colors={[hexToRgba(primaryColor, 0.14), hexToRgba(primaryColor, 0.05)]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.fullCardGradient}
            >
              <Ionicons name="gift-outline" size={18} color={primaryColor} />
              <View style={styles.fullCardInfo}>
                <Text style={styles.fullCardTitle} numberOfLines={1}>{nextRewardName}</Text>
                <View style={styles.fullCardSubRow}>
                  <Ionicons name="water" size={11} color={hexToRgba(primaryColor, 0.75)} />
                  <Text style={[styles.fullCardSub, { color: hexToRgba(primaryColor, 0.85) }]}>
                    {dropsToNextReward} {t('rings.toUnlock')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={hexToRgba(primaryColor, 0.45)} />
            </LinearGradient>
          </BlurView>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },

  /* ── Stat cards (3-column) ── */
  statCardOuter: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statCardBlur: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
  },
  statCardGradient: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  statLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  bonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bonusLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    color: 'rgba(76, 217, 100, 0.8)',
    textAlign: 'center',
  },

  /* ── Half-width cards ── */
  halfCardOuter: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  halfCardBlur: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
  },
  halfCardGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    gap: 10,
  },
  halfCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  halfCardTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  halfCardSub: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },

  /* ── Full-width card ── */
  fullCardOuter: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fullCardBlur: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
  },
  fullCardGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  fullCardInfo: {
    flex: 1,
  },
  fullCardTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  fullCardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  fullCardSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
});
