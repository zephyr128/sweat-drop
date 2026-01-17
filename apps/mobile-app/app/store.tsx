import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useLocalDrops } from '@/hooks/useLocalDrops';

export default function StoreScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
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

    // Pre-check local balance (client-side validation)
    if (localDrops < reward.price_drops) {
      Alert.alert(
        'Insufficient Drops',
        `You need ${reward.price_drops} drops to redeem this reward.\n\nYou have ${localDrops} drops available at this gym.`
      );
      return;
    }

    // Pre-check stock (client-side validation)
    if (reward.stock !== null && reward.stock <= 0) {
      Alert.alert('Out of Stock', 'This reward is currently unavailable.');
      return;
    }

    Alert.alert(
      'Redeem Reward',
      `Redeem "${reward.name}" for ${reward.price_drops} drops?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            try {
              // Use secure create_redemption function (handles everything atomically)
              const { data, error } = await supabase.rpc('create_redemption', {
                p_user_id: session.user.id,
                p_reward_id: reward.id,
                p_gym_id: activeGymId,
              });

              if (error) {
                Alert.alert('Error', error.message);
                return;
              }

              if (!data || data.length === 0 || !data[0].success) {
                Alert.alert(
                  'Redemption Failed',
                  data?.[0]?.error_message || 'Failed to create redemption. Please try again.'
                );
                return;
              }

              const redemption = data[0];

              // Show success with redemption code
              Alert.alert(
                'Redemption Successful! 🎉',
                `Your redemption code:\n\n${redemption.redemption_code}\n\nShow this code to gym staff to claim your reward.`,
                [
                  {
                    text: 'View History',
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
              Alert.alert('Error', err.message || 'An unexpected error occurred');
            }
          },
        },
      ]
    );
  };

  const getRewardEmoji = (type: string) => {
    switch (type) {
      case 'coffee':
        return '☕';
      case 'protein':
        return '🥤';
      case 'discount':
        return '💳';
      case 'merch':
        return '👕';
      default:
        return '🎁';
    }
  };

  const canAfford = (price: number) => localDrops >= price;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Radial gradient background */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Rewards Store</Text>
        <TouchableOpacity
          onPress={() => router.push('/redemptions')}
          style={styles.headerButton}
        >
          <Ionicons name="receipt-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.balanceCard}>
          <Ionicons name="water" size={24} color={theme.colors.primary} />
          <Text style={[styles.balanceText, getNumberStyle(18)]}>
            {localDrops} drops
          </Text>
          <Text style={styles.balanceLabel}>Available at this gym</Text>
        </View>

        {rewards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No rewards available</Text>
          </View>
        ) : (
          rewards.map((reward) => {
            const affordable = canAfford(reward.price_drops);
            return (
              <TouchableOpacity
                key={reward.id}
                style={[
                  styles.rewardCard,
                  !affordable && styles.rewardCardDisabled,
                ]}
                onPress={() => affordable && redeemReward(reward)}
                activeOpacity={affordable ? 0.7 : 1}
              >
                <View style={styles.rewardContent}>
                  <Text style={styles.rewardEmoji}>
                    {getRewardEmoji(reward.reward_type)}
                  </Text>
                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardName}>{reward.name}</Text>
                    {reward.description && (
                      <Text style={styles.rewardDescription}>
                        {reward.description}
                      </Text>
                    )}
                    <View style={styles.rewardFooter}>
                      <View style={styles.priceContainer}>
                        <Ionicons name="water" size={16} color={affordable ? theme.colors.primary : theme.colors.textSecondary} />
                        <Text style={[
                          styles.rewardPrice,
                          getNumberStyle(18),
                          !affordable && styles.rewardPriceDisabled,
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
              </TouchableOpacity>
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
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    letterSpacing: 0.5,
    pointerEvents: 'none', // Don't block touch events
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  balanceText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  balanceLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    marginLeft: 'auto',
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  rewardCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  rewardCardDisabled: {
    opacity: 0.5,
  },
  rewardContent: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  rewardEmoji: {
    fontSize: 48,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.3,
  },
  rewardDescription: {
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
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  rewardPriceDisabled: {
    color: theme.colors.textSecondary,
  },
  rewardStock: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
});
