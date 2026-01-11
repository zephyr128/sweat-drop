import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export default function HomeDashboard() {
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [dailyChallenge, setDailyChallenge] = useState<any>(null);
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadData();
    }
  }, [session]);

  const loadData = async () => {
    if (!session?.user) return;
    setLoading(true);

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
    }

    // Load daily challenge
    const { data: profileGym } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileGym?.home_gym_id;

    if (gymId) {
      const today = new Date().toISOString().split('T')[0];
      const { data: challengeData } = await supabase
        .from('challenges')
        .select('*')
        .eq('gym_id', gymId)
        .eq('challenge_type', 'daily')
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .limit(1)
        .single();

      if (challengeData) {
        setDailyChallenge(challengeData);

        // Load progress
        const { data: progressData } = await supabase
          .from('challenge_progress')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('challenge_id', challengeData.id)
          .single();

        if (progressData) {
          setChallengeProgress(progressData);
        } else {
          // Create progress entry if doesn't exist
          const { data: newProgress } = await supabase
            .from('challenge_progress')
            .insert({
              user_id: session.user.id,
              challenge_id: challengeData.id,
              current_drops: 0,
            })
            .select()
            .single();

          if (newProgress) {
            setChallengeProgress(newProgress);
          }
        }
      }
    }

    setLoading(false);
  };

  const getChallengeProgress = () => {
    if (!dailyChallenge || !challengeProgress) return 0;
    return Math.min((challengeProgress.current_drops / dailyChallenge.target_drops) * 100, 100);
  };

  const getStreakDays = () => {
    // TODO: Calculate actual streak from sessions
    // For now, return mock data
    return 3;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
        </View>
      </SafeAreaView>
    );
  }

  const progress = getChallengeProgress();
  const streakDays = getStreakDays();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>SweatDrop</Text>
          <Text style={styles.pageTitle}>Home Dashboard</Text>
        </View>

        {/* Wallet Widget */}
        <View style={styles.walletWidget}>
          <View style={styles.walletRow}>
            <View style={styles.usernameRow}>
              <View style={styles.dropletIcon}>
                <Ionicons name="water" size={16} color="#14b8a6" />
              </View>
              <Text style={styles.username}>{profile?.username || 'User'}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Ionicons name="water" size={20} color="#14b8a6" />
              <Text style={styles.balance}>{profile?.total_drops?.toLocaleString() || '0'}</Text>
            </View>
          </View>
        </View>

        {/* Daily Challenge Card */}
        <View style={styles.challengeCard}>
          <Text style={styles.challengeTitle}>Daily Challenge</Text>
          <View style={styles.challengeContent}>
            <View style={styles.progressContainer}>
              <View style={styles.progressCircle}>
                {progress > 0 && (
                  <View
                    style={[
                      styles.progressFill,
                      {
                        transform: [{ rotate: `${progress * 3.6 - 90}deg` }],
                      },
                    ]}
                  />
                )}
                <View style={styles.progressCenter}>
                  <Text style={styles.progressText}>
                    {challengeProgress?.current_drops || 0}/{dailyChallenge?.target_drops || 0}
                  </Text>
                  <Text style={styles.progressLabel}>drops</Text>
                </View>
              </View>
            </View>
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streakDays} days</Text>
            </View>
          </View>
        </View>

        {/* Bottom Cards Row */}
        <View style={styles.bottomCardsRow}>
          {/* Rewards Store Card */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => router.push('/(tabs)/store')}
            activeOpacity={0.8}
          >
            <Text style={styles.featureCardTitle}>Rewards Store</Text>
            <View style={styles.iconRow}>
              <Ionicons name="cafe" size={32} color="#fff" />
              <Ionicons name="wine" size={32} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Leaderboards Card */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => router.push('/(tabs)/leaderboard')}
            activeOpacity={0.8}
          >
            <Text style={styles.featureCardTitle}>Leaderboards</Text>
            <Text style={styles.leaderboardSubtitle}>Gym (Local)</Text>
            <Ionicons name="chevron-forward" size={24} color="#fff" style={styles.arrowIcon} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* QR Scanner Button */}
      <View style={styles.scannerButtonContainer}>
          <TouchableOpacity
            style={styles.scannerButton}
            onPress={() => router.push('/(tabs)/scan')}
            activeOpacity={0.9}
          >
          <LinearGradient
            colors={['#14b8a6', '#0d9488']}
            style={styles.scannerButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.scannerButtonGlow} />
            <Ionicons name="qr-code" size={48} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Dark slate background
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120, // Space for QR button
  },
  header: {
    marginBottom: 24,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 18,
    color: '#94a3b8',
    fontWeight: '500',
  },
  walletWidget: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropletIcon: {
    marginRight: 8,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  balance: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#14b8a6', // Teal
  },
  challengeCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  challengeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  challengeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
  },
  progressCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 8,
    borderColor: '#1e293b',
  },
  progressFill: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 70,
    borderWidth: 8,
    borderTopColor: '#14b8a6',
    borderRightColor: '#14b8a6',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  progressFillInner: {
    width: '100%',
    height: '100%',
  },
  progressCenter: {
    alignItems: 'center',
    zIndex: 1,
  },
  progressText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  streakBadge: {
    backgroundColor: '#f97316', // Orange
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  streakText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomCardsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  featureCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  featureCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  leaderboardSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  arrowIcon: {
    position: 'absolute',
    right: 20,
    bottom: 20,
  },
  scannerButtonContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  scannerButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'visible',
  },
  scannerButtonGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#14b8a6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  scannerButtonGlow: {
    position: 'absolute',
    width: '120%',
    height: '120%',
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#14b8a6',
    opacity: 0.5,
  },
});
