/**
 * SheetActivityContent
 * Bottom sheet content for page 0 (Activity): premium stats cards + explore store CTA.
 * Uses branding.primary as the accent color for this tab.
 * No internal scroll — the parent Animated.ScrollView handles all vertical scrolling.
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatsCards } from '@/components/StatsCards';
import { LockedOverlay } from '@/components/LockedOverlay';
import { useBranding } from '@/lib/contexts/ThemeContext';
import type { HomeStats } from '@/hooks/useHomeStats';
import type { DropLimitStatus } from '@/hooks/useDropLimitStatus';
import { useTranslation } from 'react-i18next';
import { fontStyles, hexToRgba } from '@/lib/theme';

export interface SheetActivityContentProps {
  homeStats: HomeStats;
  dropLimits: DropLimitStatus;
  checkinStatus: { already_checked_in: boolean; checkin_drops: number; gym_name: string; total_checkins: number } | null;
  upcomingHH: {
    liveWindow: { label: string; startAt: string; endAt: string; multiplier: number; minutesUntilStart: number; isToday: boolean } | null;
    windows: { label: string; startAt: string; endAt: string; multiplier: number; minutesUntilStart: number; isToday: boolean }[];
  };
  isHappyHourActive: boolean;
  gymName: string;
  onCheckinPress: () => void;
  onHappyHourPress: () => void;
  onStreakPress: () => void;
  onTodayPress: () => void;
  onWeeklyPress: () => void;
  onRewardPress: () => void;
  localDropsBalance: number;
  isUnlocked: boolean;
  onSetAsHomeGym: () => void;
  children?: React.ReactNode;
}

export function SheetActivityContent({
  homeStats,
  dropLimits,
  checkinStatus,
  upcomingHH,
  isHappyHourActive,
  gymName,
  onCheckinPress,
  onHappyHourPress,
  onStreakPress,
  onTodayPress,
  onWeeklyPress,
  onRewardPress,
  localDropsBalance,
  isUnlocked,
  onSetAsHomeGym,
  children,
}: SheetActivityContentProps) {
  const branding = useBranding();
  const { t } = useTranslation('home');

  const nextHappyHour = (() => {
    const slot = upcomingHH.liveWindow ?? upcomingHH.windows[0] ?? null;
    if (!slot) return null;
    const fmt = (iso: string) => {
      try {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } catch {
        return '--:--';
      }
    };
    return {
      label: slot.label,
      time: fmt(slot.startAt),
      endTime: fmt(slot.endAt),
      multiplier: slot.multiplier,
      inMinutes: slot.minutesUntilStart,
      isToday: slot.isToday,
    };
  })();

  return (
    <View style={styles.container}>
      <StatsCards
        streakDays={homeStats.streak}
        todayDrops={homeStats.todayDrops}
        todayBonusDrops={homeStats.todayBonusDrops}
        dailyCap={dropLimits.maxDropsPerDay}
        weeklyDrops={dropLimits.mintedWeek}
        weeklyCap={dropLimits.maxDropsPerWeek}
        primaryColor={branding.primary}
        isCheckedIn={checkinStatus?.already_checked_in ?? false}
        gymName={gymName}
        onCheckinPress={onCheckinPress}
        nextRewardName={homeStats.closestReward?.name ?? null}
        nextRewardImageUrl={homeStats.closestReward?.imageUrl ?? null}
        nextRewardPriceDrops={homeStats.closestReward?.priceDrops ?? 0}
        localDropsBalance={localDropsBalance}
        dropsToNextReward={homeStats.closestReward?.dropsAway ?? 0}
        onRewardPress={onRewardPress}
        nextHappyHour={nextHappyHour}
        isHappyHourActive={isHappyHourActive}
        onHappyHourPress={onHappyHourPress}
        onStreakPress={onStreakPress}
        onTodayPress={onTodayPress}
        onWeeklyPress={onWeeklyPress}
      />

      {/* Explore Store CTA — branding-colored */}
      {!homeStats.closestReward?.name && (
        <TouchableOpacity
          style={[styles.exploreStoreRow, {
            borderTopColor: hexToRgba(branding.primary, 0.35),
            borderLeftColor: hexToRgba(branding.primary, 0.14),
            borderRightColor: hexToRgba(branding.primary, 0.08),
            borderBottomColor: hexToRgba(branding.primary, 0.06),
            backgroundColor: hexToRgba(branding.primary, 0.05),
          }]}
          activeOpacity={0.82}
          onPress={onRewardPress}
        >
          <LinearGradient
            colors={[hexToRgba(branding.primary, 0.08), 'rgba(10,10,18,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.exploreIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.14) }]}>
            <Ionicons name="gift-outline" size={16} color={branding.primary} />
          </View>
          <Text style={styles.exploreStoreText}>{t('exploreStore')}</Text>
          <Ionicons name="chevron-forward" size={16} color={hexToRgba(branding.primary, 0.5)} />
        </TouchableOpacity>
      )}

      <View style={styles.cardsContainer}>
        {!isUnlocked && (
          <View style={styles.cardsOverlayContainer}>
            <LockedOverlay onSetAsHomeGym={onSetAsHomeGym} />
          </View>
        )}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  cardsContainer: { position: 'relative', zIndex: 1 },
  cardsOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'auto' as const,
  },
  exploreStoreRow: {
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  exploreIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exploreStoreText: {
    ...fontStyles.bodySemiBold,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    flex: 1,
  },
});
