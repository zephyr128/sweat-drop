import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
import { useAuthStore } from '@/lib/stores/authStore';
import { theme as baseTheme, fontStyles } from '@/lib/theme';
import { shouldRetryGymsWithoutColumnFilter } from '@/lib/mobileGymListing';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── GymCard Component ──────────────────────────────
function GymCard({
  gym,
  index,
  isActive,
  isHomeGym,
  onPress,
  branding,
}: {
  gym: Gym;
  index: number;
  isActive: boolean;
  isHomeGym: boolean;
  onPress: () => void;
  branding: { primary: string };
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
      <TouchableOpacity
        style={[
          styles.gymCard,
          isActive && { borderColor: hexToRgba(branding.primary, 0.35) },
        ]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <View style={styles.gymCardInner}>
          {/* Left — logo or icon */}
          <View
            style={[
              styles.gymIconContainer,
              {
                backgroundColor: isActive
                  ? hexToRgba(branding.primary, 0.12)
                  : 'rgba(255,255,255,0.05)',
                borderColor: isActive
                  ? hexToRgba(branding.primary, 0.25)
                  : 'rgba(255,255,255,0.08)',
              },
            ]}
          >
            {gym.logo_url ? (
              <Image
                source={{ uri: gym.logo_url }}
                style={styles.gymLogo}
                resizeMode="contain"
              />
            ) : (
              <Ionicons
                name="fitness-outline"
                size={24}
                color={isActive ? branding.primary : baseTheme.colors.textSecondary}
              />
            )}
          </View>

          {/* Center — name + city */}
          <View style={styles.gymInfo}>
            <View style={styles.gymNameRow}>
              <Text style={styles.gymName} numberOfLines={1}>
                {gym.name}
              </Text>
              {isHomeGym && (
                <View
                  style={[
                    styles.homeGymBadge,
                    { backgroundColor: hexToRgba(branding.primary, 0.12) },
                  ]}
                >
                  <Ionicons name="home-outline" size={10} color={branding.primary} />
                  <Text style={[styles.homeGymBadgeText, { color: branding.primary }]}>
                    HOME
                  </Text>
                </View>
              )}
            </View>
            {gym.city && <Text style={styles.gymCity}>{gym.city}</Text>}
          </View>

          {/* Right — active checkmark or chevron */}
          {isActive ? (
            <View
              style={[
                styles.activeCheck,
                { backgroundColor: hexToRgba(branding.primary, 0.15) },
              ]}
            >
              <Ionicons name="checkmark" size={18} color={branding.primary} />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={baseTheme.colors.textTertiary} />
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Gyms Screen ──────────────────────────
export default function GymsScreen() {
  const { t } = useTranslation('gyms');
  const { t: tCommon } = useTranslation('common');
  const router = useRouter();
  const { activeGym } = useTheme();
  const branding = useBranding();
  const { gyms, setGyms, homeGymId, setLoading, isLoading, setActiveGym, setPreviewGymId } = useGymStore();
  const [localLoading, setLocalLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadGyms = useCallback(async () => {
    setLocalLoading(true);
    setLoading(true);
    setLoadError(null);
    try {
      let gymsData: Gym[] | null = null;

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_public_gyms_for_mobile',
      );

      if (!rpcError && rpcData) {
        gymsData = rpcData as Gym[];
      } else {
        if (__DEV__ && rpcError) {
          console.warn('[Gyms] get_public_gyms_for_mobile:', rpcError.message);
        }
        const filtered = await supabase
          .from('gyms')
          .select('*')
          .eq('is_mobile_listed', true)
          .order('name', { ascending: true });
        let tableError = filtered.error;
        gymsData = filtered.data;
        if (shouldRetryGymsWithoutColumnFilter(tableError)) {
          const fallback = await supabase
            .from('gyms')
            .select('*')
            .order('name', { ascending: true });
          gymsData = fallback.data;
          tableError = fallback.error;
        }
        if (tableError) throw tableError;
      }

      if (!gymsData) {
        setGyms([]);
        setLoading(false);
        setLocalLoading(false);
        return;
      }

      // Load branding for each gym from owner_branding
      const gymsWithBranding = await Promise.all(
        gymsData.map(async (gym) => {
          let brandingData = {
            primary_color: '#00E5FF',
            logo_url: null as string | null,
            background_url: null as string | null,
          };

          if (gym.owner_id) {
            const { data: ownerBranding } = await supabase
              .from('owner_branding')
              .select('primary_color, logo_url, background_url')
              .eq('owner_id', gym.owner_id)
              .single();

            if (ownerBranding) {
              brandingData = {
                primary_color: ownerBranding.primary_color || brandingData.primary_color,
                logo_url: ownerBranding.logo_url || brandingData.logo_url,
                background_url: ownerBranding.background_url || brandingData.background_url,
              };
            }
          }

          return {
            ...gym,
            primary_color: brandingData.primary_color,
            logo_url: brandingData.logo_url,
            background_url: brandingData.background_url,
          };
        })
      );

      setGyms(gymsWithBranding);
    } catch (error) {
      console.error('Error loading gyms:', error);
      const message =
        error instanceof Error ? error.message : t('load_failed');
      setLoadError(message);
    } finally {
      setLoading(false);
      setLocalLoading(false);
    }
  }, [t, setGyms, setLoading]);

  useEffect(() => {
    loadGyms();
  }, [loadGyms]);

  const handleGymSelect = useCallback(async (gym: Gym) => {
    const profile = useAuthStore.getState().profile;
    const currentActiveGymId = activeGym?.id;
    const currentHomeGymId = homeGymId;
    const isAlreadyActive = gym.id === currentActiveGymId;
    const isAlreadyHome = gym.id === currentHomeGymId;

    if (isAlreadyActive) {
      router.back();
      return;
    }

    // Switch active gym immediately (branding updates)
    setPreviewGymId(gym.id);
    setActiveGym(gym);

    // If not already home gym — ask to set as home
    if (!isAlreadyHome && profile) {
      Alert.alert(
        gym.name,
        t('set_home_prompt'),
        [
          {
            text: tCommon('cancel'),
            style: 'cancel',
          },
          {
            text: t('set_home_confirm'),
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('profiles')
                  .update({ home_gym_id: gym.id })
                  .eq('id', profile.id);

                if (!error) {
                  useGymStore.getState().setHomeGymId(gym.id);
                  await useAuthStore.getState().refreshProfile();
                }
              } catch (e) {
                console.error('Failed to set home gym:', e);
              }
            },
          },
        ]
      );
    }

    router.back();
  }, [activeGym?.id, homeGymId, t, tCommon, router]);

  const loading = localLoading || isLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Header ───────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: hexToRgba(branding.primary, 0.15) }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={baseTheme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('title')}</Text>
          <Text style={styles.headerSubtitle}>{t('subtitle')}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Active gym indicator ──────────────── */}
      {activeGym && (
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.activeGymBanner}>
          <BlurView intensity={40} tint="dark" style={styles.activeGymBlur}>
            <View style={styles.activeGymContent}>
              <View style={[styles.activeGymDot, { backgroundColor: branding.primary }]} />
              <Text style={styles.activeGymLabel}>{t('currently_active')}</Text>
              <Text style={[styles.activeGymName, { color: branding.primary }]}>
                {activeGym.name}
              </Text>
            </View>
          </BlurView>
        </Animated.View>
      )}

      {/* ── Gym list ─────────────────────────── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={baseTheme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('load_failed')}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: hexToRgba(branding.primary, 0.35) }]}
            onPress={() => loadGyms()}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryButtonText, { color: branding.primary }]}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : gyms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="fitness-outline" size={48} color={baseTheme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('no_gyms')}</Text>
        </View>
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <GymCard
              gym={item}
              index={index}
              isActive={item.id === activeGym?.id}
              isHomeGym={item.id === homeGymId}
              onPress={() => handleGymSelect(item)}
              branding={branding}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: baseTheme.spacing.lg,
    paddingVertical: baseTheme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    zIndex: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 26,
    color: baseTheme.colors.text,
    letterSpacing: 2,
  },
  headerSubtitle: {
    ...fontStyles.body,
    fontSize: 13,
    color: baseTheme.colors.textSecondary,
    marginTop: 1,
  },
  headerSpacer: {
    width: 40,
  },

  // Active gym banner
  activeGymBanner: {
    marginHorizontal: baseTheme.spacing.lg,
    marginBottom: baseTheme.spacing.md,
    borderRadius: baseTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  activeGymBlur: {
    borderRadius: baseTheme.borderRadius.md,
    overflow: 'hidden',
  },
  activeGymContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: baseTheme.spacing.md,
    backgroundColor: 'rgba(20,20,30,0.60)',
  },
  activeGymDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeGymLabel: {
    ...fontStyles.body,
    fontSize: 12,
    color: baseTheme.colors.textTertiary,
  },
  activeGymName: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
  },

  // List
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: baseTheme.spacing.lg,
    paddingBottom: 40,
    gap: 10,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: baseTheme.spacing['3xl'],
    gap: baseTheme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 22,
    color: baseTheme.colors.text,
    textAlign: 'center',
    paddingHorizontal: baseTheme.spacing.lg,
  },
  retryButton: {
    marginTop: baseTheme.spacing.md,
    paddingVertical: 12,
    paddingHorizontal: baseTheme.spacing.xl,
    borderRadius: baseTheme.borderRadius.full,
    borderWidth: 1,
  },
  retryButtonText: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
  },

  // Gym card
  gymCard: {
    borderRadius: baseTheme.borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  gymCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: baseTheme.spacing.md,
    backgroundColor: 'rgba(20,20,30,0.70)',
    borderRadius: baseTheme.borderRadius.xl,
  },
  gymIconContainer: {
    width: 48,
    height: 48,
    borderRadius: baseTheme.borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  gymLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  gymInfo: {
    flex: 1,
    gap: 3,
  },
  gymNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  gymName: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: baseTheme.colors.text,
  },
  gymCity: {
    ...fontStyles.body,
    fontSize: 13,
    color: baseTheme.colors.textSecondary,
  },
  homeGymBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  homeGymBadgeText: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  activeCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
