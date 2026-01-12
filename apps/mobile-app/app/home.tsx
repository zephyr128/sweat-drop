import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useGymData } from '@/hooks/useGymData';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { getNumberStyle } from '@/lib/theme';
import { GymSelectorModal } from '@/components/GymSelectorModal';
import { LockedOverlay } from '@/components/LockedOverlay';
import { Gym } from '@/lib/stores/useGymStore';

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { theme, activeGym, isUnlocked } = useTheme();
  const { getActiveGymId, setPreviewGymId, setActiveGym, homeGymId, previewGymId } = useGymStore();
  const { updateHomeGym } = useGymData();
  const activeGymId = getActiveGymId();
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  
  const [profile, setProfile] = useState<any>(null);
  const [dailyChallenge, setDailyChallenge] = useState<any>(null);
  const [challengeProgress, setChallengeProgress] = useState<any>(null);
  const [topRewards, setTopRewards] = useState<any[]>([]);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [gymSelectorVisible, setGymSelectorVisible] = useState(false);

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

  // Load data when session or active gym changes
  useEffect(() => {
    if (session?.user) {
      loadData();
      refreshLocalDrops();
    }
  }, [session, homeGymId, previewGymId, activeGymId]);

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

      // Get active gym ID
      const activeGymId = getActiveGymId();

      if (activeGymId) {
        const today = new Date().toISOString().split('T')[0];
        const { data: challengeData } = await supabase
          .from('challenges')
          .select('*')
          .eq('gym_id', activeGymId)
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

        // Load top rewards
        const { data: rewardsData } = await supabase
          .from('rewards')
          .select('*')
          .eq('gym_id', activeGymId)
          .limit(3)
          .order('price', { ascending: true });

        setTopRewards(rewardsData || []);

        // Load leaderboard rank (mock for now - TODO: implement actual ranking)
        setLeaderboardRank(12);
      }
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQRPress = async () => {
    if (!isUnlocked) {
      Alert.alert(
        'Preview Mode',
        'You need to scan a QR code in this gym to unlock its features.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!session?.user || !activeGymId) {
      Alert.alert('Error', 'Please sign in and select a gym');
      return;
    }

    // Find first available equipment for this gym
    let { data: equipment, error: eqError } = await supabase
      .from('equipment')
      .select('id')
      .eq('gym_id', activeGymId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (eqError || !equipment) {
      console.error('Equipment lookup error:', eqError);
      console.log('Attempting to create default equipment for gym:', activeGymId);
      
      // Try to create a default equipment for this gym
      const { data: newEquipment, error: createError } = await supabase
        .from('equipment')
        .insert({
          gym_id: activeGymId,
          name: 'Default Equipment',
          qr_code: `GYM-${activeGymId.substring(0, 8).toUpperCase()}-DEFAULT-001`,
          equipment_type: 'cardio',
          is_active: true,
        })
        .select('id')
        .single();

      if (createError || !newEquipment) {
        console.error('Failed to create default equipment:', createError);
        Alert.alert(
          'No Equipment',
          'No equipment found for this gym. Please run the seed_equipment.sql script in Supabase or scan a QR code to start a workout.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Use the newly created equipment
      equipment = newEquipment;
    }

    // Create session before navigating
    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: session.user.id,
        gym_id: activeGymId,
        equipment_id: equipment.id,
        started_at: new Date().toISOString(),
        is_active: true,
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      Alert.alert('Error', `Failed to start workout: ${sessionError.message}`);
      return;
    }

    if (newSession) {
      router.push({
        pathname: '/workout',
        params: { sessionId: newSession.id },
      });
    }
  };

  const handleGymSelect = (gym: Gym) => {
    setPreviewGymId(gym.id);
    setActiveGym(gym);
  };

  const handleSetAsHomeGym = async () => {
    if (!activeGym) return;

    Alert.alert(
      'Set as Home Gym?',
      `Do you want to set "${activeGym.name}" as your home gym?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set as Home',
          onPress: async () => {
            try {
              await updateHomeGym(activeGym.id);
              // No need for alert - the UI will update automatically
              // The overlay will disappear because isUnlocked will become true
            } catch (error) {
              Alert.alert('Error', 'Failed to update home gym. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Get background gradient colors from gym or default
  const backgroundColors = activeGym?.background_url
    ? ['#000000', '#0A0E1A', '#000000'] // Keep dark gradient even with background image
    : ['#000000', '#0A0E1A', '#000000'];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Global drops for header (total_drops from profiles)
  const totalDrops = profile?.total_drops || 0;
  
  // Local drops for Daily Challenge (local_drops_balance from gym_memberships)
  // Use local drops for challenge progress to motivate staying at this gym
  const challengeProgressValue = localDrops || 0;
  const challengeTarget = dailyChallenge?.target_drops || 500;
  const progressRatio = Math.min(challengeProgressValue / challengeTarget, 1);
  const nextMilestone = Math.max(500 - challengeProgressValue, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Dynamic background */}
      {activeGym?.background_url ? (
        <ImageBackground
          source={{ uri: activeGym.background_url }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'rgba(10,14,26,0.9)', 'rgba(0,0,0,0.8)']}
            style={StyleSheet.absoluteFillObject}
          />
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={backgroundColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.avatarContainer, { borderColor: theme.colors.primary + '30' }]}>
              <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                {profile?.username?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <Text style={styles.username}>{profile?.username || 'User'}</Text>
          </View>

          <View style={styles.headerRight}>
            {/* Gym Selector Chip */}
            <TouchableOpacity
              style={[styles.gymSelectorChip, { borderColor: theme.colors.primary + '40' }]}
              onPress={() => setGymSelectorVisible(true)}
              activeOpacity={0.8}
            >
              {activeGym?.logo_url ? (
                <Image
                  source={{ uri: activeGym.logo_url }}
                  style={styles.gymSelectorLogo}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name="fitness" size={16} color={theme.colors.primary} />
              )}
              <Text style={[styles.gymSelectorText, { color: theme.colors.primary }]} numberOfLines={1}>
                {activeGym?.name || 'Select Gym'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={theme.colors.primary} />
            </TouchableOpacity>

            {/* Wallet Widget */}
            <TouchableOpacity
              style={styles.walletWidget}
              onPress={() => router.push('/wallet')}
              activeOpacity={0.8}
            >
              <View style={[styles.walletBlur, { borderColor: theme.colors.primary + '30' }]}>
                <Ionicons name="water" size={18} color={theme.colors.primary} />
                <Text style={[styles.walletAmount, getNumberStyle(18), { color: theme.colors.primary }]}>
                  {totalDrops.toLocaleString()}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cards Container with Overlay */}
        <View style={styles.cardsContainer}>
          {/* Single Locked Overlay for all cards (if in preview mode) */}
          {!isUnlocked && (
            <View style={styles.cardsOverlayContainer}>
              <LockedOverlay onSetAsHomeGym={handleSetAsHomeGym} />
            </View>
          )}

          {/* Daily Challenge Card */}
          <View style={styles.challengeCardWrapper}>
          <TouchableOpacity
            style={styles.challengeCard}
            onPress={() => {
              if (!isUnlocked) return;
              router.push('/challenges');
            }}
            activeOpacity={isUnlocked ? 0.9 : 1}
            disabled={!isUnlocked}
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
                      <Text style={[styles.progressNumber, getNumberStyle(16), { color: theme.colors.primary }]}>
                        {Math.round(challengeProgressValue)}
                      </Text>
                      {' / '}
                      <Text style={[styles.progressNumber, getNumberStyle(16), { color: theme.colors.primary }]}>
                        {challengeTarget}
                      </Text>
                      {' drops'}
                    </Text>
                  </View>

                  <View style={styles.challengeStats}>
                    {/* Next Milestone */}
                    <View style={[styles.milestoneContainer, { borderColor: theme.colors.primary + '20' }]}>
                      <Text style={styles.milestoneText}>
                        💧 {nextMilestone} more drops to unlock Free Coffee
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>

        </View>

        {/* Bottom Cards Row */}
        <View style={styles.bottomCardsRow}>
          {/* Rewards Store Card */}
          <View style={styles.featureCardWrapper}>
            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => {
                if (!isUnlocked) return;
                router.push('/store');
              }}
              activeOpacity={isUnlocked ? 0.9 : 1}
              disabled={!isUnlocked}
            >
              <View style={styles.featureCardBlur}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Rewards Store</Text>
                  <Text 
                    style={styles.cardSubtitle}
                    numberOfLines={2}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    Redeem your drops for exclusive rewards
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardAction, { color: theme.colors.primary }]}>View Store</Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Leaderboards Card */}
          <View style={styles.featureCardWrapper}>
            <TouchableOpacity
              style={styles.featureCard}
              onPress={() => {
                if (!isUnlocked) return;
                router.push('/leaderboard');
              }}
              activeOpacity={isUnlocked ? 0.9 : 1}
              disabled={!isUnlocked}
            >
              <View style={styles.featureCardBlur}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Leaderboards</Text>
                  <Text 
                    style={styles.cardSubtitle}
                    numberOfLines={2}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    Compete with others in your gym
                  </Text>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardAction, { color: theme.colors.primary }]}>View Rankings</Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </ScrollView>

      {/* QR Scanner FAB with Glow */}
      <View style={styles.fabContainer}>
        <Animated.View style={[styles.fabGlow, glowStyle, { backgroundColor: theme.colors.primary }]} />
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

      {/* Gym Selector Modal */}
      <GymSelectorModal
        visible={gymSelectorVisible}
        onClose={() => setGymSelectorVisible(false)}
        onSelectGym={handleGymSelect}
      />
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
    padding: 16,
    paddingBottom: 140, // Space for QR button
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Courier',
  },
  username: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  gymSelectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    maxWidth: 150,
  },
  gymSelectorLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  gymSelectorText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    flex: 1,
  },
  walletWidget: {
    borderRadius: 9999,
    overflow: 'hidden',
  },
  walletBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  walletAmount: {
    fontWeight: 'bold',
  },
  challengeCardWrapper: {
    borderRadius: 20,
    marginBottom: 24, // theme.spacing.lg
    overflow: 'hidden',
    position: 'relative',
  },
  challengeCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  challengeGradient: {
    borderRadius: 20,
  },
  cardBlur: {
    borderRadius: 20,
    padding: 32,
    flex: 1,
    justifyContent: 'space-between',
  },
  challengeHeader: {
    marginBottom: 24,
  },
  challengeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  challengeSubtitle: {
    fontSize: 14,
    color: '#B0B0B0',
    letterSpacing: 0.3,
  },
  challengeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
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
    marginBottom: 8,
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
    color: '#FFFFFF',
    fontFamily: 'Courier',
  },
  challengeStats: {
    flex: 1,
    gap: 16,
    minWidth: 0,
  },
  milestoneContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  milestoneText: {
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  progressText: {
    fontSize: 14,
    color: '#B0B0B0',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 4,
  },
  progressNumber: {
    // Color applied inline
  },
  bottomCardsRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch', // Ensure both cards have same height
    position: 'relative',
  },
  cardsContainer: {
    position: 'relative',
    zIndex: 1,
  },
  cardsOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'auto', // Block touches to cards, but QR button is outside this container
  },
  featureCardWrapper: {
    flex: 1,
    position: 'relative',
    height: 160, // Fixed height for consistency
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 1,
  },
  featureCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    height: '100%',
  },
  featureCardBlur: {
    borderRadius: 20,
    padding: 16, // theme.spacing.md
    flex: 1,
    justifyContent: 'space-between',
    height: '100%',
  },
  cardHeader: {
    marginBottom: 8,
    flex: 1,
    justifyContent: 'flex-start',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#B0B0B0',
    letterSpacing: 0.3,
    lineHeight: 16,
    minHeight: 32, // Reserve space for 2 lines
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardAction: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20, // Above overlay
  },
  fabGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.4,
  },
  fab: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    shadowColor: '#00E5FF',
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
