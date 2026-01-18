import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';
import BackButton from '@/components/BackButton';

interface GymWithPlans {
  id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  primary_color: string | null;
  plan_count: number;
}

export default function SmartCoachScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { theme: currentTheme } = useTheme();
  const [gyms, setGyms] = useState<GymWithPlans[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[SmartCoach] useEffect triggered, session:', session?.user?.id);
    if (session?.user) {
      loadGymsWithPlans();
    } else {
      console.warn('[SmartCoach] No session, skipping loadGymsWithPlans');
      setLoading(false);
    }
  }, [session]);

  const loadGymsWithPlans = async () => {
    console.log('[SmartCoach] loadGymsWithPlans called');
    if (!session?.user) {
      console.warn('[SmartCoach] No session user, returning');
      setLoading(false);
      return;
    }

    // Ensure loading state is true when starting to load
    setLoading(true);
    console.log('[SmartCoach] Starting to load gyms with plans...');
    try {
      // Get user's home_gym_id to check gym membership
      const { data: profileData } = await supabase
        .from('profiles')
        .select('home_gym_id')
        .eq('id', session.user.id)
        .single();

      const userHomeGymId = profileData?.home_gym_id;

      // Fetch gyms that have workout plans (public or gym_members_only if user is a member)
      // RLS will automatically filter based on home_gym_id - trust RLS to do the filtering
      // We only need to check is_active, RLS handles access_level
      // First, get plans without foreign key to test RLS
      const { data: plansData, error: plansError } = await supabase
        .from('workout_plans')
        .select('gym_id, access_level')
        .eq('is_active', true);

      console.log('[SmartCoach] User home_gym_id:', userHomeGymId);
      console.log('[SmartCoach] Plans query error:', plansError);
      console.log('[SmartCoach] Plans data count:', plansData?.length || 0);
      console.log('[SmartCoach] Plans data:', plansData);

      if (plansError) {
        console.error('Error loading plans:', plansError);
        setLoading(false);
        return;
      }

      if (!plansData || plansData.length === 0) {
        console.warn('[SmartCoach] No plans found - RLS may be blocking or no plans exist');
        setGyms([]);
        setLoading(false);
        return;
      }

      // Get unique gym IDs from plans
      const uniqueGymIds = [...new Set(plansData.map((p: any) => p.gym_id).filter(Boolean))];
      console.log('[SmartCoach] Unique gym IDs:', uniqueGymIds);

      // Fetch gym details for those gym IDs
      const { data: gymsData, error: gymsError } = await supabase
        .from('gyms')
        .select('id, name, city, owner_id')
        .in('id', uniqueGymIds);

      console.log('[SmartCoach] Gyms query error:', gymsError);
      console.log('[SmartCoach] Gyms data:', gymsData);

      if (gymsError) {
        console.error('Error loading gyms:', gymsError);
        setLoading(false);
        return;
      }

      // Create a map of gym_id -> gym data
      const gymsMap = new Map();
      gymsData?.forEach((gym: any) => {
        gymsMap.set(gym.id, gym);
      });

      console.log('[SmartCoach] gymsMap size:', gymsMap.size);

      // Load branding for all gyms from owner_branding
      const brandingMap = new Map<string, { primary_color: string; logo_url: string | null }>();
      const ownerIds = [...new Set(gymsData?.map((g: any) => g.owner_id).filter(Boolean) || [])];
      
      if (ownerIds.length > 0) {
        const { data: brandingData } = await supabase
          .from('owner_branding')
          .select('owner_id, primary_color, logo_url')
          .in('owner_id', ownerIds);

        brandingData?.forEach((branding: any) => {
          // Find all gyms with this owner_id
          gymsData?.forEach((gym: any) => {
            if (gym.owner_id === branding.owner_id) {
              brandingMap.set(gym.id, {
                primary_color: branding.primary_color || '#00E5FF',
                logo_url: branding.logo_url,
              });
            }
          });
        });
      }

      // Group plans by gym and count
      const gymMap = new Map<string, GymWithPlans>();

      console.log('[SmartCoach] Processing plans, count:', plansData?.length || 0);
      plansData?.forEach((plan: any, index: number) => {
        console.log(`[SmartCoach] Processing plan ${index}:`, plan);
        if (!plan.gym_id) {
          console.warn(`[SmartCoach] Plan ${index} has no gym_id`);
          return;
        }

        const gymId = plan.gym_id;
        const gym = gymsMap.get(gymId);

        console.log(`[SmartCoach] Plan ${index} gym_id: ${gymId}, gym found:`, !!gym);

        if (!gym) {
          console.warn('[SmartCoach] Gym not found for gym_id:', gymId);
          return; // Skip if gym not found
        }

        // RLS already filters, but double-check: if gym_members_only, user must be a member
        if (plan.access_level === 'gym_members_only' && plan.gym_id !== userHomeGymId) {
          console.warn('[SmartCoach] Skipping gym_members_only plan for non-member gym:', gymId, 'userHomeGymId:', userHomeGymId);
          return; // Skip this plan - user is not a member of this gym
        }

        console.log(`[SmartCoach] Adding plan ${index} to gymMap for gym_id: ${gymId}`);
        if (!gymMap.has(gymId)) {
          const branding = brandingMap.get(gymId) || { primary_color: '#00E5FF', logo_url: null };
          gymMap.set(gymId, {
            id: gymId,
            name: gym.name,
            city: gym.city,
            logo_url: branding.logo_url,
            primary_color: branding.primary_color,
            plan_count: 0,
          });
          console.log(`[SmartCoach] Created new gym entry for ${gymId}:`, gym.name);
        }

        const gymEntry = gymMap.get(gymId)!;
        gymEntry.plan_count += 1;
        console.log(`[SmartCoach] Incremented plan_count for ${gymId}, now:`, gymEntry.plan_count);
      });

      console.log('[SmartCoach] gymMap size after processing:', gymMap.size);

      // Convert map to array and sort by name
      const gymsList = Array.from(gymMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );

      console.log('[SmartCoach] Final gyms list:', gymsList.length, gymsList);
      setGyms(gymsList);
    } catch (error) {
      console.error('Error loading gyms with plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGymPress = (gymId: string) => {
    router.push({
      pathname: '/gym-plans',
      params: { gymId },
    });
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
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>SmartCoach</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
          <Text style={styles.loadingText}>Loading workout plans...</Text>
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
          <Text style={styles.headerTitle}>SmartCoach</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.subtitle}>
          Follow workout plans from your gym or trainers
        </Text>

        {/* Gyms with Plans */}
        {gyms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No workout plans available</Text>
            <Text style={styles.emptySubtext}>
              Ask your gym to create workout plans
            </Text>
          </View>
        ) : (
          <View style={styles.gymsList}>
            {gyms.map((gym) => (
              <TouchableOpacity
                key={gym.id}
                style={styles.gymCard}
                onPress={() => handleGymPress(gym.id)}
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
                  style={styles.gymCardGradient}
                >
                  <View style={styles.gymCardContent}>
                    {gym.logo_url ? (
                      <Image
                        source={{ uri: gym.logo_url }}
                        style={styles.gymLogo}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.gymLogoPlaceholder, { backgroundColor: gym.primary_color || currentTheme.colors.primary + '20' }]}>
                        <Ionicons name="fitness" size={32} color={gym.primary_color || currentTheme.colors.primary} />
                      </View>
                    )}
                    
                    <View style={styles.gymCardInfo}>
                      <Text style={styles.gymName}>{gym.name}</Text>
                      {gym.city && (
                        <Text style={styles.gymCity}>{gym.city}</Text>
                      )}
                      <View style={styles.planCountContainer}>
                        <Ionicons name="list" size={14} color={currentTheme.colors.primary} />
                        <Text style={styles.planCount}>
                          {gym.plan_count} {gym.plan_count === 1 ? 'plan' : 'plans'}
                        </Text>
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={24} color={currentTheme.colors.textSecondary} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Find Freelance Coach section (placeholder for future) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Find Freelance Coach</Text>
          <View style={styles.comingSoonCard}>
            <Ionicons name="person-outline" size={32} color={theme.colors.textSecondary} />
            <Text style={styles.comingSoonText}>Coming Soon</Text>
            <Text style={styles.comingSoonSubtext}>
              Connect with personal trainers
            </Text>
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
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 16,
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
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  gymsList: {
    gap: 12,
    marginBottom: 32,
  },
  gymCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  gymCardGradient: {
    padding: 16,
  },
  gymCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  gymLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  gymLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymCardInfo: {
    flex: 1,
    gap: 4,
  },
  gymName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  gymCity: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  planCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  planCount: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
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
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  comingSoonCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.2)',
    alignItems: 'center',
    gap: 8,
  },
  comingSoonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  comingSoonSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
});
