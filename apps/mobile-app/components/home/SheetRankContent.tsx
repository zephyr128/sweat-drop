/**
 * SheetRankContent
 * Bottom sheet content for page 1 (Compete): gold-themed premium compete stats tab.
 * No internal scroll — the parent Animated.ScrollView handles all vertical scrolling.
 */
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CompeteStatsCards } from '@/components/home/CompeteStatsCards';
import type { LeaderboardPeriod } from '@/components/LeaderboardPreview';
import type { PeriodRankInfo } from '@/hooks/useCompeteStats';
import { useLeaderboardRewards } from '@/hooks/useLeaderboardRewards';
import { useMyLeaderboardPrizes } from '@/hooks/useMyLeaderboardPrizes';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { fontStyles, hexToRgba } from '@/lib/theme';
import { useTranslation } from 'react-i18next';

const GOLD = '#EAB308';

// ── Props ────────────────────────────────────────────────────────────────────
export interface SheetRankContentProps {
  gymId: string | null;
  isUnlocked: boolean;
  hasSession: boolean;
  smartcoachEnabled: boolean;
  weekly: PeriodRankInfo;
  monthly: PeriodRankInfo;
  allTime: PeriodRankInfo;
  onLeaderboardPress?: (period: LeaderboardPeriod) => void;
  onInviteFriend: () => void;
  onSmartCoachPress: () => void;
}

export const SheetRankContent = React.memo(function SheetRankContent({
  gymId,
  isUnlocked,
  hasSession,
  smartcoachEnabled,
  weekly,
  monthly,
  allTime,
  onLeaderboardPress,
  onInviteFriend,
  onSmartCoachPress,
}: SheetRankContentProps) {
  const branding = useBranding();
  const { t } = useTranslation('home');
  const router = useRouter();
  const { rewards: weeklyRewards } = useLeaderboardRewards(gymId, 'weekly');
  const { rewards: monthlyRewards } = useLeaderboardRewards(gymId, 'monthly');
  const { pending: pendingPrizes } = useMyLeaderboardPrizes(gymId);

  const firstPendingPrize = pendingPrizes.find((p) => p.source_type === 'leaderboard_prize') ?? null;

  return (
    <View style={styles.container}>
      {/* Leaderboard prize celebration banner */}
      {hasSession && firstPendingPrize && (
        <TouchableOpacity
          style={styles.prizeBanner}
          onPress={() => router.push(`/redemptions?highlight=${firstPendingPrize.id}` as any)}
          activeOpacity={0.82}
        >
          <LinearGradient
            colors={[hexToRgba(GOLD, 0.22), hexToRgba(GOLD, 0.06), 'rgba(10,10,18,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.prizeBannerIcon}>
            <Ionicons name="trophy" size={22} color={GOLD} />
          </View>
          <View style={styles.prizeBannerBody}>
            <Text style={styles.prizeBannerTitle}>{t('prize.wonTitle')}</Text>
            <Text style={styles.prizeBannerSub} numberOfLines={1}>
              {firstPendingPrize.redemption_code
                ? t('prize.showCode', { code: firstPendingPrize.redemption_code })
                : t('prize.collectNow')}
            </Text>
          </View>
          <View style={styles.prizeBannerArrow}>
            <Ionicons name="chevron-forward" size={16} color={hexToRgba(GOLD, 0.6)} />
          </View>
        </TouchableOpacity>
      )}

      <CompeteStatsCards
        weekly={weekly}
        monthly={monthly}
        allTime={allTime}
        primaryColor={branding.primary}
        weeklyRewards={weeklyRewards}
        monthlyRewards={monthlyRewards}
        onLeaderboardPress={onLeaderboardPress}
      />

      {/* Invite friend CTA */}
      {hasSession && isUnlocked && (
        <TouchableOpacity style={styles.inviteCta} onPress={onInviteFriend} activeOpacity={0.82}>
          <LinearGradient
            colors={[hexToRgba(GOLD, 0.1), hexToRgba(GOLD, 0.04), 'rgba(10,10,18,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.inviteCtaIcon}>
            <Ionicons name="person-add" size={18} color={GOLD} />
          </View>
          <View style={styles.inviteCtaBody}>
            <Text style={styles.inviteCtaTitle}>{t('friendsQuick.inviteTitle')}</Text>
            <Text style={styles.inviteCtaSub}>{t('friendsQuick.inviteReward')}</Text>
          </View>
          <View style={styles.inviteCtaArrow}>
            <Ionicons name="chevron-forward" size={16} color={hexToRgba(GOLD, 0.6)} />
          </View>
        </TouchableOpacity>
      )}

      {/* SmartCoach (if enabled) */}
      {smartcoachEnabled && (
        <TouchableOpacity
          style={styles.smartCoachCard}
          onPress={onSmartCoachPress}
          activeOpacity={isUnlocked ? 0.85 : 1}
          disabled={!isUnlocked}
        >
          <LinearGradient
            colors={[hexToRgba(branding.primary, 0.1), hexToRgba(branding.primary, 0.04)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.smartCoachRow}>
            <View style={[styles.smartCoachIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.18) }]}>
              <Ionicons name="fitness" size={24} color={branding.primary} />
            </View>
            <View style={styles.smartCoachText}>
              <Text style={[styles.smartCoachTitle, { color: branding.primary }]}>SmartCoach</Text>
              <Text style={styles.smartCoachSub} numberOfLines={2}>{t('smartCoachSubtitle')}</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={22} color={hexToRgba(branding.primary, 0.5)} />
          </View>
        </TouchableOpacity>
      )}

    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },

  prizeBanner: {
    borderRadius: 18,
    borderWidth: 1,
    borderTopColor: hexToRgba(GOLD, 0.55),
    borderLeftColor: hexToRgba(GOLD, 0.22),
    borderRightColor: hexToRgba(GOLD, 0.12),
    borderBottomColor: hexToRgba(GOLD, 0.08),
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: hexToRgba(GOLD, 0.06),
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  prizeBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: hexToRgba(GOLD, 0.16),
    justifyContent: 'center',
    alignItems: 'center',
  },
  prizeBannerBody: { flex: 1 },
  prizeBannerTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: GOLD,
  },
  prizeBannerSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: hexToRgba(GOLD, 0.7),
    marginTop: 2,
  },
  prizeBannerArrow: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: hexToRgba(GOLD, 0.1),
    justifyContent: 'center',
    alignItems: 'center',
  },

  inviteCta: {
    borderRadius: 18,
    borderWidth: 1,
    borderTopColor: hexToRgba(GOLD, 0.32),
    borderLeftColor: hexToRgba(GOLD, 0.12),
    borderRightColor: hexToRgba(GOLD, 0.08),
    borderBottomColor: hexToRgba(GOLD, 0.05),
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: hexToRgba(GOLD, 0.04),
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  inviteCtaIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: hexToRgba(GOLD, 0.14),
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteCtaBody: { flex: 1 },
  inviteCtaTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  inviteCtaSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: hexToRgba(GOLD, 0.7),
    marginTop: 2,
  },
  inviteCtaArrow: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: hexToRgba(GOLD, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
  },

  smartCoachCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderLeftColor: 'rgba(255,255,255,0.06)',
    borderRightColor: 'rgba(255,255,255,0.04)',
    borderBottomColor: 'rgba(255,255,255,0.03)',
    backgroundColor: 'rgba(14,14,24,0.8)',
    padding: 16,
    marginBottom: 18,
  },
  smartCoachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smartCoachIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smartCoachText: { flex: 1, gap: 3 },
  smartCoachTitle: {
    ...fontStyles.heading,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  smartCoachSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 16,
  },
});
