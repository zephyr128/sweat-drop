import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, fontStyles } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import BackButton from '@/components/BackButton';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface GymWithPlans {
  id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  primary_color: string | null;
  plan_count: number;
}

export default function SmartCoachScreen() {
  const { t } = useTranslation('smartcoach');
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const [gyms, setGyms] = useState<GymWithPlans[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadGymsWithPlans();
    } else {
      setLoading(false);
    }
  }, [session]);

  const loadGymsWithPlans = async () => {
    if (!session?.user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('home_gym_id')
        .eq('id', session.user.id)
        .single();

      const userHomeGymId = profileData?.home_gym_id;

      const { data: plansData, error: plansError } = await supabase
        .from('workout_plans')
        .select('gym_id, access_level')
        .eq('is_active', true);

      if (plansError) {
        console.error('Error loading plans:', plansError);
        setLoading(false);
        return;
      }

      if (!plansData || plansData.length === 0) {
        setGyms([]);
        setLoading(false);
        return;
      }

      const uniqueGymIds = [...new Set(plansData.map((p: any) => p.gym_id).filter(Boolean))];

      const { data: gymsData, error: gymsError } = await supabase
        .from('gyms')
        .select('id, name, city, owner_id')
        .in('id', uniqueGymIds);

      if (gymsError) {
        console.error('Error loading gyms:', gymsError);
        setLoading(false);
        return;
      }

      const gymsMap = new Map();
      gymsData?.forEach((gym: any) => {
        gymsMap.set(gym.id, gym);
      });

      // Load branding
      const brandingMap = new Map<string, { primary_color: string; logo_url: string | null }>();
      const ownerIds = [...new Set(gymsData?.map((g: any) => g.owner_id).filter(Boolean) || [])];

      if (ownerIds.length > 0) {
        const { data: brandingData } = await supabase
          .from('owner_branding')
          .select('owner_id, primary_color, logo_url')
          .in('owner_id', ownerIds);

        brandingData?.forEach((b: any) => {
          gymsData?.forEach((gym: any) => {
            if (gym.owner_id === b.owner_id) {
              brandingMap.set(gym.id, {
                primary_color: b.primary_color || '#00E5FF',
                logo_url: b.logo_url,
              });
            }
          });
        });
      }

      const gymMap = new Map<string, GymWithPlans>();

      plansData?.forEach((plan: any) => {
        if (!plan.gym_id) return;

        const gymId = plan.gym_id;
        const gym = gymsMap.get(gymId);
        if (!gym) return;

        if (plan.access_level === 'gym_members_only' && plan.gym_id !== userHomeGymId) {
          return;
        }

        if (!gymMap.has(gymId)) {
          const b = brandingMap.get(gymId) || { primary_color: '#00E5FF', logo_url: null };
          gymMap.set(gymId, {
            id: gymId,
            name: gym.name,
            city: gym.city,
            logo_url: b.logo_url,
            primary_color: b.primary_color,
            plan_count: 0,
          });
        }

        const gymEntry = gymMap.get(gymId)!;
        gymEntry.plan_count += 1;
      });

      const gymsList = Array.from(gymMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

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
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
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

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          {t('subtitle')}
        </Text>

        {gyms.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="fitness-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noPlans')}</Text>
            <Text style={styles.emptySubtext}>{t('noPlansDesc')}</Text>
          </View>
        ) : (
          <View style={styles.gymsList}>
            {gyms.map((gym, index) => (
              <Animated.View key={gym.id} entering={FadeInDown.delay(100 + index * 80).duration(400)}>
                <TouchableOpacity
                  style={[styles.gymCard, { borderColor: hexToRgba(gym.primary_color || branding.primary, 0.2) }]}
                  onPress={() => handleGymPress(gym.id)}
                  activeOpacity={0.8}
                >
                  <BlurView intensity={50} tint="dark" style={[styles.gymCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    <View style={styles.gymCardContent}>
                      {gym.logo_url ? (
                        <Image
                          source={{ uri: gym.logo_url }}
                          style={[styles.gymLogo, { borderColor: hexToRgba(gym.primary_color || branding.primary, 0.15) }]}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.gymLogoPlaceholder, { backgroundColor: hexToRgba(gym.primary_color || branding.primary, 0.1) }]}>
                          <Ionicons name="fitness" size={28} color={gym.primary_color || branding.primary} />
                        </View>
                      )}

                      <View style={styles.gymCardInfo}>
                        <Text style={styles.gymName}>{gym.name}</Text>
                        {gym.city && <Text style={styles.gymCity}>{gym.city}</Text>}
                        <View style={styles.planCountContainer}>
                          <Ionicons name="list" size={14} color={gym.primary_color || branding.primary} />
                          <Text style={[styles.planCount, { color: gym.primary_color || branding.primary }]}>
                            {t('plan', { count: gym.plan_count })}
                          </Text>
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                    </View>
                  </BlurView>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}

        {/* Freelance Coach Section */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('findFreelanceCoach')}</Text>
            <View style={[styles.comingSoonCard, { borderColor: hexToRgba(branding.primary, 0.1) }]}>
              <BlurView intensity={50} tint="dark" style={[styles.comingSoonBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="person-outline" size={32} color={theme.colors.textSecondary} />
                <Text style={styles.comingSoonText}>{t('comingSoon')}</Text>
                <Text style={styles.comingSoonSubtext}>{t('connectWithTrainers')}</Text>
              </BlurView>
            </View>
          </View>
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
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize['2xl'],
    ...fontStyles.heading,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 40,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  /* Gyms List */
  gymsList: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  gymCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  gymCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  gymCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  gymLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
  },
  gymLogoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymCardInfo: {
    flex: 1,
    gap: 3,
  },
  gymName: {
    fontSize: theme.typography.fontSize.lg,
    ...fontStyles.heading,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  gymCity: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  planCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  planCount: {
    fontSize: theme.typography.fontSize.sm,
    ...fontStyles.bodySemiBold,
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
  /* Section */
  section: {
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.heading,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  comingSoonCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  comingSoonBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  comingSoonText: {
    fontSize: theme.typography.fontSize.base,
    ...fontStyles.bodySemiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  comingSoonSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    opacity: 0.7,
    letterSpacing: 0.3,
  },
});
