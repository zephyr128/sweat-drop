import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
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
  thumbnail_url: string | null;
  items_count?: number;
}


export default function GymPlansScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const gymId = params.gymId as string;
  
  const { session } = useSession();
  const { theme: currentTheme } = useTheme();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (gymId && session?.user) {
      loadGymAndPlans();
    } else if (!gymId) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId, session?.user]);

  const loadGymAndPlans = async () => {
    if (!gymId || !session?.user) {
      setLoading(false);
      return;
    }

    try {
      // Load workout plans for this gym (public or gym_members_only if user is a member)
      // RLS will automatically filter based on home_gym_id - trust RLS to do the filtering
      // We only need to check gym_id and is_active, RLS handles access_level
      const { data: plansData, error: plansError } = await supabase
        .from('workout_plans')
        .select(`
          id,
          name,
          description,
          difficulty_level,
          estimated_duration_minutes,
          category,
          thumbnail_url,
          access_level,
          items:workout_plan_items(id)
        `)
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (plansError) {
        console.error('[GymPlans] Error loading plans:', plansError);
        setLoading(false);
        return;
      }

      // Transform plans with item counts
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
      console.error('Error loading gym and plans:', error);
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
      case 'beginner':
        return '#4ade80'; // Green
      case 'intermediate':
        return '#facc15'; // Yellow
      case 'advanced':
        return '#f87171'; // Red
      case 'expert':
        return '#ef4444'; // Dark Red
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
          <Text style={styles.headerTitle}>Workout Plans</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Plans List */}
        {plans.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No workout plans available</Text>
            <Text style={styles.emptySubtext}>
              This gym hasn't created any workout plans yet
            </Text>
          </View>
        ) : (
          <View style={styles.plansList}>
            {plans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={styles.planCard}
                onPress={() => handlePlanPress(plan.id)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[
                    'rgba(0, 229, 255, 0.1)',
                    'rgba(0, 229, 255, 0.05)',
                    'rgba(0, 229, 255, 0.1)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.planCardGradient}
                >
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
                        source={{ uri: plan.thumbnail_url }}
                        style={styles.planThumbnail}
                        resizeMode="cover"
                      />
                    )}
                  </View>

                  <View style={styles.planCardFooter}>
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
                            {plan.estimated_duration_minutes} min
                          </Text>
                        </View>
                      )}
                      <View style={styles.metadataItem}>
                        <Ionicons name="list-outline" size={14} color={theme.colors.textSecondary} />
                        <Text style={styles.metadataText}>
                          {plan.items_count || 0} exercises
                        </Text>
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={20} color={currentTheme.colors.textSecondary} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
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
  plansList: {
    gap: 12,
  },
  planCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  planCardGradient: {
    padding: 16,
  },
  planCardHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  planCardInfo: {
    flex: 1,
    gap: 6,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  planDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  planThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  planCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 229, 255, 0.1)',
  },
  planMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
