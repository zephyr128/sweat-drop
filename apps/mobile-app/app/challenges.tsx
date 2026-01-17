import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';

export default function ChallengesScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const [challenges, setChallenges] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadChallenges();
    }
  }, [session]);

  useEffect(() => {
    if (challenges.length > 0) {
      loadProgress();
    }
    setLoading(false);
  }, [challenges]);

  const loadChallenges = async () => {
    if (!session?.user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;

    if (!gymId) {
      setChallenges([]);
      return;
    }

    // Use the same RPC function as home screen to get consistent results
    const { data, error } = await supabase.rpc('get_active_challenges_for_user', {
      p_user_id: session.user.id,
      p_gym_id: gymId,
      p_machine_type: null, // Get all machine types
    });

    if (error) {
      console.error('Error loading challenges:', error);
      setChallenges([]);
      return;
    }

    // Transform the RPC result to match the expected format
    if (data) {
      // Fetch full challenge details for each challenge
      const challengeIds = data.map((c: any) => c.challenge_id);
      if (challengeIds.length > 0) {
        const { data: fullChallenges, error: fullError } = await supabase
          .from('challenges')
          .select('*')
          .in('id', challengeIds);

        if (fullError) {
          console.error('Error loading full challenge details:', fullError);
          setChallenges([]);
          return;
        }

        // Merge RPC data with full challenge data
        const mergedChallenges = (fullChallenges || []).map((challenge: any) => {
          const progressData = data.find((p: any) => p.challenge_id === challenge.id);
          return {
            ...challenge,
            progress: progressData,
          };
        });

        setChallenges(mergedChallenges);
      } else {
        setChallenges([]);
      }
    } else {
      setChallenges([]);
    }
  };

  const loadProgress = async () => {
    if (!session?.user) return;

    // Progress is already loaded in loadChallenges via RPC
    // Just create a map from the progress data
    const progressMap: Record<string, any> = {};
    challenges.forEach((c: any) => {
      if (c.progress) {
        progressMap[c.id] = {
          current_drops: c.progress.current_minutes, // Map minutes to drops for display
          current_minutes: c.progress.current_minutes,
          is_completed: c.progress.is_completed,
        };
      }
    });
    setProgress(progressMap);
  };

  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getChallengeTypeLabel = (type: string) => {
    switch (type) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'streak':
        return 'Streak';
      default:
        return type;
    }
  };

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
        <Text style={styles.headerTitle}>Challenges</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {challenges.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No active challenges</Text>
          </View>
        ) : (
          challenges.map((challenge: any) => {
            const userProgress = progress[challenge.id];
            const currentMinutes = userProgress?.current_minutes || 0;
            const requiredMinutes = challenge.required_minutes || challenge.target_drops || 0;
            const progressPercent = requiredMinutes > 0 
              ? Math.min((currentMinutes / requiredMinutes) * 100, 100)
              : 0;
            const isCompleted = userProgress?.is_completed || false;

            // Determine challenge type label
            const challengeTypeLabel = challenge.frequency 
              ? (challenge.frequency === 'daily' ? 'Daily' : challenge.frequency === 'weekly' ? 'Weekly' : 'One-Time')
              : getChallengeTypeLabel(challenge.challenge_type || 'one-time');

            return (
              <TouchableOpacity
                key={challenge.id}
                style={styles.challengeCard}
                onPress={() => {
                  router.push({
                    pathname: '/challenge-detail',
                    params: {
                      challengeId: challenge.id,
                      gymId: challenge.gym_id,
                    },
                  });
                }}
                activeOpacity={0.9}
              >
                <View style={styles.challengeHeader}>
                  <View>
                    <Text style={[styles.challengeType, { color: branding.primary }]}>
                      {challengeTypeLabel}
                    </Text>
                    <Text style={styles.challengeName}>{challenge.name}</Text>
                  </View>
                  {challenge.end_date && (
                    <Text style={styles.timeRemaining}>
                      {getTimeRemaining(challenge.end_date)}
                    </Text>
                  )}
                </View>

                {challenge.description && (
                  <Text style={styles.challengeDescription}>
                    {challenge.description}
                  </Text>
                )}

                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { backgroundColor: branding.primaryLight }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { 
                          width: `${progressPercent}%`,
                          backgroundColor: isCompleted ? theme.colors.secondary : branding.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    <Text style={[getNumberStyle(14), { color: branding.primary }]}>{currentMinutes}</Text>
                    {' / '}
                    <Text style={[getNumberStyle(14), { color: branding.primary }]}>{requiredMinutes}</Text>
                    {' min'}
                  </Text>
                </View>

                {challenge.drops_bounty > 0 && (
                  <View style={styles.rewardInfo}>
                    <Ionicons name="water" size={14} color="#00E5FF" />
                    <Text style={[styles.rewardText, { color: branding.primary }]}>
                      {challenge.drops_bounty} drops reward
                    </Text>
                  </View>
                )}

                {isCompleted && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedText}>
                      ✅ Completed! {challenge.drops_bounty || challenge.reward_drops || 0} drops earned
                    </Text>
                  </View>
                )}
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
  headerSpacer: {
    width: 40,
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
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  challengeType: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  timeRemaining: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  progressContainer: {
    marginTop: theme.spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
  },
  progressFillCompleted: {
    backgroundColor: theme.colors.secondary,
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  completedBadge: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.secondary + '15',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary + '30',
  },
  completedText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  rewardText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
});
