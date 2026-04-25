import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { log } from '@/lib/logger';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

type RedemptionLimit = 'unlimited' | 'once' | 'once_per_day' | 'once_per_week' | 'once_per_month';

interface Redemption {
  reward_id: string;
  created_at: string;
  status: string;
}

function getPeriodStart(limit: RedemptionLimit, now: Date): Date {
  if (limit === 'once') return new Date(0);
  if (limit === 'once_per_day') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (limit === 'once_per_week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday start
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (limit === 'once_per_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(0);
}

type ClaimStatus = null | 'pending' | 'confirmed';

function getClaimStatus(rewardId: string, limit: RedemptionLimit, redemptions: Redemption[]): ClaimStatus {
  if (limit === 'unlimited') return null;
  const matching = redemptions.filter(r => r.reward_id === rewardId);
  if (matching.length === 0) return null;

  const periodStart = limit === 'once' ? new Date(0) : getPeriodStart(limit, new Date());
  const inPeriod = matching.filter(r => new Date(r.created_at) >= periodStart);
  if (inPeriod.length === 0) return null;

  if (inPeriod.some(r => r.status === 'confirmed')) return 'confirmed';
  if (inPeriod.some(r => r.status === 'pending')) return 'pending';
  return null;
}

interface PrizeRedemption {
  id: string;
  source_type: string;
  description: string | null;
  gym_name: string | null;
  status: string;
  created_at: string;
}

export default function StoreScreen() {
  const router = useThrottledRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  // Subscribe to gym ids individually so a gym switch reactively
  // re-renders this screen and reloads gym-scoped data (rewards,
  // redemptions, prizes). Same pattern as home.tsx — see comment there.
  const homeGymId = useGymStore((s) => s.homeGymId);
  const previewGymId = useGymStore((s) => s.previewGymId);
  const activeGymId = previewGymId || homeGymId;
  const { t } = useTranslation('store');
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [prizes, setPrizes] = useState<PrizeRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const loadRewards = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('home_gym_id')
        .eq('id', session.user.id)
        .single();

      const gymId = profileData?.home_gym_id;

      let query = supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('price_drops');

      if (gymId) {
        query = query.eq('gym_id', gymId);
      }

      const { data } = await query;
      if (data) setRewards(data);
    } catch (err) {
      log.error('[Store] Error loading rewards:', err);
    }
  }, [session?.user]);

  const loadRedemptions = useCallback(async () => {
    if (!session?.user || !activeGymId) return;
    try {
      const { data } = await supabase.rpc('get_my_redemptions', {
        p_gym_id: activeGymId,
        p_statuses: ['pending', 'confirmed'],
        p_limit: null,
      });

      if (data) setRedemptions(data);
    } catch (err) {
      log.error('[Store] Error loading redemptions:', err);
    }
  }, [session?.user, activeGymId]);

  // Prizes are gym-local: a leaderboard / arena prize is collected at the
  // gym where it was earned and cannot be redeemed elsewhere. Scope the
  // "Your Prizes" section to the active gym so a prize from gym A never
  // shows up in gym B's store (where tapping it would land the user on
  // an empty /redemptions screen — the bug this resolves).
  const loadPrizes = useCallback(async () => {
    if (!session?.user || !activeGymId) {
      setPrizes([]);
      return;
    }
    try {
      const { data } = await supabase.rpc('get_my_redemptions', {
        p_gym_id: activeGymId,
        p_statuses: ['pending', 'pending_verification'],
        p_limit: null,
      });
      if (data) {
        const prizeRows = (data as any[]).filter(
          (r) => r.source_type === 'arena_prize' || r.source_type === 'leaderboard_prize',
        );
        setPrizes(prizeRows);
      } else {
        setPrizes([]);
      }
    } catch (err) {
      log.error('[Store] Error loading prizes:', err);
    }
  }, [session?.user, activeGymId]);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user) return;

      if (!hasLoadedRef.current) {
        setLoading(true);
        Promise.all([loadRewards(), loadRedemptions(), loadPrizes(), refreshLocalDrops()])
          .finally(() => {
            setLoading(false);
            hasLoadedRef.current = true;
          });
      } else {
        Promise.all([loadRewards(), loadRedemptions(), loadPrizes(), refreshLocalDrops()]);
      }
    }, [session, activeGymId])
  );

  const getRewardIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'coffee': return 'cafe-outline';
      case 'protein': return 'nutrition-outline';
      case 'discount': return 'pricetag-outline';
      case 'merch': return 'shirt-outline';
      default: return 'gift-outline';
    }
  };

  const getLimitLabel = (limit: RedemptionLimit): string | null => {
    switch (limit) {
      case 'once': return t('limitOnce');
      case 'once_per_day': return t('limitDaily');
      case 'once_per_week': return t('limitWeekly');
      case 'once_per_month': return t('limitMonthly');
      default: return null;
    }
  };

  const getClaimedLabel = (limit: RedemptionLimit): string => {
    switch (limit) {
      case 'once': return t('alreadyClaimed');
      case 'once_per_day': return t('claimedToday');
      case 'once_per_week': return t('claimedThisWeek');
      case 'once_per_month': return t('claimedThisMonth');
      default: return t('alreadyClaimed');
    }
  };

  const canAfford = (price: number) => localDrops >= price;

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <ScreenHeader
        title={t('title')}
        right={
          <TouchableOpacity onPress={() => router.push('/redemptions')} hitSlop={8}>
            <Ionicons name="receipt-outline" size={24} color={branding.primary} />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={rewards}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <View style={[styles.balanceCard, {
                borderTopColor: hexToRgba(branding.primary, 0.30),
                borderLeftColor: hexToRgba(branding.primary, 0.12),
                borderRightColor: 'rgba(255,255,255,0.05)',
                borderBottomColor: 'rgba(255,255,255,0.03)',
              }]}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.balanceBlur}>
                  <LinearGradient
                    colors={[hexToRgba(branding.primary, 0.12), 'rgba(255,255,255,0.02)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <Ionicons name="water" size={22} color={branding.primary} />
                  <Text style={[styles.balanceText, getNumberStyle(18), { color: branding.primary }]}>
                    {localDrops.toLocaleString()} drops
                  </Text>
                  <Text style={styles.balanceLabel}>{t('availableAtGym')}</Text>
                </PlatformBlur>
              </View>
            </Animated.View>

            {prizes.length > 0 && (
              <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.prizesSection}>
                <Text style={[styles.prizesSectionTitle, { color: branding.primary }]}>{t('yourPrizesTitle')}</Text>
                {prizes.map((prize) => {
                  const isArena = prize.source_type === 'arena_prize';
                  const iconName: keyof typeof Ionicons.glyphMap = isArena ? 'shield-outline' : 'podium-outline';
                  const iconColor = isArena ? '#EAB308' : branding.primary;
                  const prizeDesc = (() => {
                    if (!prize.description) return isArena ? t('arenaPrize') : t('leaderboardPrize');
                    const desc = prize.description;
                    if (isArena) {
                      // "Arena Prize: <name> #<rank> - <prize>" → take what's after the LAST " - "
                      const lastDashIdx = desc.lastIndexOf(' - ');
                      return lastDashIdx !== -1 ? desc.slice(lastDashIdx + 3) : desc.replace(/^Arena Prize:\s*/i, '');
                    }
                    // Leaderboard: "Leaderboard Prize: ... — <prize>"
                    const dashIdx = desc.indexOf(' — ');
                    return dashIdx !== -1 ? desc.slice(dashIdx + 3) : desc.replace(/^Leaderboard Prize:\s*/i, '');
                  })();

                  return (
                    <Animated.View key={prize.id} entering={FadeInDown.delay(200).duration(350)}>
                      <TouchableOpacity
                        style={[styles.prizeCard, {
                          borderTopColor: hexToRgba(iconColor, 0.28),
                          borderLeftColor: hexToRgba(iconColor, 0.12),
                          borderRightColor: 'rgba(255,255,255,0.04)',
                          borderBottomColor: 'rgba(255,255,255,0.02)',
                        }]}
                        onPress={() => router.push('/redemptions')}
                        activeOpacity={0.8}
                      >
                        <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.prizeCardBlur}>
                          <LinearGradient
                            colors={[hexToRgba(iconColor, 0.07), 'transparent']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                          />
                          <View style={[styles.prizeIconWrap, { backgroundColor: hexToRgba(iconColor, 0.10) }]}>
                            <Ionicons name={iconName} size={20} color={iconColor} />
                          </View>
                          <View style={styles.prizeCardInfo}>
                            <Text style={[styles.prizeCardName, { color: iconColor }]} numberOfLines={1}>
                              {prizeDesc}
                            </Text>
                            {prize.gym_name ? (
                              <Text style={styles.prizeCardGym} numberOfLines={1}>
                                {t('collectAt', { gym: prize.gym_name })}
                              </Text>
                            ) : null}
                          </View>
                          <View style={[styles.prizeStatusBadge, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
                            <Ionicons name="time-outline" size={11} color="#fbbf24" />
                            <Text style={styles.prizeStatusText}>{t('pendingPickup')}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
                        </PlatformBlur>
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </Animated.View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noRewards')}</Text>
            <Text style={styles.emptySubtext}>{t('checkBackSoon')}</Text>
          </View>
        }
        renderItem={({ item: reward, index }) => {
          const affordable = canAfford(reward.price_drops);
          const limit: RedemptionLimit = reward.redemption_limit || 'unlimited';
          const claimStatus = getClaimStatus(reward.id, limit, redemptions);
          const outOfStock = reward.stock !== null && reward.stock <= 0;
          const limitLabel = getLimitLabel(limit);
          const disabled = !affordable || !!claimStatus || outOfStock;

          return (
            <Animated.View entering={FadeInDown.delay(200 + index * 80).duration(400)}>
              <TouchableOpacity
                style={[
                  styles.rewardCard,
                  disabled ? {
                    borderTopColor: 'rgba(255,255,255,0.06)',
                    borderLeftColor: 'rgba(255,255,255,0.04)',
                    borderRightColor: 'rgba(255,255,255,0.02)',
                    borderBottomColor: 'rgba(255,255,255,0.02)',
                  } : {
                    borderTopColor: hexToRgba(branding.primary, 0.28),
                    borderLeftColor: hexToRgba(branding.primary, 0.12),
                    borderRightColor: 'rgba(255,255,255,0.05)',
                    borderBottomColor: 'rgba(255,255,255,0.03)',
                  },
                  disabled && styles.rewardCardDisabled,
                ]}
                onPress={() => router.push({ pathname: '/reward-detail', params: { rewardId: reward.id, gymId: activeGymId || '' } })}
                activeOpacity={0.8}
              >
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.rewardBlur}>
                  {!disabled && (
                    <LinearGradient
                      colors={[hexToRgba(branding.primary, 0.08), 'rgba(255,255,255,0.02)', 'transparent']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  )}
                  <View style={styles.rewardMediaWrap}>
                    {reward.image_url ? (
                      <Image
                        source={reward.image_url}
                        style={[styles.rewardImage, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.rewardIconContainer, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                        <Ionicons
                          name={getRewardIcon(reward.reward_type)}
                          size={40}
                          color={disabled ? theme.colors.textSecondary : branding.primary}
                        />
                      </View>
                    )}
                    {!affordable && !claimStatus && !outOfStock && (
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={12} color="#fff" />
                        <Text style={styles.lockBadgeText}>
                          {t('lockNeed', { count: reward.price_drops - localDrops })}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardName} numberOfLines={1}>{reward.name}</Text>
                    {reward.description && (
                      <Text style={styles.rewardDescription} numberOfLines={2}>
                        {reward.description}
                      </Text>
                    )}

                    <View style={styles.rewardFooter}>
                      <View style={styles.priceContainer}>
                        <Ionicons name="water" size={16} color={disabled ? theme.colors.textSecondary : branding.primary} />
                        <Text style={[
                          styles.rewardPrice,
                          getNumberStyle(18),
                          { color: disabled ? theme.colors.textSecondary : branding.primary },
                        ]}>
                          {reward.price_drops}
                        </Text>
                      </View>

                      {claimStatus === 'confirmed' ? (
                        <View style={[styles.limitBadge, { backgroundColor: 'rgba(74, 222, 128, 0.1)' }]}>
                          <Ionicons name="checkmark-circle" size={12} color="#4ade80" />
                          <Text style={[styles.limitBadgeText, { color: '#4ade80' }]}>
                            {getClaimedLabel(limit)}
                          </Text>
                        </View>
                      ) : claimStatus === 'pending' ? (
                        <View style={[styles.limitBadge, { backgroundColor: 'rgba(251, 191, 36, 0.1)' }]}>
                          <Ionicons name="time-outline" size={12} color="#fbbf24" />
                          <Text style={[styles.limitBadgeText, { color: '#fbbf24' }]}>
                            {t('pendingPickup')}
                          </Text>
                        </View>
                      ) : limitLabel ? (
                        <View style={[styles.limitBadge, { backgroundColor: hexToRgba(branding.primary, 0.06) }]}>
                          <Ionicons name="time-outline" size={12} color={branding.primary} />
                          <Text style={[styles.limitBadgeText, { color: branding.primary }]}>
                            {limitLabel}
                          </Text>
                        </View>
                      ) : reward.stock !== null ? (
                        <Text style={styles.rewardStock}>
                          {reward.stock} {t('left')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </PlatformBlur>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 40,
  },
  balanceCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  balanceBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  balanceText: {
    ...fontStyles.number,
  },
  balanceLabel: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginLeft: 'auto',
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
  },
  emptySubtext: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  rewardCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  rewardCardDisabled: {
    opacity: 0.45,
  },
  rewardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 0,
  },
  rewardMediaWrap: {
    position: 'relative',
  },
  rewardIconContainer: {
    width: '100%',
    height: 160,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardImage: {
    width: '100%',
    height: 180,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 1,
  },
  lockBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  lockBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.2,
  },
  rewardInfo: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  rewardName: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  rewardDescription: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
    lineHeight: 18,
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  limitBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  rewardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  rewardPrice: {
    ...fontStyles.number,
  },
  rewardStock: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },

  /* Prizes section */
  prizesSection: {
    marginBottom: theme.spacing.lg,
    gap: 8,
  },
  prizesSectionTitle: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  prizeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  prizeCardBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.spacing.md,
    backgroundColor: 'rgba(16,16,28,0.82)',
  },
  prizeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  prizeCardInfo: {
    flex: 1,
    gap: 3,
  },
  prizeCardName: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  prizeCardGym: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  prizeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    flexShrink: 0,
  },
  prizeStatusText: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: '#fbbf24',
    letterSpacing: 0.2,
  },
});
