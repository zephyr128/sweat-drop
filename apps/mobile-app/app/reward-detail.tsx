import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Clipboard } from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { log } from '@/lib/logger';
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
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
import { classifyRewardClaimError } from '@/lib/security/reward-claim-errors';

type RedemptionLimit = 'unlimited' | 'once' | 'once_per_day' | 'once_per_week' | 'once_per_month';

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
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (limit === 'once_per_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(0);
}

export default function RewardDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rewardId, gymId } = useLocalSearchParams<{ rewardId: string; gymId?: string }>();
  const { session } = useSession();
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = gymId || getActiveGymId() || '';
  const { t } = useTranslation('store');
  const showModal = useAppModal((s) => s.showModal);
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  const [reward, setReward] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [redemptionStatus, setRedemptionStatus] = useState<'pending' | 'confirmed' | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const lastRedemptionId = useRef<string | null>(null);
  const lastDropsSpent = useRef<number>(0);

  const loadReward = useCallback(async () => {
    if (!rewardId) return;

    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('id', rewardId)
      .single();

    if (data) setReward(data);
    setLoading(false);
  }, [rewardId]);

  const checkClaimed = useCallback(async () => {
    if (!session?.user || !rewardId || !activeGymId) return;

    const { data: rpcData } = await supabase.rpc('get_my_redemptions', {
      p_gym_id: activeGymId,
      p_statuses: ['pending', 'confirmed'],
      p_limit: null,
    });
    const data = (rpcData ?? []).filter((r: any) => r.reward_id === rewardId)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (!data || data.length === 0 || !reward) {
      setClaimed(false);
      return;
    }

    const limit: RedemptionLimit = reward.redemption_limit || 'unlimited';
    let isClaimed = false;
    let matchingRedemption: typeof data[0] | null = null;

    if (limit === 'unlimited') {
      matchingRedemption = data.find((r: any) => r.status === 'pending') || null;
      isClaimed = !!matchingRedemption;
    } else if (limit === 'once') {
      isClaimed = data.length > 0;
      matchingRedemption = data[0] || null;
    } else {
      const periodStart = getPeriodStart(limit, new Date());
      matchingRedemption = data.find((r: any) => new Date(r.created_at) >= periodStart) || null;
      isClaimed = !!matchingRedemption;
    }

    setClaimed(isClaimed);
    if (isClaimed && matchingRedemption) {
      setRedemptionStatus(matchingRedemption.status as 'pending' | 'confirmed');
      lastRedemptionId.current = matchingRedemption.id;
      lastDropsSpent.current = matchingRedemption.drops_spent ?? 0;
      if (matchingRedemption.status === 'pending' && matchingRedemption.redemption_code) {
        setLastCode(matchingRedemption.redemption_code);
      } else if (matchingRedemption.status === 'confirmed') {
        setLastCode(null);
      }
    } else {
      setRedemptionStatus(null);
      lastRedemptionId.current = null;
    }
  }, [session?.user, rewardId, activeGymId, reward]);

  const checkVerification = useCallback(async () => {
    if (!session?.user || !activeGymId) return;
    const { data } = await supabase
      .from('gym_member_identities')
      .select('is_verified')
      .eq('user_id', session.user.id)
      .eq('gym_id', activeGymId)
      .maybeSingle();
    setIsVerified(data?.is_verified === true);
  }, [session?.user?.id, activeGymId]);

  useEffect(() => {
    loadReward();
    refreshLocalDrops();
    checkVerification();
  }, [rewardId]);

  useEffect(() => {
    if (reward) checkClaimed();
  }, [reward, checkClaimed]);

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

  const handleRedeem = async () => {
    if (!session?.user || !activeGymId || !reward) return;

    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc('claim_reward', {
        p_user_id: session.user.id,
        p_reward_id: reward.id,
        p_gym_id: activeGymId,
      });

      if (error) {
        const kind = classifyRewardClaimError(error.message);
        if (kind === 'limit_once') {
          showModal({ title: t('common:error'), body: t('limitOnceReached') });
        } else if (kind === 'limit_daily') {
          showModal({ title: t('common:error'), body: t('limitDailyReached') });
        } else if (kind === 'limit_weekly') {
          showModal({ title: t('common:error'), body: t('limitWeeklyReached') });
        } else if (kind === 'limit_monthly') {
          showModal({ title: t('common:error'), body: t('limitMonthlyReached') });
        } else if (kind === 'temporarily_unavailable') {
          showModal({ title: t('common:error'), body: t('temporarilyUnavailable') });
        } else if (kind === 'fraud_blocked') {
          showModal({ title: t('common:error'), body: t('fraudBlocked') });
        } else if (kind === 'rate_limited') {
          showModal({ title: t('common:error'), body: t('rateLimited') });
        } else if (kind === 'verification_required') {
          showModal({ title: t('verificationRequired'), body: t('verificationRequiredBody'), buttons: [{ label: t('common:gotIt'), style: 'cancel' as const }] });
        } else {
          showModal({ title: t('common:error'), body: error.message });
        }
        setClaiming(false);
        return;
      }

      if (!data || data.length === 0 || !data[0].success) {
        const kind = classifyRewardClaimError(data?.[0]?.error_message || '');
        const errorBody =
          kind === 'limit_once' ? t('limitOnceReached') :
          kind === 'limit_daily' ? t('limitDailyReached') :
          kind === 'limit_weekly' ? t('limitWeeklyReached') :
          kind === 'limit_monthly' ? t('limitMonthlyReached') :
          kind === 'temporarily_unavailable' ? t('temporarilyUnavailable') :
          kind === 'fraud_blocked' ? t('fraudBlocked') :
          kind === 'rate_limited' ? t('rateLimited') :
          kind === 'verification_required' ? t('verificationRequiredBody') :
          (data?.[0]?.error_message || t('redemptionFailed'));
        showModal({ title: t('redemptionFailed'), body: errorBody });
        setClaiming(false);
        return;
      }

      setLastCode(data[0].redemption_code);
      lastRedemptionId.current = data[0].redemption_id ?? null;
      lastDropsSpent.current = reward.price_drops;
      setClaimed(true);
      setRedemptionStatus('pending');
      refreshLocalDrops();
      loadReward();
    } catch (err: any) {
      showModal({ title: t('common:error'), body: err.message || t('redemptionFailed') });
    } finally {
      setClaiming(false);
    }
  };

  const confirmRedeem = () => {
    if (!reward) return;
    if (isVerified === false) {
      showModal({
        title: t('verificationRequired'),
        body: t('verificationRequiredBody'),
        buttons: [{ label: t('common:gotIt'), style: 'cancel' as const }],
      });
      return;
    }
    showModal({
      title: t('redeemReward'),
      body: t('redeemConfirm', { name: reward.name, price: reward.price_drops }),
      buttons: [
        { label: t('common:cancel'), style: 'cancel' },
        { label: t('redeem'), onPress: handleRedeem },
      ],
    });
  };

  const doCancel = async () => {
    const redemptionId = lastRedemptionId.current;
    const dropsSpent = lastDropsSpent.current;
    if (!redemptionId) return;

    setCancelling(true);
    try {
      const { data, error } = await supabase.rpc('cancel_own_redemption', {
        p_redemption_id: redemptionId,
      });

      if (error) {
        showModal({ title: t('cancelError'), body: error.message });
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.success) {
          showModal({
            title: t('cancelSuccess'),
            body: t('cancelSuccessDesc', { drops: dropsSpent }),
          });
          setClaimed(false);
          setRedemptionStatus(null);
          setLastCode(null);
          lastRedemptionId.current = null;
          refreshLocalDrops();
        } else {
          showModal({ title: t('cancelError'), body: result?.error_message || t('cancelErrorDesc') });
        }
      }
    } catch (err: any) {
      log.error('[RewardDetail] Cancel error:', err);
      showModal({ title: t('cancelError'), body: err?.message || t('cancelErrorDesc') });
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelRedemption = () => {
    showModal({
      title: t('cancelTitle'),
      body: t('cancelConfirm', { drops: lastDropsSpent.current }),
      buttons: [
        { label: t('cancelNo'), style: 'cancel' },
        { label: t('cancelYes'), style: 'destructive', onPress: doCancel },
      ],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!reward) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title={t('rewardDetails')} insetHandled />
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('noRewards')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const limit: RedemptionLimit = reward.redemption_limit || 'unlimited';
  const limitLabel = getLimitLabel(limit);
  const affordable = localDrops >= reward.price_drops;
  const outOfStock = reward.stock !== null && reward.stock <= 0;
  const notYetAvailable = reward.available_from && new Date(reward.available_from) > new Date();
  const expired = reward.available_until && new Date(reward.available_until) < new Date();
  const canClaim = affordable && !claimed && !outOfStock && !notYetAvailable && !expired && !claiming;
  const dropsNeeded = reward.price_drops - localDrops;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('rewardDetails')} insetHandled />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero Image / Icon */}
        <Animated.View entering={FadeIn.delay(80).duration(500)} style={styles.heroContainer}>
          {reward.image_url ? (
            <View style={styles.heroImageWrapper}>
              <Image
                source={reward.image_url}
                style={[styles.heroImage, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                contentFit="cover"
                transition={300}
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                style={styles.heroImageGradient}
              />
            </View>
          ) : (
            <View style={[styles.heroIcon, { backgroundColor: hexToRgba(branding.primary, 0.08), borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <Ionicons name={getRewardIcon(reward.reward_type)} size={64} color={branding.primary} />
            </View>
          )}
        </Animated.View>

        {/* Name */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <Text style={styles.rewardName}>{reward.name}</Text>
        </Animated.View>

        {/* Description */}
        {reward.description && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            <Text style={styles.rewardDescription}>{reward.description}</Text>
          </Animated.View>
        )}

        {/* Info Cards */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <View style={[styles.infoCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.infoBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {/* Price */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabel}>
                  <Ionicons name="water" size={18} color={branding.primary} />
                  <Text style={styles.infoLabelText}>{t('price')}</Text>
                </View>
                <Text style={[styles.infoValue, getNumberStyle(22), { color: branding.primary }]}>
                  {reward.price_drops} drops
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Your Balance */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabel}>
                  <Ionicons name="wallet-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.infoLabelText}>{t('yourBalance')}</Text>
                </View>
                <Text style={[
                  styles.infoValue,
                  getNumberStyle(22),
                  { color: affordable ? '#4ade80' : '#f87171' },
                ]}>
                  {localDrops} drops
                </Text>
              </View>

              {!affordable && (
                <>
                  <View style={styles.divider} />
                  <View style={[styles.needMoreBanner, { backgroundColor: 'rgba(248, 113, 113, 0.08)' }]}>
                    <Ionicons name="alert-circle-outline" size={16} color="#f87171" />
                    <Text style={[styles.needMoreText, { color: '#f87171' }]}>
                      {t('needMore', { count: dropsNeeded })}
                    </Text>
                  </View>
                </>
              )}

              <View style={styles.divider} />

              {/* Stock */}
              <View style={styles.infoRow}>
                <View style={styles.infoLabel}>
                  <Ionicons name="cube-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.infoLabelText}>{t('availability')}</Text>
                </View>
                <Text style={[styles.infoValue, {
                  color: outOfStock ? '#f87171' : theme.colors.text,
                }]}>
                  {outOfStock
                    ? t('outOfStock')
                    : reward.stock !== null
                      ? t('stockAvailable', { count: reward.stock })
                      : t('unlimited')}
                </Text>
              </View>

              {/* Limit */}
              {limitLabel && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabel}>
                      <Ionicons name="time-outline" size={18} color={theme.colors.textSecondary} />
                      <Text style={styles.infoLabelText}>Limit</Text>
                    </View>
                    <Text style={[styles.infoValue, { color: branding.primary }]}>
                      {limitLabel}
                    </Text>
                  </View>
                </>
              )}

              {/* Verification status — only shown when not verified */}
              {isVerified === false && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabel}>
                      <Ionicons name="shield-outline" size={18} color="#fbbf24" />
                      <Text style={styles.infoLabelText}>{t('verificationStatus')}</Text>
                    </View>
                    <View style={styles.verificationBadge}>
                      <Ionicons name="alert-circle" size={13} color="#fbbf24" />
                      <Text style={styles.verificationBadgeText}>{t('notVerified')}</Text>
                    </View>
                  </View>
                </>
              )}

              {/* Availability Window */}
              {(reward.available_from || reward.available_until) && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoLabel}>
                      <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                      <Text style={styles.infoLabelText}>{t('availability')}</Text>
                    </View>
                    <Text style={[styles.infoValue, {
                      color: expired ? '#f87171' : notYetAvailable ? '#fbbf24' : theme.colors.text,
                    }]}>
                      {expired
                        ? t('expiredOn', { date: fmtDate(reward.available_until) })
                        : notYetAvailable
                          ? t('notAvailableYet', { date: fmtDate(reward.available_from) })
                          : reward.available_until
                            ? t('availableUntil', { date: fmtDate(reward.available_until) })
                            : t('available')}
                    </Text>
                  </View>
                </>
              )}
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* Pending: show code with amber + cancel */}
        {redemptionStatus === 'pending' && lastCode && (
          <Animated.View entering={FadeInDown.delay(350).duration(400)}>
            <View style={[styles.codeCard, { borderColor: 'rgba(251, 191, 36, 0.3)' }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.codeBlur, { backgroundColor: 'rgba(30, 25, 15, 0.75)' }]}>
                <Ionicons name="time-outline" size={32} color="#fbbf24" />
                <Text style={[styles.codeTitle, { color: '#fbbf24' }]}>{t('pendingPickup')}</Text>
                <Text style={[styles.codeValue, getNumberStyle(36)]}>
                  {lastCode}
                </Text>
                <Text style={styles.codeHint}>{t('pendingPickupHint')}</Text>

                <TouchableOpacity
                  style={styles.copyCodeBtn}
                  onPress={() => {
                    Clipboard.setString(lastCode);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="copy-outline" size={15} color="#fbbf24" />
                  <Text style={styles.copyCodeText}>Copy code</Text>
                </TouchableOpacity>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* Confirmed: green badge, no code */}
        {redemptionStatus === 'confirmed' && (
          <Animated.View entering={FadeInDown.delay(350).duration(400)}>
            <View style={[styles.codeCard, { borderColor: 'rgba(74, 222, 128, 0.3)' }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.codeBlur, { backgroundColor: 'rgba(20, 30, 20, 0.75)' }]}>
                <Ionicons name="checkmark-circle" size={32} color="#4ade80" />
                <Text style={[styles.codeTitle, { color: '#4ade80' }]}>{t('confirmedClaimed')}</Text>
                <Text style={styles.codeHint}>{t('confirmedHint')}</Text>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* Spacer for bottom button */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Button */}
      <View style={styles.bottomBar}>
        <PlatformBlur
          androidColor="rgba(12,12,22,0.97)"
          intensity={80}
          tint="dark"
          style={[styles.bottomBlur, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}
        >
          {claimed && redemptionStatus === 'confirmed' ? (
            <View style={[styles.claimedButton, { backgroundColor: 'rgba(74, 222, 128, 0.12)', borderColor: 'rgba(74, 222, 128, 0.3)' }]}>
              <Ionicons name="checkmark-circle" size={22} color="#4ade80" />
              <Text style={[styles.claimedButtonText, { color: '#4ade80' }]}>
                {t('confirmedClaimed')}
              </Text>
            </View>
          ) : claimed && redemptionStatus === 'pending' ? (
            <TouchableOpacity
              style={styles.cancelBarBtn}
              onPress={handleCancelRedemption}
              disabled={cancelling}
              activeOpacity={0.75}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#f87171" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color="#f87171" />
                  <Text style={styles.cancelBarBtnText}>{t('cancelRedemption')}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.redeemButton,
                { backgroundColor: canClaim ? branding.primary : 'rgba(255,255,255,0.08)' },
              ]}
              onPress={confirmRedeem}
              disabled={!canClaim}
              activeOpacity={0.85}
            >
              {claiming ? (
                <ActivityIndicator size="small" color={branding.onPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="water"
                    size={20}
                    color={canClaim ? branding.onPrimary : theme.colors.textSecondary}
                  />
                  <Text style={[
                    styles.redeemButtonText,
                    { color: canClaim ? branding.onPrimary : theme.colors.textSecondary },
                  ]}>
                    {outOfStock
                      ? t('outOfStock')
                      : !affordable
                        ? t('needMore', { count: dropsNeeded })
                        : t('claimReward', { price: reward.price_drops })}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </PlatformBlur>
      </View>
    </SafeAreaView>
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
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },

  heroContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  heroImageWrapper: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: 260,
    borderRadius: 24,
    borderWidth: 1,
  },
  heroImageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroIcon: {
    width: 140,
    height: 140,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },

  rewardName: {
    ...fontStyles.heading,
    fontSize: 28,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  rewardDescription: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
    letterSpacing: 0.3,
    paddingHorizontal: theme.spacing.md,
  },

  infoCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  infoBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabelText: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  infoValue: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
  },
  verificationBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.10)',
  },
  verificationBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: '#fbbf24',
    letterSpacing: 0.2,
  },
  needMoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  needMoreText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  codeCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  codeBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  codeTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#4ade80',
  },
  codeValue: {
    ...fontStyles.number,
    color: theme.colors.text,
    letterSpacing: 8,
    marginVertical: theme.spacing.sm,
  },
  codeHint: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBlur: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  redeemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
  },
  redeemButtonText: {
    ...fontStyles.heading,
    fontSize: 17,
    letterSpacing: 0.3,
  },
  claimedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
  },
  claimedButtonText: {
    ...fontStyles.heading,
    fontSize: 17,
    letterSpacing: 0.3,
  },

  // ── Pending bottom bar row ──
  pendingRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  pendingBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
  },

  // ── Cancel button (bottom bar) ──
  cancelBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    backgroundColor: 'rgba(248, 113, 113, 0.06)',
  },
  cancelBarBtnText: {
    ...fontStyles.heading,
    fontSize: 17,
    color: '#f87171',
    letterSpacing: 0.3,
  },

  // ── Cancel button (code card) ──
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    alignSelf: 'stretch',
  },
  cancelBtnText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#f87171',
    letterSpacing: 0.2,
  },

  // ── Copy code button (code card) ──
  copyCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
  },
  copyCodeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: '#fbbf24',
    letterSpacing: 0.3,
  },
});
