import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme, fontStyles } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { Gym } from '@/lib/stores/useGymStore';
import { GymCard } from '@/components/GymCard';
import { log } from '@/lib/logger';
import { useAppModal } from '@/lib/stores/useAppModal';

export default function HomeGymScreen() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingGym, setSettingGym] = useState(false);
  const router = useRouter();
  const { theme: currentTheme } = useTheme();
  const { t } = useTranslation('onboarding');
  const showModal = useAppModal((s) => s.showModal);

  useEffect(() => {
    loadGyms();
  }, []);

  const loadGyms = async () => {
    try {
      const { data: gymsData, error } = await supabase
        .from('gyms')
        .select('*')
        .order('is_founding_partner', { ascending: false })
        .order('name');

      if (error) throw error;
      if (!gymsData) {
        setGyms([]);
        setLoading(false);
        return;
      }

      const ownerIds = gymsData
        .map((g) => g.owner_id)
        .filter((id): id is string => !!id);

      const { data: brandingData } = ownerIds.length
        ? await supabase
            .from('owner_branding')
            .select('owner_id, primary_color, logo_url, background_url')
            .in('owner_id', ownerIds)
        : { data: [] };

      const brandingMap = new Map(
        (brandingData || []).map((b) => [b.owner_id, b])
      );

      const gymsWithBranding = gymsData.map((gym) => {
        const branding = brandingMap.get(gym.owner_id);
        return {
          ...gym,
          primary_color: branding?.primary_color || '#00E5FF',
          logo_url: branding?.logo_url || null,
          background_url: branding?.background_url || null,
        };
      });

      setGyms(gymsWithBranding);
    } catch (error) {
      log.error('Error loading gyms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetHomeGym = async (gym: Gym) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/home');
      return;
    }

    setSettingGym(true);
    try {
      await supabase
        .from('profiles')
        .update({ home_gym_id: gym.id })
        .eq('id', user.id);

      router.replace('/home');
    } catch {
      showModal({ title: t('homeGym.error'), body: t('homeGym.errorMsg') });
    } finally {
      setSettingGym(false);
    }
  };

  const handleDetails = (gym: Gym) => {
    router.push({ pathname: '/gym-detail', params: { gymId: gym.id } });
  };

  const handleSkip = () => {
    router.replace('/home');
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
        <Animated.View entering={FadeInDown.delay(50).duration(400)} style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="fitness" size={36} color={currentTheme.colors.primary} />
          </View>
          <Text style={styles.title}>{t('homeGym.title')}</Text>
          <Text style={styles.subtitle}>{t('homeGym.subtitle')}</Text>
        </Animated.View>

        {/* Gym Cards */}
        {gyms.map((gym, index) => (
          <Animated.View
            key={gym.id}
            entering={FadeInDown.delay(150 + index * 80).duration(400)}
            style={styles.gymCardContainer}
          >
            <GymCard
              gym={gym}
              onSetHomeGym={() => handleSetHomeGym(gym)}
              onDetails={() => handleDetails(gym)}
              variant="full"
            />
          </Animated.View>
        ))}

        {/* Coming Soon Card */}
        <Animated.View
          entering={FadeInDown.delay(150 + gyms.length * 80).duration(400)}
          style={styles.comingSoonContainer}
        >
          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonContent}>
              <View style={styles.comingSoonIconRow}>
                <Ionicons name="add-circle-outline" size={24} color={theme.colors.textTertiary} />
              </View>
              <Text style={styles.comingSoonTitle}>{t('homeGym.comingSoon')}</Text>
              <Text style={styles.comingSoonSubtitle}>{t('homeGym.comingSoonSub')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Skip */}
        <Animated.View
          entering={FadeInDown.delay(300 + gyms.length * 80).duration(400)}
          style={styles.skipContainer}
        >
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            activeOpacity={0.7}
            disabled={settingGym}
          >
            <Text style={styles.skipText}>{t('homeGym.skip')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {settingGym && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    ...fontStyles.heading,
    fontSize: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  gymCardContainer: {
    marginBottom: 16,
  },
  comingSoonContainer: {
    marginBottom: 24,
  },
  comingSoonCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  comingSoonContent: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  comingSoonIconRow: {
    marginBottom: 4,
  },
  comingSoonTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
  },
  comingSoonSubtitle: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.2,
    opacity: 0.7,
  },
  skipContainer: {
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  skipText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
