import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';

export default function SessionSummaryScreen() {
  const { sessionId, drops, duration } = useLocalSearchParams<{
    sessionId: string;
    drops: string;
    duration: string;
  }>();
  const [session, setSession] = useState<any>(null);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnedBadges, setEarnedBadges] = useState<any[]>([]);
  const router = useRouter();
  const { session: authSession } = useSession();
  const branding = useBranding();

  useEffect(() => {
    loadSession();
    calculatePercentile();
    loadEarnedBadges();
  }, []);

  const loadSession = async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('sessions')
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
      .eq('id', sessionId)
      .single();

    if (data) {
      setSession(data);
    }
    setLoading(false);
  };

  const calculatePercentile = async () => {
    if (!authSession?.user || !drops || !session) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: allSessions } = await supabase
      .from('sessions')
      .select('drops_earned')
      .eq('gym_id', session.gym_id)
      .gte('started_at', today.toISOString())
      .not('drops_earned', 'is', null);

    if (allSessions && allSessions.length > 0) {
      const dropsValue = parseInt(drops);
      const betterSessions = allSessions.filter(
        (s) => (s.drops_earned || 0) < dropsValue
      ).length;
      const calculatedPercentile = Math.round(
        (betterSessions / allSessions.length) * 100
      );
      setPercentile(calculatedPercentile);
    }
  };

  const formatTime = (seconds: string) => {
    const secs = parseInt(seconds);
    const mins = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${mins}m ${sec}s`;
  };

  const loadEarnedBadges = async () => {
    if (!authSession?.user) return;

    try {
      // Get badges earned in the last 5 minutes (newly earned)
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      const { data, error } = await supabase.rpc('get_user_badges', {
        p_user_id: authSession.user.id,
      });

      if (error) {
        console.error('Error loading badges:', error);
        return;
      }

      // Filter badges earned in last 5 minutes
      const newlyEarned = (data || []).filter((badge: any) => {
        const earnedAt = new Date(badge.earned_at);
        return earnedAt >= fiveMinutesAgo;
      });

      setEarnedBadges(newlyEarned);
    } catch (err) {
      console.error('Error in loadEarnedBadges:', err);
    }
  };

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Workout Complete!</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="water" size={32} color={theme.colors.primary} />
            <Text style={[styles.statValue, getNumberStyle(32)]}>
              +{drops || '0'}
            </Text>
            <Text style={styles.statLabel}>Drops</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="time" size={32} color={theme.colors.textSecondary} />
            <Text style={styles.statValue}>
              {formatTime(duration || '0')}
            </Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
        </View>

        {session?.equipment && (
          <View style={styles.equipmentCard}>
            <Text style={styles.equipmentLabel}>Equipment Used</Text>
            <Text style={styles.equipmentName}>{session.equipment.name}</Text>
          </View>
        )}

        {percentile !== null && session?.gym && (
          <View style={styles.percentileCard}>
            <Text style={styles.percentileText}>
              Today you beat {percentile}% of people in {session.gym.name}! 🔥
            </Text>
          </View>
        )}

        {/* Earned Badges Section */}
        {earnedBadges.length > 0 && (
          <View style={styles.badgesSection}>
            <Text style={styles.badgesSectionTitle}>Earned Badges</Text>
            <View style={styles.badgesGrid}>
              {earnedBadges.map((badge) => (
                <View key={badge.badge_id} style={styles.badgeCard}>
                  {badge.badge_image_url ? (
                    <Image
                      source={{ uri: badge.badge_image_url }}
                      style={styles.badgeImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.badgePlaceholder, { backgroundColor: branding.primaryLight }]}>
                      <Ionicons name="trophy" size={32} color={branding.primary} />
                    </View>
                  )}
                  <Text style={styles.badgeName} numberOfLines={2}>
                    {badge.challenge_name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/home')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Collect & Close</Text>
        </TouchableOpacity>
      </ScrollView>
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statValue: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginVertical: theme.spacing.sm,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  equipmentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  equipmentLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  equipmentName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  percentileCard: {
    backgroundColor: theme.colors.secondary + '15',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.secondary + '30',
  },
  percentileText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.secondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '50',
  },
  buttonText: {
    color: '#000000',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
  badgesSection: {
    marginBottom: theme.spacing.lg,
  },
  badgesSectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.5,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  badgeCard: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  badgeImage: {
    width: 64,
    height: 64,
    marginBottom: theme.spacing.sm,
  },
  badgePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  badgeName: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
  },
});
