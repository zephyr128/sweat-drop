import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
import { theme as baseTheme, fontStyles, hexToRgba} from '@/lib/theme';
import { shouldRetryGymsWithoutColumnFilter } from '@/lib/mobileGymListing';
import { SuggestGymCardWithSheet } from '@/components/SuggestGymCardWithSheet';
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
  const gymAccent = gym.primary_color || branding.primary;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400)}>
      <TouchableOpacity
        style={[
          styles.gymCard,
          {
            borderColor: hexToRgba(gymAccent, isActive ? 0.42 : 0.2),
            shadowColor: hexToRgba(gymAccent, 0.65),
          },
        ]}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <View style={styles.gymMediaWrap}>
          {gym.background_url ? (
            <Image source={{ uri: gym.background_url }} style={styles.gymMediaImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[hexToRgba(gymAccent, 0.45), 'rgba(24,24,40,0.92)', 'rgba(12,12,20,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gymMediaFallback}
            >
              <Ionicons name="barbell-outline" size={30} color={hexToRgba(gymAccent, 0.9)} />
            </LinearGradient>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.03)', 'rgba(0,0,0,0.24)', 'rgba(0,0,0,0.66)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.gymMediaOverlay}
          />
          {isHomeGym && (
            <View style={[styles.homeGymPill, { backgroundColor: hexToRgba(gymAccent, 0.16), borderColor: hexToRgba(gymAccent, 0.34) }]}>
              <Ionicons name="home-outline" size={11} color={gymAccent} />
              <Text style={[styles.homeGymPillText, { color: gymAccent }]}>HOME</Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.gymInfoCard,
            {
              borderTopColor: isActive ? hexToRgba(gymAccent, 0.28) : 'rgba(255,255,255,0.10)',
              borderLeftColor: isActive ? hexToRgba(gymAccent, 0.14) : 'rgba(255,255,255,0.08)',
              borderRightColor: 'rgba(255,255,255,0.04)',
              borderBottomColor: 'rgba(255,255,255,0.03)',
            },
          ]}
        >
          <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={42} tint="dark" style={styles.gymInfoCardBlur}>
            <LinearGradient
              colors={['rgba(255,255,255,0.05)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.gymCardContent}>
              <View
                style={[
                  styles.gymIconContainer,
                  {
                    backgroundColor: isActive
                      ? hexToRgba(gymAccent, 0.16)
                      : 'rgba(255,255,255,0.06)',
                    borderColor: isActive
                      ? hexToRgba(gymAccent, 0.36)
                      : 'rgba(255,255,255,0.12)',
                  },
                ]}
              >
                {gym.logo_url ? (
                  <Image source={{ uri: gym.logo_url }} style={styles.gymLogo} resizeMode="cover" />
                ) : (
                  <Ionicons name="fitness-outline" size={24} color={isActive ? gymAccent : baseTheme.colors.textSecondary} />
                )}
              </View>

              <View style={styles.gymInfo}>
                <Text style={styles.gymName} numberOfLines={2}>{gym.name}</Text>
                {!!gym.city && <Text style={styles.gymCity}>{gym.city}</Text>}
              </View>

              {isActive ? (
                <View style={[styles.activeCheck, { backgroundColor: hexToRgba(gymAccent, 0.16), borderColor: hexToRgba(gymAccent, 0.35) }]}>
                  <Ionicons name="checkmark" size={18} color={gymAccent} />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={baseTheme.colors.textTertiary} />
              )}
            </View>
          </PlatformBlur>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Gyms Screen ──────────────────────────
export default function GymsScreen() {
  const { t } = useTranslation('gyms');
  const router = useThrottledRouter();
  const { activeGym } = useTheme();
  const branding = useBranding();
  const { gyms, setGyms, homeGymId, setLoading, isLoading } = useGymStore();
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
          log.warn('[Gyms] get_public_gyms_for_mobile:', rpcError.message);
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
      log.error('Error loading gyms:', error);
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

  const handleGymSelect = useCallback((gym: Gym) => {
    router.push({ pathname: '/gym-detail', params: { gymId: gym.id } });
  }, [router]);

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
          <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={styles.activeGymBlur}>
            <View style={styles.activeGymContent}>
              <View style={[styles.activeGymDot, { backgroundColor: branding.primary }]} />
              <Text style={styles.activeGymLabel}>{t('currently_active')}</Text>
              <Text style={[styles.activeGymName, { color: branding.primary }]}>
                {activeGym.name}
              </Text>
            </View>
          </PlatformBlur>
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
          <View style={styles.emptySuggestWrap}>
            <SuggestGymCardWithSheet variant="gymsList" brandColor={branding.primary} />
          </View>
        </View>
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={styles.listFooterSuggest}>
              <SuggestGymCardWithSheet variant="gymsList" brandColor={branding.primary} />
            </View>
          }
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
    fontSize: 22,
    color: baseTheme.colors.text,
    letterSpacing: 1.5,
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
    paddingBottom: 44,
    gap: 14,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 84,
    paddingBottom: baseTheme.spacing['3xl'],
    gap: baseTheme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 22,
    color: baseTheme.colors.text,
    textAlign: 'center',
    paddingHorizontal: baseTheme.spacing.lg,
  },
  emptySuggestWrap: {
    width: '100%',
    paddingHorizontal: baseTheme.spacing.lg,
    marginTop: baseTheme.spacing.md,
  },
  listFooterSuggest: {
    marginTop: baseTheme.spacing.md,
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
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,20,0.75)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  gymMediaWrap: {
    height: 134,
    width: '100%',
    backgroundColor: 'rgba(20,20,30,0.9)',
  },
  gymMediaImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gymMediaFallback: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymMediaOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gymCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'transparent',
  },
  gymInfoCard: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    overflow: 'hidden',
  },
  gymInfoCardBlur: {
    backgroundColor: 'rgba(14,14,22,0.80)',
  },
  gymIconContainer: {
    width: 58,
    height: 58,
    borderRadius: baseTheme.borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  gymLogo: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },
  gymInfo: {
    flex: 1,
    gap: 5,
  },
  gymName: {
    ...fontStyles.heading,
    fontSize: 18,
    color: baseTheme.colors.text,
    letterSpacing: 0.4,
  },
  gymCity: {
    ...fontStyles.body,
    fontSize: 13.5,
    color: baseTheme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  homeGymPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  homeGymPillText: {
    ...fontStyles.heading,
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  activeCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    borderWidth: 1,
  },
});
