import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  FlatList,
  useWindowDimensions,
  ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useAuthStore } from '@/lib/stores/authStore';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { PUSH_NOTIFICATIONS_ENABLED } from '@/lib/notifications';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PlatformBlur } from '@/components/PlatformBlur';
import { log } from '@/lib/logger';
import {
  AVATAR_ACTIVITIES,
  AVATAR_COLORS,
  AvatarActivity,
  avatarUrl,
  allAvatarUrls,
} from '@/lib/avatars';

const TILE_GAP = 8;
const NUM_COLUMNS = 4;

type AvatarTile = { activity: AvatarActivity; color: typeof AVATAR_COLORS[number]; url: string };

const ALL_TILES: AvatarTile[] = AVATAR_ACTIVITIES.flatMap(activity =>
  AVATAR_COLORS.map(color => ({ activity, color, url: avatarUrl(activity, color) })),
);

const ACTIVITY_I18N_KEY: Record<AvatarActivity, string> = {
  weightlifting: 'avatar.activityWeightlifting',
  running:       'avatar.activityRunning',
  yoga:          'avatar.activityYoga',
  cycling:       'avatar.activityCycling',
  rowing:        'avatar.activityRowing',
  boxing:        'avatar.activityBoxing',
  swimming:      'avatar.activitySwimming',
  hiit:          'avatar.activityHiit',
  climbing:      'avatar.activityClimbing',
  stretching:    'avatar.activityStretching',
  pilates:       'avatar.activityPilates',
  crossfit:      'avatar.activityCrossfit',
};

export default function AvatarScreen() {
  const router = useThrottledRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === 'true';
  const { t } = useTranslation('onboarding');
  const branding = useBranding();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);
  const profile = useAuthStore((s) => s.profile);
  const { width } = useWindowDimensions();

  const [selected, setSelected] = useState<string | null>(
    isEdit && profile?.avatar_url?.startsWith('http') ? profile.avatar_url : null,
  );
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AvatarActivity | 'all'>('all');

  const tileSize = useMemo(() => {
    const horizontalPadding = 24 * 2;
    const totalGap = TILE_GAP * (NUM_COLUMNS - 1);
    return Math.floor((width - horizontalPadding - totalGap) / NUM_COLUMNS);
  }, [width]);

  // Preheat disk cache on mount
  useEffect(() => {
    Image.prefetch(allAvatarUrls()).catch(() => {});
  }, []);

  const filteredTiles = useMemo<AvatarTile[]>(() => {
    if (activeFilter === 'all') return ALL_TILES;
    return ALL_TILES.filter(t => t.activity === activeFilter);
  }, [activeFilter]);

  const primary = isEdit ? branding.primary : theme.colors.primary;
  const onPrimary = isEdit ? branding.onPrimary : '#000000';

  const navigateNext = useCallback(() => {
    if (isEdit) {
      router.back();
      return;
    }
    if (PUSH_NOTIFICATIONS_ENABLED) {
      setOnboardingStep('notifications');
      router.replace('/(onboarding)/notifications');
    } else {
      setOnboardingStep('profile_setup');
      router.replace('/(onboarding)/step-gender');
    }
  }, [isEdit, router, setOnboardingStep]);

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    const result = await updateProfile({ avatar_url: selected });
    setLoading(false);
    if (result.success) {
      navigateNext();
    } else {
      log.warn('[Avatar] Failed to save avatar:', result.error);
      navigateNext();
    }
  };

  const renderTile = useCallback(({ item, index }: ListRenderItemInfo<AvatarTile>) => {
    const isSelected = selected === item.url;
    return (
      <Animated.View entering={FadeInDown.delay(100 + index * 20).duration(300)}>
        <TouchableOpacity
          style={[
            styles.tile,
            { width: tileSize, height: tileSize },
            isSelected && [
              styles.tileSelected,
              {
                borderColor: primary,
                backgroundColor: hexToRgba(primary, 0.08),
                shadowColor: primary,
              },
            ],
          ]}
          onPress={() => setSelected(item.url)}
          activeOpacity={0.7}
          disabled={loading}
          accessibilityLabel={`${item.activity} avatar`}
        >
          <Image
            source={{ uri: item.url }}
            style={{ width: tileSize - 4, height: tileSize - 4, borderRadius: 10 }}
            transition={200}
            cachePolicy="memory-disk"
            contentFit="contain"
          />
        </TouchableOpacity>
      </Animated.View>
    );
  }, [selected, loading, primary, tileSize]);

  const keyExtractor = useCallback((item: AvatarTile) => `${item.activity}_${item.color}`, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Fixed top section ── */}
      <View style={styles.topSection}>
        {!isEdit && <OnboardingProgress current={2} total={3} />}

        {isEdit && (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={hexToRgba(branding.primary, 0.88)} />
          </TouchableOpacity>
        )}

        {/* Preview ring */}
        <Animated.View entering={FadeIn.delay(100).duration(500)} style={styles.previewContainer}>
          <View
            style={[
              styles.previewRing,
              {
                borderColor: selected ? primary : 'rgba(255,255,255,0.10)',
                backgroundColor: hexToRgba(primary, 0.06),
              },
            ]}
          >
            {selected ? (
              <>
                <View style={[styles.previewGlow, { backgroundColor: primary }]} />
                <Image
                  source={{ uri: selected }}
                  style={styles.previewImage}
                  transition={200}
                  cachePolicy="memory-disk"
                  contentFit="contain"
                />
              </>
            ) : (
              <Ionicons name="help-outline" size={32} color="rgba(255,255,255,0.20)" />
            )}
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.headerSection}>
          <Text style={styles.title}>{t('avatar.title')}</Text>
          <Text style={styles.subtitle}>{t('avatar.subtitle')}</Text>
        </Animated.View>
      </View>

      {/* ── Sport filter chips ── */}
      <Animated.View entering={FadeInDown.delay(300).duration(400)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {/* "All" chip */}
          <PlatformBlur
            intensity={40}
            tint="dark"
            style={[
              styles.chipBlur,
              activeFilter === 'all' && { borderColor: hexToRgba(primary, 0.7) },
            ]}
            androidColor="rgba(14,17,24,0.95)"
          >
            <TouchableOpacity
              style={[
                styles.chip,
                activeFilter === 'all' && [
                  styles.chipActive,
                  { backgroundColor: hexToRgba(primary, 0.18) },
                ],
              ]}
              onPress={() => setActiveFilter('all')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  activeFilter === 'all' && { color: primary },
                ]}
              >
                {t('avatar.filterAll')}
              </Text>
            </TouchableOpacity>
          </PlatformBlur>

          {AVATAR_ACTIVITIES.map(activity => (
            <PlatformBlur
              key={activity}
              intensity={40}
              tint="dark"
              style={[
                styles.chipBlur,
                activeFilter === activity && { borderColor: hexToRgba(primary, 0.7) },
              ]}
              androidColor="rgba(14,17,24,0.95)"
            >
              <TouchableOpacity
                style={[
                  styles.chip,
                  activeFilter === activity && [
                    styles.chipActive,
                    { backgroundColor: hexToRgba(primary, 0.18) },
                  ],
                ]}
                onPress={() => setActiveFilter(activity)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    activeFilter === activity && { color: primary },
                  ]}
                >
                  {t(ACTIVITY_I18N_KEY[activity])}
                </Text>
              </TouchableOpacity>
            </PlatformBlur>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Avatar grid ── */}
      <FlatList
        data={filteredTiles}
        renderItem={renderTile}
        keyExtractor={keyExtractor}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        key={activeFilter}
      />

      {/* ── Action buttons (fixed bottom) ── */}
      <Animated.View
        entering={FadeInDown.delay(600).duration(500)}
        style={styles.buttonsContainer}
      >
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: primary, shadowColor: primary },
            (!selected || loading) && { opacity: 0.6 },
          ]}
          onPress={handleContinue}
          disabled={!selected || loading}
          activeOpacity={0.8}
        >
          <View style={styles.primaryButtonInner}>
            {loading ? (
              <ActivityIndicator size="small" color={onPrimary} />
            ) : (
              <>
                <Text style={[styles.buttonText, { color: onPrimary }]}>
                  {isEdit ? (t('common:save') || 'Save') : t('common:continue')}
                </Text>
                <Ionicons
                  name={isEdit ? 'checkmark' : 'arrow-forward'}
                  size={20}
                  color={onPrimary}
                />
              </>
            )}
          </View>
        </TouchableOpacity>

        {!isEdit && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigateNext()}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>{t('common:skip')}</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // ── Top section ──
  topSection: {
    paddingHorizontal: 24,
    paddingTop: theme.spacing.xl,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 0,
    left: 16,
    padding: 8,
    zIndex: 10,
  },

  // ── Preview ──
  previewContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  previewRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  previewGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.08,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },

  // ── Header ──
  headerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // ── Filter chips ──
  chipRow: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
  },
  chipBlur: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    // background set inline via branding.primary
  },
  chipText: {
    ...fontStyles.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // ── Grid ──
  gridContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  gridRow: {
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tile: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  tileSelected: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },

  // ── Buttons ──
  buttonsContainer: {
    paddingHorizontal: 24,
    paddingBottom: theme.spacing.lg,
    paddingTop: 8,
    gap: theme.spacing.md,
  },
  primaryButton: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: theme.spacing.xl,
  },
  buttonText: {
    ...fontStyles.heading,
    fontSize: 18,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.glass.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...fontStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    letterSpacing: 0.5,
  },
});
