import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { Gym } from '@/lib/stores/useGymStore';
import { WaitlistBottomSheet } from '@/components/WaitlistBottomSheet';
import { log } from '@/lib/logger';

// ── Inline gym card designed for the home-gym picker ─────────────────────────

function HomeGymPickerCard({
  gym,
  index,
  onSelect,
}: {
  gym: Gym;
  index: number;
  onSelect: () => void;
}) {
  const brandColor = gym.primary_color || theme.colors.primary;

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 70).duration(380)}>
      <TouchableOpacity
        style={[styles.gymCard, { borderColor: hexToRgba(brandColor, 0.2) }]}
        onPress={onSelect}
        activeOpacity={0.78}
      >
        {/* Background image if available */}
        {gym.background_url && (
          <>
            <Image
              source={gym.background_url}
              style={[StyleSheet.absoluteFillObject, styles.cardBgImage]}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.45)', 'rgba(8,8,18,0.92)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
          </>
        )}

        <PlatformBlur
          androidColor="rgba(12,12,22,0.97)"
          intensity={gym.background_url ? 0 : 50}
          tint="dark"
          style={styles.cardBlur}
        >
          <View style={styles.cardInner}>
            {/* Logo */}
            <View style={[styles.logoWrap, { backgroundColor: hexToRgba(brandColor, 0.12), borderColor: hexToRgba(brandColor, 0.22) }]}>
              {gym.logo_url ? (
                <Image
                  source={gym.logo_url}
                  style={styles.logoImg}
                  contentFit="contain"
                  transition={150}
                />
              ) : (
                <Ionicons name="fitness" size={26} color={brandColor} />
              )}
            </View>

            {/* Info */}
            <View style={styles.cardInfo}>
              <Text style={styles.gymName} numberOfLines={1}>{gym.name}</Text>
              {(gym.city || gym.address) && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={12} color={theme.colors.textTertiary} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {gym.address ? `${gym.address}${gym.city ? `, ${gym.city}` : ''}` : gym.city}
                  </Text>
                </View>
              )}
            </View>

            {/* CTA */}
            <View style={[styles.selectBtn, { backgroundColor: hexToRgba(brandColor, 0.15), borderColor: hexToRgba(brandColor, 0.3) }]}>
              <Ionicons name="chevron-forward" size={16} color={brandColor} />
            </View>
          </View>
        </PlatformBlur>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeGymScreen() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const router = useRouter();
  const { theme: currentTheme } = useTheme();
  const { t } = useTranslation('onboarding');

  useEffect(() => {
    loadGyms();
  }, []);

  const loadGyms = async () => {
    try {
      // Only show gyms that are both mobile-listed AND active
      const { data: gymsData, error } = await supabase
        .from('gyms')
        .select('*')
        .eq('is_mobile_listed', true)
        .eq('is_active', true)
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
        <Animated.View entering={FadeInDown.delay(40).duration(400)} style={styles.header}>
          <View style={[styles.iconContainer, { borderColor: hexToRgba(currentTheme.colors.primary, 0.2) }]}>
            <View style={[styles.iconGlow, { backgroundColor: currentTheme.colors.primary }]} />
            <Ionicons name="fitness" size={34} color={currentTheme.colors.primary} />
          </View>
          <Text style={styles.title}>{t('homeGym.title')}</Text>
          <Text style={styles.subtitle}>{t('homeGym.subtitle')}</Text>
        </Animated.View>

        {/* Gym Cards */}
        <View style={styles.gymList}>
          {gyms.map((gym, index) => (
            <HomeGymPickerCard
              key={gym.id}
              gym={gym}
              index={index}
              onSelect={() => router.push({ pathname: '/gym-detail', params: { gymId: gym.id } })}
            />
          ))}
        </View>

        {/* Suggest Your Gym */}
        <Animated.View entering={FadeInDown.delay(120 + gyms.length * 70).duration(380)}>
          <TouchableOpacity
            style={styles.suggestCard}
            onPress={() => setShowWaitlist(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={currentTheme.colors.primary} />
            <View style={styles.suggestText}>
              <Text style={[styles.suggestTitle, { color: theme.colors.textSecondary }]}>
                {t('homeGym.comingSoon')}
              </Text>
              <Text style={styles.suggestSub}>{t('homeGym.comingSoonSub')}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Skip */}
        <Animated.View
          entering={FadeInDown.delay(180 + gyms.length * 70).duration(380)}
          style={styles.skipContainer}
        >
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>{t('homeGym.skip')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      <WaitlistBottomSheet
        visible={showWaitlist}
        onClose={() => setShowWaitlist(false)}
        brandColor={currentTheme.colors.primary}
      />
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    position: 'relative',
  },
  iconGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    opacity: 0.12,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    letterSpacing: 0.2,
    paddingHorizontal: 16,
  },

  // ── Gym list ──
  gymList: {
    gap: 12,
    marginBottom: 16,
  },

  // ── Gym card ──
  gymCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,14,24,0.75)',
  },
  cardBgImage: {
    borderRadius: 18,
  },
  cardBlur: {
    borderRadius: 18,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  logoWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  logoImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  gymName: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
    flex: 1,
  },
  selectBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Suggest card ──
  suggestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  suggestText: {
    flex: 1,
    gap: 2,
  },
  suggestTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  suggestSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
    lineHeight: 18,
  },

  // ── Skip ──
  skipContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  skipText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textTertiary,
    letterSpacing: 0.3,
  },

});
