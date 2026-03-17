import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadProfile();
      loadRewards();
      refreshLocalDrops();
    }
  }, [session, activeGymId]);

  const loadProfile = async () => {
    if (!session?.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (data) {
      setProfile(data);
    }
  };

  const loadRewards = async () => {
    setLoading(true);

    if (!session?.user) {
      setLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;

    if (!gymId) {
      const { data } = await supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('price_drops');

      if (data) {
        setRewards(data);
      }
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('rewards')
      .select('*')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order('price_drops');

    if (data) {
      setRewards(data);
    }
    setLoading(false);
  };

  const redeemReward = async (reward: any) => {
    if (!session?.user || !activeGymId) return;

    if (localDrops < reward.price_drops) {
      Alert.alert(
        t('insufficientDrops'),
        t('insufficientDropsMsg', { needed: reward.price_drops, available: localDrops })
      );
      return;
    }

    if (reward.stock !== null && reward.stock <= 0) {
      Alert.alert(t('outOfStock'), t('outOfStockMsg'));
      return;
    }

    Alert.alert(
      t('redeemReward'),
      t('redeemConfirm', { name: reward.name, price: reward.price_drops }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('redeem'),
          onPress: async () => {
            try {
              const { data, error } = await supabase.rpc('claim_reward', {
                p_user_id: session.user.id,
                p_reward_id: reward.id,
                p_gym_id: activeGymId,
              });

              if (error) {
                Alert.alert(t('common:error'), error.message);
                return;
              }

              if (!data || data.length === 0 || !data[0].success) {
                Alert.alert(
                  t('redemptionFailed'),
                  data?.[0]?.error_message || t('redemptionFailed')
                );
                return;
              }

              const redemption = data[0];

              Alert.alert(
                t('redeemSuccess'),
                t('redemptionCode', { code: redemption.redemption_code }),
                [
                  {
                    text: t('viewHistory'),
                    onPress: () => {
                      router.push('/redemptions');
                      loadProfile();
                      loadRewards();
                      refreshLocalDrops();
                    },
                  },
                  { text: 'OK', onPress: () => {
                    loadProfile();
                    loadRewards();
                    refreshLocalDrops();
                  }},
                ]
              );
            } catch (err: any) {
              Alert.alert(t('common:error'), err.message || t('redemptionFailed'));
            }
          },
        },
      ]
    );
  };

  const getRewardIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'coffee': return 'cafe-outline';
      case 'protein': return 'nutrition-outline';
      case 'discount': return 'pricetag-outline';
      case 'merch': return 'shirt-outline';
      default: return 'gift-outline';
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
      {/* Gradient background */}
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
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

        {rewards.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noRewards')}</Text>
            <Text style={styles.emptySubtext}>{t('checkBackSoon')}</Text>
          </View>
        ) : (
          rewards.map((reward, index) => {
            const affordable = canAfford(reward.price_drops);
            return (
              <Animated.View key={reward.id} entering={FadeInDown.delay(200 + index * 80).duration(400)}>
                <TouchableOpacity
                  style={[
                    styles.rewardCard,
                    { borderColor: hexToRgba(branding.primary, affordable ? 0.2 : 0.08) },
                    !affordable && styles.rewardCardDisabled,
                  ]}
                  onPress={() => affordable && redeemReward(reward)}
                  activeOpacity={affordable ? 0.8 : 1}
                >
                  <BlurView intensity={50} tint="dark" style={[styles.rewardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    <View style={styles.rewardContent}>
                      {reward.image_url ? (
                        <Image
                          source={{ uri: reward.image_url }}
                          style={[styles.rewardImage, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.rewardIconContainer, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                          <Ionicons
                            name={getRewardIcon(reward.reward_type)}
                            size={28}
                            color={affordable ? branding.primary : theme.colors.textSecondary}
                          />
                        </View>
                      )}
                      <View style={styles.rewardInfo}>
                        <Text style={styles.rewardName}>{reward.name}</Text>
                        {reward.description && (
                          <Text style={styles.rewardDescription} numberOfLines={2}>
                            {reward.description}
                          </Text>
                        )}
                        <View style={styles.rewardFooter}>
                          <View style={styles.priceContainer}>
                            <Ionicons name="water" size={16} color={affordable ? branding.primary : theme.colors.textSecondary} />
                            <Text style={[
                              styles.rewardPrice,
                              getNumberStyle(18),
                              { color: affordable ? branding.primary : theme.colors.textSecondary },
                            ]}>
                              {reward.price_drops}
                            </Text>
                          </View>
                          {reward.stock !== null && (
                            <Text style={styles.rewardStock}>
                              {reward.stock} left
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  </BlurView>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
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
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  rewardCardDisabled: {
    opacity: 0.5,
  },
  rewardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  rewardContent: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  rewardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardImage: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardName: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.3,
  },
  rewardDescription: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
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
