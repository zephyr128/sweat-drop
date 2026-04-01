import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
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
  items: WorkoutPlanItem[];
}

interface WorkoutPlanItem {
  id: string;
  order_index: number;
  exercise_name: string;
  exercise_description: string | null;
  target_machine_type: string;
  target_metric: string;
  target_value: number;
  target_unit: string | null;
  rest_seconds: number;
  sets: number;
}

export default function PlanDetailScreen() {
  const { t } = useTranslation('plans');
  const router = useRouter();
  const params = useLocalSearchParams();
  const planId = params.planId as string;

  const { session } = useSession();
  const branding = useBranding();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (planId && session?.user) {
      loadPlanDetails();
    } else if (!planId) {
      setLoading(false);
    }
  }, [planId, session?.user]);

  const loadPlanDetails = async () => {
    if (!planId || !session?.user) {
      setLoading(false);
      return;
    }

    try {
      const { data: planData, error: planError } = await supabase
        .from('workout_plans')
        .select(`
          id, name, description, difficulty_level,
          estimated_duration_minutes, category,
          items:workout_plan_items(*)
        `)
        .eq('id', planId)
        .eq('is_active', true)
        .single();

      if (planError) {
        log.error('[PlanDetail] Error loading plan:', planError);
        setLoading(false);
        return;
      }

      if (!planData) {
        setLoading(false);
        return;
      }

      const sortedItems = (planData.items || []).sort(
        (a: WorkoutPlanItem, b: WorkoutPlanItem) => a.order_index - b.order_index
      );

      setPlan({ ...planData, items: sortedItems });
    } catch (error) {
      log.error('Error loading plan details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!session?.user || !planId) return;

    setSubscribing(true);
    try {
      const { data: existingSubscription } = await supabase
        .from('active_subscriptions')
        .select('id, current_exercise_index')
        .eq('user_id', session.user.id)
        .eq('plan_id', planId)
        .eq('status', 'active')
        .single();

      let subscriptionId = existingSubscription?.id;
      let currentExerciseIndex = existingSubscription?.current_exercise_index || 0;

      if (!existingSubscription) {
        const { data: newSubscription, error: subscribeError } = await supabase
          .from('active_subscriptions')
          .insert({
            user_id: session.user.id,
            plan_id: planId,
            subscription_type: 'plan',
            status: 'active',
            current_exercise_index: 0,
          })
          .select('id, current_exercise_index')
          .single();

        if (subscribeError) {
          log.error('Error subscribing to plan:', subscribeError);
          return;
        }

        subscriptionId = newSubscription?.id;
        currentExerciseIndex = newSubscription?.current_exercise_index || 0;
      }

      const currentPlanItem = plan?.items?.find((item) => item.order_index === currentExerciseIndex);

      if (!currentPlanItem) {
        log.error('Current plan item not found for index:', currentExerciseIndex);
        return;
      }

      router.push({
        pathname: '/scan',
        params: {
          planId,
          subscriptionId: subscriptionId || '',
          planItemId: currentPlanItem.id,
          exerciseIndex: currentExerciseIndex.toString(),
        },
      });
    } catch (error) {
      log.error('Error subscribing:', error);
    } finally {
      setSubscribing(false);
    }
  };

  const formatExercise = (item: WorkoutPlanItem) => {
    const machineType = item.target_machine_type === 'bike' ? t('bike') : t('treadmill');
    const value = item.target_value;
    const unit =
      item.target_unit ||
      (item.target_metric === 'time'
        ? t('min')
        : item.target_metric === 'distance'
        ? 'km'
        : item.target_metric === 'reps'
        ? 'reps'
        : '');

    if (item.target_metric === 'time') {
      return `${machineType}: ${value} ${unit} ${t('session')}`;
    } else if (item.target_metric === 'distance') {
      return `${machineType}: ${value} ${unit} ${t('running')}`;
    } else if (item.target_metric === 'reps' && item.sets > 1) {
      return `${machineType}: ${item.sets}x${value} ${item.target_metric}`;
    } else {
      return `${machineType}: ${value}${unit ? ' ' + unit : ''} ${item.target_metric}`;
    }
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <ScreenHeader title={t('planDetails')} insetHandled />
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('planNotFound')}</Text>
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

      <ScreenHeader title={plan.name} insetHandled />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan Info Card */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.planInfoCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.planInfoBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {plan.description && (
                <Text style={styles.planDescription}>{plan.description}</Text>
              )}
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
                    <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.metadataText}>{plan.estimated_duration_minutes} {t('min')}</Text>
                  </View>
                )}
                {plan.category && (
                  <View style={styles.metadataItem}>
                    <Ionicons name="pricetag-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.metadataText}>{plan.category}</Text>
                  </View>
                )}
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* Exercises Section */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <View style={styles.exercisesSection}>
            <Text style={styles.sectionTitle}>
              {t('exercises')} <Text style={{ color: theme.colors.textSecondary }}>({plan.items.length})</Text>
            </Text>

            {plan.items.length === 0 ? (
              <View style={styles.emptyExercises}>
                <Text style={styles.emptyExercisesText}>{t('noExercises')}</Text>
              </View>
            ) : (
              <View style={styles.exercisesList}>
                {plan.items.map((item, index) => (
                  <Animated.View key={item.id} entering={FadeInDown.delay(300 + index * 60).duration(400)}>
                    <View style={[styles.exerciseItem, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
                      <BlurView intensity={50} tint="dark" style={[styles.exerciseBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                        <View style={[styles.exerciseNumber, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                          <Text style={[styles.exerciseNumberText, getNumberStyle(14), { color: branding.primary }]}>
                            {index + 1}
                          </Text>
                        </View>
                        <View style={styles.exerciseContent}>
                          <Text style={styles.exerciseName}>{item.exercise_name}</Text>
                          <Text style={[styles.exerciseDetail, { color: branding.primary }]}>
                            {formatExercise(item)}
                          </Text>
                          {item.exercise_description && (
                            <Text style={styles.exerciseDescription}>{item.exercise_description}</Text>
                          )}
                          {item.rest_seconds > 0 && (
                            <View style={[styles.restBadge, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                              <Ionicons name="pause-outline" size={12} color={branding.primary} />
                              <Text style={[styles.restText, { color: branding.primary }]}>
                                {t('rest', { seconds: item.rest_seconds })}
                              </Text>
                            </View>
                          )}
                        </View>
                      </BlurView>
                    </View>
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        </Animated.View>

        {/* Start Button */}
        <Animated.View entering={FadeInDown.delay(600).duration(400)}>
          <TouchableOpacity
            style={[styles.startButton, subscribing && styles.startButtonDisabled]}
            onPress={handleSubscribe}
            disabled={subscribing}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[branding.primary, hexToRgba(branding.primary, 0.8)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startButtonGradient}
            >
              {subscribing ? (
                <ActivityIndicator size="small" color={branding.onPrimary} />
              ) : (
                <>
                  <Ionicons name="play-circle" size={22} color={branding.onPrimary} />
                  <Text style={[styles.startButtonText, { color: branding.onPrimary }]}>
                    {t('startThisPlan')}
                  </Text>
                </>
              )}
            </LinearGradient>
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
  /* Plan Info Card */
  planInfoCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
  },
  planInfoBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  planDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  planMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  difficultyBadge: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 5,
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
    gap: 6,
  },
  metadataText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Exercises */
  exercisesSection: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.heading,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    letterSpacing: 0.3,
  },
  exercisesList: {
    gap: theme.spacing.sm,
  },
  exerciseItem: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  exerciseBlur: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  exerciseNumberText: {
    ...fontStyles.heading,
  },
  exerciseContent: {
    flex: 1,
    gap: 4,
  },
  exerciseName: {
    fontSize: theme.typography.fontSize.base,
    ...fontStyles.bodySemiBold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  exerciseDetail: {
    fontSize: theme.typography.fontSize.sm,
    ...fontStyles.bodyMedium,
    letterSpacing: 0.3,
  },
  exerciseDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  restBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  restText: {
    fontSize: theme.typography.fontSize.xs,
    ...fontStyles.bodyMedium,
    letterSpacing: 0.3,
  },
  emptyExercises: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyExercisesText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['3xl'],
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.bodySemiBold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  /* Start Button */
  startButton: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonGradient: {
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  startButtonText: {
    fontSize: theme.typography.fontSize.lg,
    ...fontStyles.heading,
    letterSpacing: 0.5,
  },
});
