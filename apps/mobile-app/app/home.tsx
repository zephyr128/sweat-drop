import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [dailyChallenge, setDailyChallenge] = useState<any>(null);
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  const [topRewards, setTopRewards] = useState<any[]>([]);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Glow animation for QR button
  const glowAnim = useSharedValue(0);

  useEffect(() => {
    glowAnim.value = withRepeat(
      withTiming(1, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowAnim.value, [0, 1], [0.4, 0.8]);
    return {
      opacity,
    };
  });

  useEffect(() => {
    if (session?.user) {
      loadData();
    }
  }, [session]);

  const loadData = async () => {
    if (!session?.user) return;
    setLoading(true);

    try {
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

      // Load top rewards
      if (profileGym?.home_gym_id) {
        const { data: rewardsData } = await supabase
          .from('rewards')
          .select('*')
          .eq('gym_id', profileGym.home_gym_id)
          .limit(3)
          .order('price', { ascending: true });

        setTopRewards(rewardsData || []);
      }

      // Load leaderboard rank (mock for now - TODO: implement actual ranking)
      setLeaderboardRank(12);
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQRPress = () => {
    // Mock: Go directly to workout screen
    router.push('/workout');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const totalDrops = profile?.total_drops || 0;
  const challengeProgressValue = challengeProgress?.current_drops || 0;
  const challengeTarget = dailyChallenge?.target_drops || 500;
  const progressRatio = Math.min(challengeProgressValue / challengeTarget, 1);
  const streakDays = 3; // Mock for now - TODO: calculate from sessions
  const nextMilestone = Math.max(500 - challengeProgressValue, 0); // Mock milestone

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Radial gradient background */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {profile?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.username}>{profile?.username || 'User'}</Text>
          </View>

          {/* Wallet Widget */}
          <TouchableOpacity
            style={styles.walletWidget}
            onPress={() => router.push('/wallet')}
            activeOpacity={0.8}
          >
            <View style={styles.walletBlur}>
              <Ionicons name="water" size={18} color={theme.colors.primary} />
              <Text style={[styles.walletAmount, getNumberStyle(18)]}>
                {totalDrops.toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Daily Challenge Card */}
        <TouchableOpacity
          style={styles.challengeCard}
          onPress={() => router.push('/challenges')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#0A1A2E', '#1A1A2E', '#0F0F1E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.challengeGradient}
          >
            <View style={styles.cardBlur}>
              <View style={styles.challengeHeader}>
                <Text style={styles.challengeTitle}>Daily Challenge</Text>
                <Text style={styles.challengeSubtitle}>Complete to earn bonus drops</Text>
              </View>

              <View style={styles.challengeContent}>
                {/* Water Drop Icon with Dollar Sign */}
                <View style={styles.dropIconContainer}>
                  <View style={styles.dropIconWrapper}>
                    <Ionicons name="water" size={64} color={theme.colors.primary} />
                    <View style={styles.dollarSignContainer}>
                      <Text style={styles.dollarSign}>$</Text>
                    </View>
                  </View>
                  {/* Progress Text */}
                  <Text style={styles.progressText}>
                    <Text style={[styles.progressNumber, getNumberStyle(16)]}>
                      {Math.round(challengeProgressValue)}
                    </Text>
                    {' / '}
                    <Text style={[styles.progressNumber, getNumberStyle(16)]}>
                      {challengeTarget}
                    </Text>
                    {' drops'}
                  </Text>
                </View>

                <View style={styles.challengeStats}>
                  {/* Next Milestone */}
                  <View style={styles.milestoneContainer}>
                    <Text style={styles.milestoneText}>
                      💧 {nextMilestone} more drops to unlock Free Coffee
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Bottom Cards Row */}
        <View style={styles.bottomCardsRow}>
          {/* Rewards Store Card */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => router.push('/store')}
            activeOpacity={0.9}
          >
            <View style={styles.featureCardBlur}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Rewards Store</Text>
                <Text style={styles.cardSubtitle}>
                  Redeem your drops for exclusive rewards
                </Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardAction}>View Store</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* Leaderboards Card */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={() => router.push('/leaderboard')}
            activeOpacity={0.9}
          >
            <View style={styles.featureCardBlur}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Leaderboards</Text>
                <Text style={styles.cardSubtitle}>
                  Compete with others in your gym
                </Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={styles.cardAction}>View Rankings</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* QR Scanner FAB with Glow */}
      <View style={styles.fabContainer}>
        <Animated.View style={[styles.fabGlow, glowStyle]} />
        <TouchableOpacity
          style={styles.fab}
          onPress={handleQRPress}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[theme.colors.primary, theme.colors.primaryDark]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="qr-code" size={48} color={theme.colors.background} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 140, // Space for QR button
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
    fontFamily: theme.typography.fontFamily.monospace,
  },
  username: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  walletWidget: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  walletBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  walletAmount: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  challengeCard: {
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  challengeGradient: {
    borderRadius: theme.borderRadius.xl,
  },
  cardBlur: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    flex: 1,
    justifyContent: 'space-between',
  },
  challengeHeader: {
    marginBottom: theme.spacing.lg,
  },
  challengeTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.5,
  },
  challengeSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  dropIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
  },
  dropIconWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  dollarSignContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  dollarSign: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontFamily: theme.typography.fontFamily.monospace,
  },
  challengeStats: {
    flex: 1,
    gap: theme.spacing.md,
    minWidth: 0, // Allow flexbox to shrink
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.secondary + '15',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.secondary + '30',
  },
  streakText: {
    color: theme.colors.secondary,
    fontWeight: 'bold',
  },
  milestoneContainer: {
    backgroundColor: theme.colors.primary + '10',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
  },
  milestoneText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    letterSpacing: 0.3,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  progressNumber: {
    color: theme.colors.primary,
  },
  bottomCardsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  featureCard: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.glass.border,
    backgroundColor: theme.glass.background,
    minHeight: 140,
  },
  featureCardBlur: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    flex: 1,
    justifyContent: 'space-between',
  },
  cardHeader: {
    marginBottom: theme.spacing.sm,
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
    flexShrink: 1,
  },
  cardSubtitle: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    lineHeight: theme.typography.lineHeight.normal * theme.typography.fontSize.xs,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardAction: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
  rankIconStack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  rankIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primary + '40',
    marginLeft: -6,
  },
  rankIcon1: {
    zIndex: 3,
    marginLeft: 0,
    backgroundColor: theme.colors.secondary + '20',
    borderColor: theme.colors.secondary + '40',
  },
  rankIcon2: {
    zIndex: 2,
  },
  rankIcon3: {
    zIndex: 1,
  },
  rankIconText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontFamily: theme.typography.fontFamily.monospace,
  },
  rankText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  fabContainer: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    opacity: 0.4,
  },
  fab: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
