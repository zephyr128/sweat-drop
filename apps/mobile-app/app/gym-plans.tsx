import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, fontStyles, hexToRgba} from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import ScreenHeader from '@/components/ScreenHeader';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  difficulty_level: string | null;
  estimated_duration_minutes: number | null;
  category: string | null;
  thumbnail_url: string | null;
  items_count?: number;
}

export default function GymPlansScreen() {
  const { t } = useTranslation('plans');
  const router = useRouter();
  const params = useLocalSearchParams();
  const gymId = params.gymId as string;

  const { session } = useSession();
  const branding = useBranding();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (gymId && session?.user) {
      loadGymAndPlans();
    } else if (!gymId) {
      setLoading(false);
    }
  }, [gymId, session?.user]);

  const loadGymAndPlans = async () => {
    if (!gymId || !session?.user) {
      setLoading(false);
      return;
    }

    try {
      const { data: plansData, error: plansError } = await supabase
        .from('workout_plans')
        .select(`
          id, name, description, difficulty_level,
          estimated_duration_minutes, category, thumbnail_url,
          access_level,
          items:workout_plan_items(id)
        `)
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (plansError) {
        log.error('[GymPlans] Error loading plans:', plansError);
        setLoading(false);
        return;
      }

      const transformedPlans = (plansData || []).map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        difficulty_level: plan.difficulty_level,
        estimated_duration_minutes: plan.estimated_duration_minutes,
        category: plan.category,
        thumbnail_url: plan.thumbnail_url,
        items_count: plan.items?.length || 0,
      }));

      setPlans(transformedPlans);
    } catch (error) {
      log.error('Error loading gym and plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanPress = (planId: string) => {
    router.push({
      pathname: '/plan-detail',
      params: { planId },
    });
  };

  const getDifficultyColor = (difficulty: string | null) => {
    switch (difficulty) {
      case 'beginner': return '#4ade80';
      case 'intermediate': return '#facc15';
      case 'advanced': return '#f87171';
      case 'expert': return '#ef4444';
      default: return branding.primary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <ScreenHeader title={t('workoutPlans')} insetHandled />
        <View style={styles.loadingContainer}>
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

      <ScreenHeader title={t('workoutPlans')} insetHandled />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {plans.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noPlans')}</Text>
            <Text style={styles.emptySubtext}>{t('noPlansDesc')}</Text>
          </View>
        ) : (
          <View style={styles.plansList}>
            {plans.map((plan, index) => (
              <Animated.View key={plan.id} entering={FadeInDown.delay(100 + index * 80).duration(400)}>
                <TouchableOpacity
                  style={[styles.planCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                  onPress={() => handlePlanPress(plan.id)}
                  activeOpacity={0.8}
                >
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.planBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    <View style={styles.planCardHeader}>
                      <View style={styles.planCardInfo}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        {plan.description && (
                          <Text style={styles.planDescription} numberOfLines={2}>
                            {plan.description}
                          </Text>
                        )}
                      </View>
                      {plan.thumbnail_url && (
                        <Image
                          source={plan.thumbnail_url}
                          style={[styles.planThumbnail, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                          contentFit="cover"
                          transition={200}
                        />
                      )}
                    </View>

                    <View style={[styles.planCardFooter, { borderTopColor: hexToRgba(branding.primary, 0.08) }]}>
                      <View style={styles.planMetadata}>
                        {plan.difficulty_level && (
                          <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(plan.difficulty_level) + '20' }]}>
                            <Text style={[styles.difficultyText, { color: getDifficultyColor(plan.difficulty_level) }]}>
                              {plan.difficulty_level}
                            </Text>
                          </View>
                        )}
                        {plan.estimated_duration_minutes && (
                          <View style={styles.metadataItem}>
                            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                            <Text style={styles.metadataText}>
                              {plan.estimated_duration_minutes} {t('min')}
                            </Text>
                          </View>
                        )}
                        <View style={styles.metadataItem}>
                          <Ionicons name="list-outline" size={14} color={theme.colors.textSecondary} />
                          <Text style={styles.metadataText}>
                            {plan.items_count || 0} {t('exercises')}
                          </Text>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                    </View>
                  </PlatformBlur>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /* Plans List */
  plansList: {
    gap: theme.spacing.md,
  },
  planCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  planBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  planCardHeader: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  planCardInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  planName: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.heading,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  planDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  planThumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  planCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  planMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  difficultyBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.md,
  },
  difficultyText: {
    fontSize: theme.typography.fontSize.xs,
    ...fontStyles.bodySemiBold,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Empty */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['3xl'],
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.bodySemiBold,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
