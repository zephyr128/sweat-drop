import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fontStyles, getNumberStyle, hexToRgba } from '@/lib/theme';
import { PressableCard } from '@/components/PressableCard';
import { ProgressCard } from '@/components/ProgressCard';

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

const TODAY_COLOR = '#E8E8E8';
const GREEN = '#4CD964';
const GOLD = '#FFD700';

export const StatsCards: React.FC<StatsCardsProps> = ({
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
}) => {
  const { t } = useTranslation('home');

  const streakColor = getStreakColor(streakDays, primaryColor);
  const streakIcon = getStreakIcon(streakDays);
  const streakLabel = getStreakLabel(streakDays, t);
  const capReached = dailyCap > 0 && todayDrops >= dailyCap;
  const overCap = dailyCap > 0 && todayDrops > dailyCap && todayBonusDrops > 0;

  const formatCompact = (n: number): string => {
    if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  return (
    <View style={styles.wrapper}>

      {/* Row 1: Today / Streak / Week */}
      <View style={styles.row}>

        {/* Today drops */}
        <PressableCard style={styles.statPill} onPress={onTodayPress}>
          <PlatformBlur intensity={50} tint="dark" style={styles.statPillBlur} androidColor="rgba(12,12,22,0.97)">
            <LinearGradient
              colors={SHIMMER}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statPillGradient}
            >
              <Ionicons
                name={capReached ? 'checkmark-circle' : 'water-outline'}
                size={16}
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
          </PlatformBlur>
        </PressableCard>

        {/* Streak */}
        <PressableCard style={styles.statPill} onPress={onStreakPress}>
          <PlatformBlur intensity={50} tint="dark" style={styles.statPillBlur} androidColor="rgba(12,12,22,0.97)">
            <LinearGradient
              colors={SHIMMER}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statPillGradient}
            >
              <Ionicons name={streakIcon} size={16} color={streakColor} />
              <Text style={[styles.statValue, { color: streakColor }]}>{streakDays}d</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{streakLabel}</Text>
            </LinearGradient>
          </PlatformBlur>
        </PressableCard>

        {/* Weekly drops */}
        <PressableCard style={styles.statPill} onPress={onWeeklyPress}>
          <PlatformBlur intensity={50} tint="dark" style={styles.statPillBlur} androidColor="rgba(12,12,22,0.97)">
            <LinearGradient
              colors={SHIMMER}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statPillGradient}
            >
              <Ionicons name="stats-chart-outline" size={16} color={primaryColor} />
              <Text style={[styles.statValue, { color: primaryColor }]}>
                {weeklyCap > 0 ? `${formatCompact(weeklyDrops)}/${formatCompact(weeklyCap)}` : formatCompact(weeklyDrops)}
              </Text>
              <Text style={styles.statLabel}>{t('rings.week')}</Text>
            </LinearGradient>
          </PlatformBlur>
        </PressableCard>
      </View>

      {/* Row 2: Check-in + Happy Hour */}
      <View style={styles.row}>

        {/* Check-in */}
        <PressableCard
          style={styles.actionCard}
          onPress={isCheckedIn ? undefined : onCheckinPress}
          disabled={isCheckedIn}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.actionCardBlur} androidColor="rgba(12,12,22,0.97)">
            <LinearGradient
              colors={SHIMMER}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionCardGradient}
            >
              <Ionicons
                name={isCheckedIn ? 'checkmark-circle' : 'qr-code-outline'}
                size={20}
                color={isCheckedIn ? GREEN : 'rgba(255,255,255,0.65)'}
              />
              <View style={styles.actionCardInfo}>
                <Text
                  style={[styles.actionCardTitle, isCheckedIn && { color: GREEN }]}
                  numberOfLines={1}
                >
                  {isCheckedIn ? gymName || t('cards.checkedIn') : t('cards.checkIn')}
                </Text>
                <Text style={styles.actionCardSub}>
                  {isCheckedIn ? t('cards.checkedIn') : t('cards.checkInDrops')}
                </Text>
              </View>
              {!isCheckedIn && (
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.22)" />
              )}
            </LinearGradient>
          </PlatformBlur>
        </PressableCard>

        {/* Happy Hour */}
        <PressableCard
          style={styles.actionCard}
          onPress={onHappyHourPress}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.actionCardBlur} androidColor="rgba(12,12,22,0.97)">
            <LinearGradient
              colors={SHIMMER}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionCardGradient}
            >
              <Ionicons
                name={isHappyHourActive ? 'flash' : 'flash-outline'}
                size={20}
                color={isHappyHourActive ? GOLD : nextHappyHour ? GOLD : 'rgba(255,255,255,0.3)'}
              />
              <View style={styles.actionCardInfo}>
                {isHappyHourActive && nextHappyHour ? (
                  <>
                    <Text style={[styles.actionCardTitle, { color: GOLD }]}>
                      x{nextHappyHour.multiplier} {t('happyHour.live')}
                    </Text>
                    <Text style={styles.actionCardSub}>
                      {t('cards.endsAt', { time: nextHappyHour.endTime })}
                    </Text>
                  </>
                ) : nextHappyHour ? (
                  <>
                    <Text style={[styles.actionCardTitle, { color: GOLD }]}>
                      x{nextHappyHour.multiplier}
                    </Text>
                    <Text style={styles.actionCardSub} numberOfLines={1}>
                      {nextHappyHour.isToday
                        ? `${t('cards.hhToday')} ${nextHappyHour.time}`
                        : `${t('cards.hhTomorrow')} ${nextHappyHour.time}`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.actionCardTitle, { color: 'rgba(255,255,255,0.3)' }]}>—</Text>
                    <Text style={styles.actionCardSub}>{t('cards.noHappyHour')}</Text>
                  </>
                )}
              </View>
            </LinearGradient>
          </PlatformBlur>
        </PressableCard>
      </View>

      {/* Full-width: Next reward card */}
      {nextRewardName ? (
        <ProgressCard
          eyebrow={t('nextAward')}
          title={nextRewardName}
          progressPercent={nextRewardPriceDrops > 0
            ? Math.min((localDropsBalance / nextRewardPriceDrops) * 100, 100)
            : 0}
          progressLabel={dropsToNextReward > 0
            ? `${dropsToNextReward} ${t('rings.toUnlock')}`
            : t('rings.canAfford')}
          imageUrl={nextRewardImageUrl}
          fallbackIcon="gift-outline"
          primary={primaryColor}
          onPress={onRewardPress}
        />
      ) : null}
    </View>
  );
};

// Apple visionOS glass: very transparent dark base + crisp specular top edge
const GLASS_BG = 'rgba(12, 12, 22, 0.38)';
const SHIMMER: [string, string] = ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)'];

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },

  /* Stat pills — glass */
  statPill: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  statPillBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  statPillGradient: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    ...getNumberStyle(16),
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

  /* Action cards — glass */
  actionCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  actionCardBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionCardGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  actionCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  actionCardTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  actionCardSub: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },

});
