import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import BackButton from '@/components/BackButton';
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

export default function StoreScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { t } = useTranslation('store');
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
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
      const { data } = await supabase
        .from('redemptions')
        .select('reward_id, created_at, status')
        .eq('user_id', session.user.id)
        .eq('gym_id', activeGymId)
        .in('status', ['pending', 'confirmed']);

      if (data) setRedemptions(data);
    } catch (err) {
      log.error('[Store] Error loading redemptions:', err);
    }
  }, [session?.user, activeGymId]);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user) return;

      if (!hasLoadedRef.current) {
        setLoading(true);
        Promise.all([loadRewards(), loadRedemptions(), refreshLocalDrops()])
          .finally(() => {
            setLoading(false);
            hasLoadedRef.current = true;
          });
      } else {
        Promise.all([loadRewards(), loadRedemptions(), refreshLocalDrops()]);
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
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <TouchableOpacity
          onPress={() => router.push('/redemptions')}
          style={styles.headerButton}
        >
          <Ionicons name="receipt-outline" size={24} color={branding.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rewards}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <View style={[styles.balanceCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.balanceBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="water" size={22} color={branding.primary} />
                <Text style={[styles.balanceText, getNumberStyle(18), { color: branding.primary }]}>
                  {localDrops} drops
                </Text>
                <Text style={styles.balanceLabel}>{t('availableAtGym')}</Text>
              </BlurView>
            </View>
          </Animated.View>
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
                  { borderColor: hexToRgba(branding.primary, disabled ? 0.06 : 0.18) },
                  disabled && styles.rewardCardDisabled,
                ]}
                onPress={() => router.push({ pathname: '/reward-detail', params: { rewardId: reward.id, gymId: activeGymId || '' } })}
                activeOpacity={0.8}
              >
                <BlurView intensity={50} tint="dark" style={[styles.rewardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
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
                </BlurView>
              </TouchableOpacity>
            </Animated.View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
  },
  balanceBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
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
    borderWidth: 1,
  },
  rewardCardDisabled: {
    opacity: 0.5,
  },
  rewardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 0,
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
});
