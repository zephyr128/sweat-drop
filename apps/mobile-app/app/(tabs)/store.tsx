import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export default function StoreScreen() {
  const { session } = useSession();
  const [rewards, setRewards] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadProfile();
      loadRewards();
    }
  }, [session]);

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

    // Get user's home gym or default gym
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
      // Load all active rewards if no home gym
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
    if (!session?.user || !profile) return;

    if (profile.total_drops < reward.price_drops) {
      Alert.alert('Insufficient Drops', `You need ${reward.price_drops} drops to redeem this reward.`);
      return;
    }

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
            const { error } = await supabase
              .from('redemptions')
              .insert({
                user_id: session.user.id,
                reward_id: reward.id,
                gym_id: reward.gym_id,
                drops_spent: reward.price_drops,
                status: 'pending',
              });

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              // Deduct drops
              await supabase.rpc('add_drops', {
                p_user_id: session.user.id,
                p_amount: -reward.price_drops,
                p_transaction_type: 'reward',
                p_reference_id: reward.id,
                p_description: `Redeemed: ${reward.name}`,
              });

              Alert.alert('Success', 'Reward redeemed! Please show this to gym staff.');
              loadProfile();
              loadRewards();
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Rewards Store</Text>
            <Text style={styles.balance}>
              💧 {profile?.total_drops || 0} drops
            </Text>
          </View>

          {rewards.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No rewards available</Text>
            </View>
          ) : (
            rewards.map((reward) => (
              <TouchableOpacity
                key={reward.id}
                style={styles.rewardCard}
                onPress={() => redeemReward(reward)}
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
                      <Text style={styles.rewardPrice}>
                        💧 {reward.price_drops} drops
                      </Text>
                      {reward.stock !== null && (
                        <Text style={styles.rewardStock}>
                          {reward.stock} left
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  balance: {
    fontSize: 18,
    color: '#6b7280',
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  rewardCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rewardContent: {
    flexDirection: 'row',
    gap: 16,
  },
  rewardEmoji: {
    fontSize: 48,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  rewardDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  rewardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardPrice: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6366f1',
  },
  rewardStock: {
    fontSize: 14,
    color: '#6b7280',
  },
});
