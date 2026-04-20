/**
 * SheetArenaContent
 * Bottom sheet content for page 3 (Arenas): cyan-themed premium arena stats.
 * No internal scroll — the parent Animated.ScrollView handles all vertical scrolling.
 */
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { ArenasStatsCards } from '@/components/home/ArenasStatsCards';
import type { LeaderboardPrize } from '@/hooks/useMyLeaderboardPrizes';
import { fontStyles, hexToRgba } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import type { AvailableArena } from '@/hooks/useAvailableArenas';

const CYAN = '#00E5FF';

export interface SheetArenaContentProps {
  isUnlocked: boolean;
  hasSession: boolean;
  activeArenas: AvailableArena[];
  pendingArenaPrizes?: LeaderboardPrize[];
  onArenaPress: (arenaId: string) => void;
  onViewAllArenas: () => void;
}

export const SheetArenaContent = React.memo(function SheetArenaContent({
  isUnlocked,
  hasSession,
  activeArenas,
  pendingArenaPrizes = [],
  onArenaPress,
  onViewAllArenas,
}: SheetArenaContentProps) {
  const { t } = useTranslation('home');
  const router = useThrottledRouter();
  const arenaPrize = pendingArenaPrizes.find((p) => p.source_type === 'arena_prize') ?? null;

  return (
    <View style={styles.container}>
      {hasSession && arenaPrize && (
        <TouchableOpacity
          style={styles.prizeBanner}
          onPress={() => router.push(`/redemptions?highlight=${arenaPrize.id}` as any)}
          activeOpacity={0.82}
        >
          <LinearGradient
            colors={[hexToRgba(CYAN, 0.22), hexToRgba(CYAN, 0.06), 'rgba(10,10,18,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.prizeBannerIcon}>
            <Ionicons name="shield-checkmark" size={22} color={CYAN} />
          </View>
          <View style={styles.prizeBannerBody}>
            <Text style={styles.prizeBannerTitle}>{t('prize.wonTitle')}</Text>
            <Text style={styles.prizeBannerSub} numberOfLines={1}>
              {arenaPrize.redemption_code
                ? t('prize.showCode', { code: arenaPrize.redemption_code })
                : t('prize.collectNow')}
            </Text>
          </View>
          <View style={styles.prizeBannerArrow}>
            <Ionicons name="chevron-forward" size={16} color={hexToRgba(CYAN, 0.6)} />
          </View>
        </TouchableOpacity>
      )}
      <ArenasStatsCards
        activeArenas={activeArenas}
        isUnlocked={isUnlocked}
        onArenaPress={onArenaPress}
        onViewAllArenas={onViewAllArenas}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  prizeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hexToRgba(CYAN, 0.22),
    backgroundColor: 'rgba(10,10,18,0.7)',
    overflow: 'hidden',
    marginBottom: 12,
    gap: 12,
  },
  prizeBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: hexToRgba(CYAN, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeBannerBody: { flex: 1, gap: 2 },
  prizeBannerTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: CYAN,
    letterSpacing: 0.3,
  },
  prizeBannerSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: hexToRgba(CYAN, 0.65),
    letterSpacing: 0.2,
  },
  prizeBannerArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: hexToRgba(CYAN, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
