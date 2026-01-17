import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { useBranding } from '@/lib/contexts/ThemeContext';

// Helper function to add alpha to hex color
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ChallengeDetailScreen() {
  const router = useRouter();
  const { challengeId, gymId } = useLocalSearchParams<{
    challengeId: string;
    gymId?: string;
  }>();
  const { session } = useSession();
  const branding = useBranding();
  const [challenge, setChallenge] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Load challenge progress for this specific challenge
  const { challenges: allChallenges } = useChallengeProgress(gymId || null, null);
  const challengeProgress = allChallenges.find((c) => c.challenge_id === challengeId);

  useEffect(() => {
    if (challengeId && session?.user) {
      loadChallenge();
    }
  }, [challengeId, session]);

  const loadChallenge = async () => {
    if (!challengeId || !session?.user) return;
    setLoading(true);

    try {
      const { data: challengeData, error: challengeError } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', challengeId)
        .single();

      if (challengeError) {
        console.error('Error loading challenge:', challengeError);
        setLoading(false);
        return;
      }

      setChallenge(challengeData);

      // Load user progress for this challenge
      const { data: progressData, error: progressError } = await supabase
        .from('user_challenge_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('challenge_id', challengeId)
        .single();

      if (progressError && progressError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        console.error('Error loading progress:', progressError);
      } else if (progressData) {
        setProgress(progressData);
      }
    } catch (error) {
      console.error('Error in loadChallenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h ${minutes}m left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily':
        return 'Daily Challenge';
      case 'weekly':
        return 'Weekly Challenge';
      case 'one-time':
        return 'One-Time Challenge';
      default:
        return 'Challenge';
    }
  };

  const getMachineTypeLabel = (machineType: string) => {
    switch (machineType) {
      case 'treadmill':
        return 'Treadmill';
      case 'bike':
        return 'Bike';
      case 'any':
        return 'Any Machine';
      default:
        return machineType;
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

  if (!challenge) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>Challenge</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Challenge not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Use progress from hook if available, otherwise use local state
  const currentMinutes = challengeProgress?.current_minutes || progress?.current_minutes || 0;
  const isCompleted = challengeProgress?.is_completed || progress?.is_completed || false;
  const requiredMinutes = challenge?.required_minutes || 0;
  const progressRatio = requiredMinutes > 0 ? Math.min(currentMinutes / requiredMinutes, 1) : 0;
  const dropsBounty = challenge?.drops_bounty || 0;

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
        <Text style={styles.headerTitle}>Challenge Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Challenge Card */}
        <View style={styles.challengeCard}>
          <LinearGradient
            colors={['#0A1A2E', '#1A1A2E', '#0F0F1E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.challengeGradient}
          >
            <View style={styles.challengeContent}>
              {/* Challenge Type Badge */}
              <View style={[
                styles.challengeTypeBadge,
                {
                  backgroundColor: branding.primaryLight,
                  borderColor: hexToRgba(branding.primary, 0.3),
                }
              ]}>
                <Text style={[styles.challengeTypeText, { color: branding.primary }]}>
                  {getFrequencyLabel(challenge.frequency || 'one-time')}
                </Text>
              </View>

              {/* Challenge Name */}
              <Text style={styles.challengeName}>{challenge.name}</Text>

              {/* Challenge Description */}
              {challenge.description && (
                <Text style={styles.challengeDescription}>{challenge.description}</Text>
              )}

              {/* Challenge Info */}
              <View style={styles.challengeInfo}>
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={18} color={branding.primary} />
                  <Text style={styles.infoText}>
                    {requiredMinutes} minutes required
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="bicycle-outline" size={18} color={branding.primary} />
                  <Text style={styles.infoText}>
                    {getMachineTypeLabel(challenge.machine_type || 'any')}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="water" size={18} color="#00E5FF" />
                  <Text style={styles.infoText}>
                    {dropsBounty} drops reward
                  </Text>
                </View>
                {challenge.end_date && (
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={18} color={branding.primary} />
                    <Text style={styles.infoText}>
                      {getTimeRemaining(challenge.end_date)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Progress Section */}
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Your Progress</Text>
                  <Text style={[styles.progressPercentage, { color: branding.primary }]}>
                    {Math.round(progressRatio * 100)}%
                  </Text>
                </View>

                {/* Progress Bar */}
                <View style={[styles.progressBar, { backgroundColor: branding.primaryLight }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressRatio * 100}%`,
                        backgroundColor: isCompleted
                          ? theme.colors.secondary
                          : branding.primary,
                      },
                    ]}
                  />
                </View>

                {/* Progress Text */}
                <View style={styles.progressTextContainer}>
                  <Text style={styles.progressText}>
                    <Text style={[getNumberStyle(24), { color: branding.primary }]}>
                      {currentMinutes}
                    </Text>
                    {' / '}
                    <Text style={[getNumberStyle(24), { color: branding.primary }]}>
                      {requiredMinutes}
                    </Text>
                    {' minutes'}
                  </Text>
                </View>

                {/* Remaining */}
                {!isCompleted && (
                  <Text style={styles.remainingText}>
                    {Math.max(requiredMinutes - currentMinutes, 0)} minutes remaining
                  </Text>
                )}
              </View>

              {/* Completed Badge */}
              {isCompleted && (
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.secondary} />
                  <Text style={styles.completedText}>
                    Challenge Completed! 🎉
                  </Text>
                  <Text style={styles.completedSubtext}>
                    You earned {dropsBounty} drops
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

        {/* How to Participate */}
        <View style={styles.howToSection}>
          <Text style={styles.howToTitle}>How to Participate</Text>
          <View style={styles.howToSteps}>
            <View style={styles.step}>
              <View style={[
                styles.stepNumber,
                {
                  backgroundColor: branding.primaryLight,
                  borderColor: hexToRgba(branding.primary, 0.3),
                }
              ]}>
                <Text style={[styles.stepNumberText, { color: branding.primary }]}>1</Text>
              </View>
              <Text style={styles.stepText}>
                Scan a QR code on a {getMachineTypeLabel(challenge.machine_type || 'any').toLowerCase()} machine
              </Text>
            </View>
            <View style={styles.step}>
              <View style={[
                styles.stepNumber,
                {
                  backgroundColor: branding.primaryLight,
                  borderColor: hexToRgba(branding.primary, 0.3),
                }
              ]}>
                <Text style={[styles.stepNumberText, { color: branding.primary }]}>2</Text>
              </View>
              <Text style={styles.stepText}>
                Start your workout and exercise for the required time
              </Text>
            </View>
            <View style={styles.step}>
              <View style={[
                styles.stepNumber,
                {
                  backgroundColor: branding.primaryLight,
                  borderColor: hexToRgba(branding.primary, 0.3),
                }
              ]}>
                <Text style={[styles.stepNumberText, { color: branding.primary }]}>3</Text>
              </View>
              <Text style={styles.stepText}>
                Complete the challenge to earn {dropsBounty} drops
              </Text>
            </View>
          </View>
        </View>
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
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  challengeCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  challengeGradient: {
    borderRadius: theme.borderRadius.xl,
  },
  challengeContent: {
    padding: theme.spacing.xl,
  },
  challengeTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  challengeTypeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.5,
  },
  challengeDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  challengeInfo: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  infoText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  progressSection: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  progressTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  progressPercentage: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  progressBar: {
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.borderRadius.md,
  },
  progressTextContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  progressText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  remainingText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  completedBadge: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(0, 255, 127, 0.1)',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 127, 0.3)',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  completedText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
  completedSubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  howToSection: {
    marginTop: theme.spacing.lg,
  },
  howToTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    letterSpacing: 0.5,
  },
  howToSteps: {
    gap: theme.spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
});
