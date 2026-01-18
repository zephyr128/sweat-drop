import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';
import BackButton from '@/components/BackButton';

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
  const router = useRouter();
  const params = useLocalSearchParams();
  const planId = params.planId as string;
  
  const { session } = useSession();
  const { theme: currentTheme } = useTheme();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  console.log('[PlanDetail] Component rendered, planId:', planId);
  console.log('[PlanDetail] params:', params);

  useEffect(() => {
    if (planId && session?.user) {
      loadPlanDetails();
    } else if (!planId) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, session?.user]);

  const loadPlanDetails = async () => {
    if (!planId || !session?.user) {
      setLoading(false);
      return;
    }

    console.log('[PlanDetail] Loading plan with ID:', planId);

    try {
      const { data: planData, error: planError } = await supabase
        .from('workout_plans')
        .select(`
          id,
          name,
          description,
          difficulty_level,
          estimated_duration_minutes,
          category,
          items:workout_plan_items(*)
        `)
        .eq('id', planId)
        .eq('is_active', true)
        .single();

      console.log('[PlanDetail] Plan query result:', { planData, planError });

      if (planError) {
        console.error('[PlanDetail] Error loading plan:', planError);
        console.error('[PlanDetail] Error code:', planError.code);
        console.error('[PlanDetail] Error message:', planError.message);
        setLoading(false);
        return;
      }

      if (!planData) {
        console.warn('[PlanDetail] Plan data is null for planId:', planId);
        setLoading(false);
        return;
      }

      // Sort items by order_index
      const sortedItems = (planData.items || []).sort((a: WorkoutPlanItem, b: WorkoutPlanItem) => 
        a.order_index - b.order_index
      );

      setPlan({
        ...planData,
        items: sortedItems,
      });
    } catch (error) {
      console.error('Error loading plan details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!session?.user || !planId) return;

    setSubscribing(true);
    try {
      // Check if user already has an active subscription
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
        // Create new subscription
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
          console.error('Error subscribing to plan:', subscribeError);
          return;
        }

        subscriptionId = newSubscription?.id;
        currentExerciseIndex = newSubscription?.current_exercise_index || 0;
      }

      // Get current plan item based on current_exercise_index
      const currentPlanItem = plan?.items?.find(item => item.order_index === currentExerciseIndex);
      
      if (!currentPlanItem) {
        console.error('Current plan item not found for index:', currentExerciseIndex);
        return;
      }

      // Navigate to scan screen with plan parameters - user needs to scan QR code on machine to start workout
      // Pass plan parameters so ScannerScreen knows this is a plan-based workout
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
      console.error('Error subscribing:', error);
    } finally {
      setSubscribing(false);
    }
  };

  const formatExercise = (item: WorkoutPlanItem) => {
    const machineType = item.target_machine_type === 'bike' ? 'Bike' : 'Treadmill';
    const value = item.target_value;
    const unit = item.target_unit || 
      (item.target_metric === 'time' ? 'min' : 
       item.target_metric === 'distance' ? 'km' : 
       item.target_metric === 'reps' ? 'reps' : '');
    
    if (item.target_metric === 'time') {
      return `${machineType}: ${value} ${unit} session`;
    } else if (item.target_metric === 'distance') {
      return `${machineType}: ${value} ${unit} running`;
    } else if (item.target_metric === 'reps' && item.sets > 1) {
      return `${machineType}: ${item.sets}x${value} ${item.target_metric}`;
    } else {
      return `${machineType}: ${value}${unit ? ' ' + unit : ''} ${item.target_metric}`;
    }
  };

  const getDifficultyColor = (difficulty: string | null) => {
    switch (difficulty) {
      case 'beginner':
        return '#4ade80';
      case 'intermediate':
        return '#facc15';
      case 'advanced':
        return '#f87171';
      case 'expert':
        return '#ef4444';
      default:
        return currentTheme.colors.primary;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>Plan Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Plan not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {plan.name}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Plan Info */}
        <View style={styles.planInfo}>
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
                <Text style={styles.metadataText}>
                  {plan.estimated_duration_minutes} min
                </Text>
              </View>
            )}
            {plan.category && (
              <View style={styles.metadataItem}>
                <Ionicons name="pricetag-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={styles.metadataText}>{plan.category}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Exercises List */}
        <View style={styles.exercisesSection}>
          <Text style={styles.sectionTitle}>Exercises ({plan.items.length})</Text>
          
          {plan.items.length === 0 ? (
            <View style={styles.emptyExercises}>
              <Text style={styles.emptyExercisesText}>No exercises defined</Text>
            </View>
          ) : (
            <View style={styles.exercisesList}>
              {plan.items.map((item, index) => (
                <View key={item.id} style={styles.exerciseItem}>
                  <View style={styles.exerciseNumber}>
                    <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.exerciseContent}>
                    <Text style={styles.exerciseName}>{item.exercise_name}</Text>
                    <Text style={styles.exerciseDetail}>{formatExercise(item)}</Text>
                    {item.exercise_description && (
                      <Text style={styles.exerciseDescription}>{item.exercise_description}</Text>
                    )}
                    {item.rest_seconds > 0 && (
                      <View style={styles.restBadge}>
                        <Ionicons name="pause-outline" size={12} color={theme.colors.primary} />
                        <Text style={styles.restText}>
                          {item.rest_seconds}s rest
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, subscribing && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={subscribing}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[currentTheme.colors.primary, currentTheme.colors.primaryDark || currentTheme.colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribeButtonGradient}
          >
            {subscribing ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#000000" />
                <Text style={styles.subscribeButtonText}>Start This Plan</Text>
              </>
            )}
          </LinearGradient>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    pointerEvents: 'none', // Don't block touch events
    flex: 1,
    textAlign: 'center',
  },
  planInfo: {
    marginBottom: 24,
    gap: 12,
  },
  planDescription: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
  planMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  exercisesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  exercisesList: {
    gap: 12,
  },
  exerciseItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.1)',
  },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  exerciseContent: {
    flex: 1,
    gap: 4,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  exerciseDetail: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  exerciseDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  restBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.primary + '10',
  },
  restText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  emptyExercises: {
    padding: 24,
    alignItems: 'center',
  },
  emptyExercisesText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subscribeButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  subscribeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
});
