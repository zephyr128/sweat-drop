import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);

      const { data, error } = await supabase.rpc('get_user_badges', {
        p_user_id: authSession.user.id,
      });

      if (error) {
        console.error('Error loading badges:', error);
        return;
      }

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
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Celebration Header */}
        <Animated.View entering={FadeIn.delay(200).duration(600)} style={styles.celebrationHeader}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Workout Complete!</Text>
          <Text style={styles.subtitle}>Great job! Here's your summary</Text>
        </Animated.View>

        {/* Drops Hero */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
          <View style={[styles.dropsHero, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.dropsHeroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={[styles.dropsIconCircle, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                <Ionicons name="water" size={36} color={branding.primary} />
              </View>
              <Text style={[styles.dropsValue, getNumberStyle(48), { color: branding.primary }]}>
                +{drops || '0'}
              </Text>
              <Text style={styles.dropsLabel}>Drops Earned</Text>
            </BlurView>
          </View>
        </Animated.View>

        {/* Stats Row */}
        <Animated.View entering={FadeInDown.delay(550).duration(400)}>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="time" size={24} color={theme.colors.textSecondary} />
                <Text style={[styles.statValue, getNumberStyle(24)]}>
                  {formatTime(duration || '0')}
                </Text>
                <Text style={styles.statLabel}>Duration</Text>
              </BlurView>
            </View>
            {session?.equipment && (
              <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
                <BlurView intensity={50} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                  <Ionicons name="barbell-outline" size={24} color={theme.colors.textSecondary} />
                  <Text style={styles.statEquipment} numberOfLines={1}>
                    {session.equipment.name}
                  </Text>
                  <Text style={styles.statLabel}>Equipment</Text>
                </BlurView>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Percentile Card */}
        {percentile !== null && session?.gym && (
          <Animated.View entering={FadeInDown.delay(700).duration(400)}>
            <View style={[styles.percentileCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.percentileBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                  style={styles.percentileGlow}
                />
                <View style={styles.percentileContent}>
                  <Text style={styles.percentileEmoji}>🔥</Text>
                  <Text style={styles.percentileText}>
                    You beat <Text style={[getNumberStyle(16), { color: branding.primary }]}>{percentile}%</Text> of people
                    in {session.gym.name} today!
                  </Text>
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Earned Badges */}
        {earnedBadges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(850).duration(400)}>
            <View style={[styles.badgesSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.badgesBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <View style={styles.badgesHeader}>
                  <Ionicons name="trophy" size={20} color={branding.primary} />
                  <Text style={styles.badgesSectionTitle}>Badges Earned</Text>
                </View>
                <View style={styles.badgesGrid}>
                  {earnedBadges.map((badge) => (
                    <View key={badge.badge_id} style={[styles.badgeCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                      {badge.badge_image_url ? (
                        <Image
                          source={{ uri: badge.badge_image_url }}
                          style={styles.badgeImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.badgePlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                          <Ionicons name="trophy" size={28} color={branding.primary} />
                        </View>
                      )}
                      <Text style={styles.badgeName} numberOfLines={2}>
                        {badge.challenge_name}
                      </Text>
                    </View>
                  ))}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Action Button */}
        <Animated.View entering={FadeInDown.delay(1000).duration(400)}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: branding.primary }]}
            onPress={() => router.replace('/home')}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: branding.onPrimary }]}>Collect & Close</Text>
          </TouchableOpacity>
        </Animated.View>
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
    paddingBottom: theme.spacing['3xl'],
  },
  /* Celebration */
  celebrationHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
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
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    letterSpacing: 0.3,
  },
  /* Drops Hero */
  dropsHero: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  dropsHeroBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  dropsIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  dropsValue: {
    fontWeight: theme.typography.fontWeight.bold,
    marginBottom: theme.spacing.xs,
  },
  dropsLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Stats Row */
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statValue: {
    fontSize: 22,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
  },
  statEquipment: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Percentile */
  percentileCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  percentileBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  percentileGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.xl,
  },
  percentileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  percentileEmoji: {
    fontSize: 28,
  },
  percentileText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  /* Badges */
  badgesSection: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
  },
  badgesBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  badgesSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
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
  },
  badgeImage: {
    width: 56,
    height: 56,
    marginBottom: theme.spacing.sm,
  },
  badgePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  badgeName: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.3,
  },
  /* Button */
  button: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
