import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Dimensions,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { useGymData } from '@/hooks/useGymData';
import { useSession } from '@/hooks/useSession';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useAppModal } from '@/lib/stores/useAppModal';
import BackButton from '@/components/BackButton';
import { GalleryViewer } from '@/components/GalleryViewer';
import { GymMapsPickerSheet } from '@/components/GymMapsPickerSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GALLERY_HEIGHT = 360;
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const NOMINATIM_USER_AGENT = 'SweatdropMobile/1.0 (https://sweatdrop.app)';

const gymCache = new Map<string, Gym>();
const rewardsCache = new Map<string, RewardPreview[]>();
const memberCountCache = new Map<string, number>();
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
const galleryCache = new Map<string, GalleryImage[]>();

interface GalleryImage {
  id: string;
  image_url: string;
  sort_order: number;
  caption: string | null;
}

interface RewardPreview {
  id: string;
  name: string;
  drops_cost: number;
  image_url: string | null;
}

function getTodayKey(): string {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
}

function parseCoord(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}


async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  if (geocodeCache.has(q)) return geocodeCache.get(q)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } });
    if (!res.ok) { geocodeCache.set(q, null); return null; }
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) { geocodeCache.set(q, null); return null; }
    const row = data[0] as { lat?: string; lon?: string };
    const lat = parseFloat(String(row.lat ?? ''));
    const lng = parseFloat(String(row.lon ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { geocodeCache.set(q, null); return null; }
    const coords = { lat, lng };
    geocodeCache.set(q, coords);
    return coords;
  } catch {
    return null;
  }
}

function getOpenStatus(workingHours: Gym['working_hours']): { isOpen: boolean; label: string; nextTime?: string; nextDay?: string } {
  if (!workingHours) return { isOpen: false, label: '' };
  const now = new Date();
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayIdx = now.getDay();
  const todayKey = dayKeys[todayIdx];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayHours = workingHours[todayKey as keyof typeof workingHours];

  if (todayHours) {
    const [openH, openM] = todayHours.open.split(':').map(Number);
    const [closeH, closeM] = todayHours.close.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      return { isOpen: true, label: 'openNow', nextTime: todayHours.close };
    }
  }

  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const dayKey = dayKeys[idx];
    const dayHours = workingHours[dayKey as keyof typeof workingHours];
    if (dayHours) {
      if (offset === 0) {
        const [openH, openM] = dayHours.open.split(':').map(Number);
        if (currentMinutes < openH * 60 + openM) {
          return { isOpen: false, label: 'closedNow', nextTime: dayHours.open, nextDay: dayKey };
        }
      } else {
        const dayLabels = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        return { isOpen: false, label: 'closedNow', nextTime: dayHours.open, nextDay: dayLabels[idx] };
      }
    }
  }
  return { isOpen: false, label: 'closedNow' };
}

export default function GymDetailScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { t } = useTranslation('gymDetails');
  const showModal = useAppModal((s) => s.showModal);
  const params = useLocalSearchParams<{ gymId: string }>();
  const { homeGymId, setHomeGymId, setActiveGym } = useGymStore();
  const { updateHomeGym } = useGymData();
  const appBranding = useBranding();
  const insets = useSafeAreaInsets();

  const gymId = params.gymId;

  const [gym, setGym] = useState<Gym | null>(gymId ? (gymCache.get(gymId) ?? null) : null);
  const [loading, setLoading] = useState(!gymCache.has(gymId ?? ''));
  const [rewards, setRewards] = useState<RewardPreview[]>(gymId ? (rewardsCache.get(gymId) ?? []) : []);
  const [settingHome, setSettingHome] = useState(false);
  const [geocoded, setGeocoded] = useState<{ lat: number; lng: number } | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(gymId ? (memberCountCache.get(gymId) ?? null) : null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(gymId ? (galleryCache.get(gymId) ?? []) : []);
  const [galleryViewerVisible, setGalleryViewerVisible] = useState(false);
  const [galleryViewerIndex, setGalleryViewerIndex] = useState(0);
  const [activeGallerySlide, setActiveGallerySlide] = useState(0);
  const [mapsPickerOpen, setMapsPickerOpen] = useState(false);

  const brandColor = gym?.primary_color ?? appBranding.primary;
  const isHome = gym?.id === homeGymId;

  const dbLat = gym ? parseCoord((gym as any).latitude ?? (gym as any).lat) : null;
  const dbLng = gym ? parseCoord((gym as any).longitude ?? (gym as any).lng) : null;
  const mapLat = dbLat ?? geocoded?.lat ?? null;
  const mapLng = dbLng ?? geocoded?.lng ?? null;
  // Scroll tracking
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Gallery parallax + stretchy pull-down
  const galleryInnerStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, GALLERY_HEIGHT],
      [0, -GALLERY_HEIGHT * 0.35],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      scrollY.value,
      [-160, 0],
      [1.45, 1],
      { extrapolateRight: Extrapolation.CLAMP },
    );
    return { transform: [{ scale }, { translateY }] };
  });

  // Logo threshold: logo sits at GALLERY_HEIGHT, overlapping by 36px
  // It disappears under the header (~insets.top + 56) when scrollY passes that point
  const LOGO_SCROLL_THRESHOLD = GALLERY_HEIGHT - 36 - (insets.top + 56);

  // Header blur background fades in as cover scrolls away
  const headerBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [LOGO_SCROLL_THRESHOLD, LOGO_SCROLL_THRESHOLD + 60],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Logo+name in header: fade in when on-page logo scrolls off, fade out when back
  const headerLogoStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [LOGO_SCROLL_THRESHOLD + 20, LOGO_SCROLL_THRESHOLD + 70],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const geocodeKey = useMemo(() => {
    if (!gym) return '';
    return [gym.id, gym.address ?? '', gym.city ?? '', gym.country ?? ''].join('|');
  }, [gym?.id, gym?.address, gym?.city, gym?.country]);

  const DAY_LABELS: Record<string, string> = {
    mon: t('monday'), tue: t('tuesday'), wed: t('wednesday'),
    thu: t('thursday'), fri: t('friday'), sat: t('saturday'), sun: t('sunday'),
  };

  useEffect(() => {
    if (!gym) return;
    if (dbLat != null && dbLng != null) { setGeocoded(null); return; }
    const query = [gym.address, gym.city, gym.country].filter(Boolean).join(', ');
    if (!query.trim()) return;
    let cancelled = false;
    geocodeAddress(query).then((c) => { if (!cancelled) setGeocoded(c); });
    return () => { cancelled = true; };
  }, [geocodeKey, dbLat, dbLng]);

  useEffect(() => {
    if (!gymId) return;
    loadGymDetails(gymId);
    loadRewardsPreview(gymId);
    loadMemberCount(gymId);
    loadGallery(gymId);
  }, [gymId]);

  const loadGymDetails = async (id: string) => {
    const cached = gymCache.get(id);
    if (cached) { setGym(cached); setLoading(false); } else { setLoading(true); }
    try {
      const { data, error } = await supabase.from('gyms').select('*').eq('id', id).single();
      if (error) throw error;
      if (!data) return;
      let b = { primary_color: '#00E5FF', logo_url: null as string | null, background_url: null as string | null };
      if (data.owner_id) {
        const { data: ob } = await supabase.from('owner_branding')
          .select('primary_color, logo_url, background_url').eq('owner_id', data.owner_id).single();
        if (ob) b = { primary_color: ob.primary_color || b.primary_color, logo_url: ob.logo_url || b.logo_url, background_url: ob.background_url || b.background_url };
      }
      const enriched: Gym = { ...data, primary_color: b.primary_color, logo_url: b.logo_url, background_url: b.background_url };
      gymCache.set(id, enriched);
      setGym(enriched);
    } catch (e) { log.error('Error loading gym details:', e); } finally { setLoading(false); }
  };

  const loadRewardsPreview = async (id: string) => {
    const cached = rewardsCache.get(id);
    if (cached) setRewards(cached);
    try {
      const { data } = await supabase.from('rewards')
        .select('id, name, drops_cost, image_url')
        .eq('gym_id', id).eq('is_active', true)
        .order('drops_cost', { ascending: true }).limit(4);
      if (data) { rewardsCache.set(id, data); setRewards(data); }
    } catch (e) { log.error('Error loading rewards:', e); }
  };

  const loadMemberCount = async (id: string) => {
    const cached = memberCountCache.get(id);
    if (cached != null) setMemberCount(cached);
    try {
      const { count } = await supabase.from('gym_memberships')
        .select('*', { count: 'exact', head: true }).eq('gym_id', id);
      if (count != null) { memberCountCache.set(id, count); setMemberCount(count); }
    } catch { /* non-critical */ }
  };

  const loadGallery = async (id: string) => {
    const cached = galleryCache.get(id);
    if (cached) setGalleryImages(cached);
    try {
      const { data } = await supabase.from('gym_gallery')
        .select('id, image_url, sort_order, caption')
        .eq('gym_id', id)
        .order('sort_order', { ascending: true });
      if (data) { galleryCache.set(id, data); setGalleryImages(data); }
    } catch (e) { log.error('Error loading gallery:', e); }
  };

  const handleSetHomeGym = async () => {
    if (!gym || !session?.user) return;
    setSettingHome(true);
    try {
      await updateHomeGym(gym.id);
      setHomeGymId(gym.id);
      setActiveGym(gym);
      showModal({
        title: t('homeGymSet'),
        body: t('homeGymSetMsg', { name: gym.name }),
        buttons: [{ label: t('great'), onPress: () => { if (router.canDismiss()) router.dismissAll(); router.replace('/home'); } }],
      });
    } catch { showModal({ title: t('common:error'), body: t('failedToSetGym') }); }
    finally { setSettingHome(false); }
  };

  const openInstagram = () => { if (gym?.instagram) Linking.openURL(`https://instagram.com/${gym.instagram.replace('@', '')}`); };
  const callPhone = () => { if (gym?.phone) Linking.openURL(`tel:${gym.phone}`); };

  const onGalleryViewableChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveGallerySlide(viewableItems[0].index ?? 0);
  }, []);
  const galleryViewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const openGalleryViewer = (index: number) => {
    setGalleryViewerIndex(index);
    setGalleryViewerVisible(true);
  };

  // Determine hero images: gallery or fallback to background_url
  const heroImages = galleryImages.length > 0
    ? galleryImages
    : gym?.background_url
      ? [{ id: 'bg', image_url: gym.background_url, sort_order: 0, caption: null }]
      : [];

  if (loading && !gym) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><BackButton /></View>
        <View style={styles.centerContent}><ActivityIndicator size="large" color={appBranding.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!gym) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><BackButton /></View>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={52} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('gymNotFound')}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.errorBtn}>
            <Text style={[styles.errorBtnText, { color: brandColor }]}>{t('goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const todayKey = getTodayKey();
  const fullAddress = [gym.address, gym.city, gym.country].filter(Boolean).join(', ');
  const openStatus = getOpenStatus(gym.working_hours);

  return (
    <View style={styles.container}>

      {/* Floating header — always on top */}
      <View style={[styles.floatingHeader, { paddingTop: insets.top }]}>
        {/* Blur background fades in as cover scrolls away */}
        <Animated.View style={[StyleSheet.absoluteFillObject, headerBgStyle]} pointerEvents="none">
          <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={60} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.0)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        </Animated.View>

        <BackButton />

        {/* Logo + gym name — fade in when on-page logo scrolls off */}
        <Animated.View style={[styles.headerTitleContainer, headerLogoStyle]}>
          {gym.logo_url ? (
            <Image
              source={gym.logo_url}
              style={styles.headerLogo}
              contentFit="contain"
              transition={100}
            />
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>{gym.name}</Text>
        </Animated.View>

        <View style={styles.headerSpacer} />
      </View>

      {/* Scroll view — gallery is first child, content slides over it */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Gallery — inside scroll so touch/swipe works naturally */}
        {heroImages.length > 0 && (
          <View style={styles.galleryClip}>
            <Animated.View style={[styles.galleryInner, galleryInnerStyle]}>
              <FlatList
                data={heroImages}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onGalleryViewableChanged}
                viewabilityConfig={galleryViewabilityConfig}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.95}
                    onPress={() => openGalleryViewer(heroImages.indexOf(item))}
                    style={{ width: SCREEN_WIDTH, height: GALLERY_HEIGHT }}
                  >
                    <Image
                      source={item.image_url}
                      style={styles.galleryImage}
                      contentFit="cover"
                      transition={200}
                    />
                  </TouchableOpacity>
                )}
              />
            </Animated.View>
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', '#000000']}
              style={styles.galleryGradient}
              pointerEvents="none"
            />
            {heroImages.length > 1 && (
              <View style={styles.galleryDots} pointerEvents="none">
                {heroImages.map((_, idx) => (
                  <View key={idx} style={[styles.galleryDot, idx === activeGallerySlide && { backgroundColor: brandColor, width: 8, height: 8 }]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* All content — opaque background slides over gallery as user scrolls */}
        <View style={[styles.scrollInner, heroImages.length === 0 && { paddingTop: insets.top + 60 }]}>

        {/* ── Hero identity card ── */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.heroWrapper}>
          {/* Logo floats above the card — outside overflow:hidden boundary */}
          <View style={styles.heroLogoRow}>
            {gym.logo_url ? (
              <View style={[styles.logoOverlay, { borderColor: hexToRgba(brandColor, 0.40), shadowColor: brandColor }]}>
                <Image source={gym.logo_url} style={styles.logoImg} contentFit="contain" transition={200} />
              </View>
            ) : (
              <View style={[styles.logoPlaceholder, { backgroundColor: hexToRgba(brandColor, 0.10), borderColor: hexToRgba(brandColor, 0.20) }]}>
                <Ionicons name="fitness" size={32} color={brandColor} />
              </View>
            )}
            {isHome && (
              <View style={[styles.homePill, { backgroundColor: hexToRgba(brandColor, 0.14), borderColor: hexToRgba(brandColor, 0.30) }]}>
                <Ionicons name="home" size={11} color={brandColor} />
                <Text style={[styles.homePillText, { color: brandColor }]}>{t('yourHomeGym')}</Text>
              </View>
            )}
          </View>

          <View style={[styles.heroCard, {
            borderTopColor: hexToRgba(brandColor, 0.40),
            borderLeftColor: hexToRgba(brandColor, 0.16),
            borderRightColor: 'rgba(255,255,255,0.05)',
            borderBottomColor: 'rgba(255,255,255,0.04)',
          }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={55} tint="dark" style={styles.heroBlur}>
              <LinearGradient
                colors={[hexToRgba(brandColor, 0.14), 'rgba(255,255,255,0.03)', 'rgba(12,12,22,0.0)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <Text style={styles.gymName}>{gym.name}</Text>
              {!!gym.description && (
                <Text style={styles.gymDescription}>{gym.description}</Text>
              )}

              {/* Stat strip */}
              <View style={[styles.heroStatStrip, { borderTopColor: hexToRgba(brandColor, 0.10) }]}>
                {memberCount != null && memberCount > 0 && (
                  <View style={styles.heroStatItem}>
                    <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.55)" />
                    <Text style={styles.heroStatValue}>{memberCount}</Text>
                    <Text style={styles.heroStatLabel}>{t('members')}</Text>
                  </View>
                )}
                {gym.working_hours && openStatus.label && (
                  <>
                    {memberCount != null && memberCount > 0 && (
                      <View style={[styles.heroStatDivider, { backgroundColor: hexToRgba(brandColor, 0.10) }]} />
                    )}
                    <View style={styles.heroStatItem}>
                      <Ionicons
                        name={openStatus.isOpen ? 'radio-button-on' : 'time-outline'}
                        size={14}
                        color={openStatus.isOpen ? '#4ade80' : '#f87171'}
                      />
                      <Text style={[styles.heroStatValue, { color: openStatus.isOpen ? '#4ade80' : '#f87171' }]}>
                        {t(openStatus.label)}
                      </Text>
                      <Text style={styles.heroStatLabel} numberOfLines={1}>
                        {openStatus.isOpen && openStatus.nextTime ? t('closesAt', { time: openStatus.nextTime }) : ''}
                        {!openStatus.isOpen && openStatus.nextTime && openStatus.nextDay
                          ? t('opensAt', { day: t(openStatus.nextDay), time: openStatus.nextTime }) : ''}
                      </Text>
                    </View>
                  </>
                )}
                {rewards.length > 0 && (
                  <>
                    <View style={[styles.heroStatDivider, { backgroundColor: hexToRgba(brandColor, 0.10) }]} />
                    <View style={styles.heroStatItem}>
                      <Ionicons name="gift-outline" size={14} color={brandColor} />
                      <Text style={[styles.heroStatValue, { color: brandColor }]}>{rewards.length}+</Text>
                      <Text style={styles.heroStatLabel}>{t('rewards')}</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Address strip */}
              {!!fullAddress && (
                <View style={[styles.addressStrip, { borderTopColor: hexToRgba(brandColor, 0.10) }]}>
                  <View style={[styles.addressIconWrap, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                    <Ionicons name="location" size={15} color={brandColor} />
                  </View>
                  <Text style={styles.addressStripText} numberOfLines={2}>{fullAddress}</Text>
                </View>
              )}

              {/* Open in maps — sheet lists Apple (iOS), Google, Waze, Android geo picker */}
              {!!fullAddress && (
                <View style={[styles.mapBtnRow, { borderTopColor: hexToRgba(brandColor, 0.08) }]}>
                  <TouchableOpacity
                    style={styles.mapBtnSingle}
                    onPress={() => setMapsPickerOpen(true)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.mapBtnSingleLeft}>
                      <Ionicons name="map-outline" size={16} color={hexToRgba(brandColor, 0.85)} />
                      <Text style={[styles.mapBtnText, { color: hexToRgba(brandColor, 0.88) }]}>{t('openInMaps')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.28)" />
                  </TouchableOpacity>
                </View>
              )}
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* ── Working Hours ── */}
        {gym.working_hours && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={[styles.card, {
              borderTopColor: hexToRgba(brandColor, 0.22),
              borderLeftColor: hexToRgba(brandColor, 0.10),
              borderRightColor: 'rgba(255,255,255,0.04)',
              borderBottomColor: 'rgba(255,255,255,0.03)',
            }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                <LinearGradient
                  colors={[hexToRgba(brandColor, 0.08), 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                    <Ionicons name="time-outline" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('hours')}</Text>
                  {openStatus.label && (
                    <View style={[styles.openBadge, {
                      backgroundColor: openStatus.isOpen ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.10)',
                    }]}>
                      <View style={[styles.openDot, { backgroundColor: openStatus.isOpen ? '#4ade80' : '#f87171' }]} />
                      <Text style={[styles.openBadgeText, { color: openStatus.isOpen ? '#4ade80' : '#f87171' }]}>
                        {t(openStatus.label)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.hoursGrid}>
                  {DAY_ORDER.map((day) => {
                    const hrs = gym.working_hours?.[day];
                    const isToday = day === todayKey;
                    return (
                      <View key={day} style={[styles.hoursRow, isToday && { backgroundColor: hexToRgba(brandColor, 0.08), borderRadius: 8 }]}>
                        <Text style={[styles.hoursDay, isToday && { color: brandColor }]}>{DAY_LABELS[day]}</Text>
                        <Text style={[styles.hoursTime, isToday && { color: brandColor }]}>
                          {hrs ? `${hrs.open} – ${hrs.close}` : t('closed')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ── Contact ── */}
        {(gym.phone || gym.instagram || gym.website) && (
          <Animated.View entering={FadeInDown.delay(260).duration(400)}>
            <View style={[styles.card, {
              borderTopColor: hexToRgba(brandColor, 0.22),
              borderLeftColor: hexToRgba(brandColor, 0.10),
              borderRightColor: 'rgba(255,255,255,0.04)',
              borderBottomColor: 'rgba(255,255,255,0.03)',
            }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                <LinearGradient
                  colors={[hexToRgba(brandColor, 0.08), 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                    <Ionicons name="call-outline" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('contact')}</Text>
                </View>
                {gym.phone && (
                  <TouchableOpacity style={styles.contactRow} onPress={callPhone} activeOpacity={0.7}>
                    <View style={[styles.contactIcon, { backgroundColor: hexToRgba(brandColor, 0.10) }]}>
                      <Ionicons name="call-outline" size={15} color={brandColor} />
                    </View>
                    <Text style={[styles.contactText, { color: '#FFFFFF' }]}>{gym.phone}</Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
                  </TouchableOpacity>
                )}
                {gym.phone && gym.instagram && <View style={styles.divider} />}
                {gym.instagram && (
                  <TouchableOpacity style={styles.contactRow} onPress={openInstagram} activeOpacity={0.7}>
                    <View style={[styles.contactIcon, { backgroundColor: hexToRgba(brandColor, 0.10) }]}>
                      <Ionicons name="logo-instagram" size={15} color={brandColor} />
                    </View>
                    <Text style={[styles.contactText, { color: '#FFFFFF' }]}>{gym.instagram}</Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
                  </TouchableOpacity>
                )}
                {gym.instagram && gym.website && <View style={styles.divider} />}
                {gym.website && (
                  <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(gym.website!)} activeOpacity={0.7}>
                    <View style={[styles.contactIcon, { backgroundColor: hexToRgba(brandColor, 0.10) }]}>
                      <Ionicons name="globe-outline" size={15} color={brandColor} />
                    </View>
                    <Text style={[styles.contactText, { color: '#FFFFFF' }]} numberOfLines={1}>{gym.website}</Text>
                    <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
                  </TouchableOpacity>
                )}
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ── Rewards ── */}
        {rewards.length > 0 && (
          <Animated.View entering={FadeInDown.delay(320).duration(400)}>
            <View style={[styles.card, {
              borderTopColor: hexToRgba(brandColor, 0.22),
              borderLeftColor: hexToRgba(brandColor, 0.10),
              borderRightColor: 'rgba(255,255,255,0.04)',
              borderBottomColor: 'rgba(255,255,255,0.03)',
            }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.cardBlur}>
                <LinearGradient
                  colors={[hexToRgba(brandColor, 0.08), 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                    <Ionicons name="gift" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('availableRewards')}</Text>
                  <View style={[styles.rewardCountBadge, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                    <Text style={[styles.rewardCountText, { color: brandColor }]}>{rewards.length}{rewards.length >= 4 ? '+' : ''}</Text>
                  </View>
                </View>
                {rewards.map((reward, idx) => (
                  <React.Fragment key={reward.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.rewardRow}>
                      {reward.image_url ? (
                        <Image source={reward.image_url} style={styles.rewardThumb} contentFit="cover" transition={150} cachePolicy="disk" />
                      ) : (
                        <View style={[styles.rewardThumbEmpty, { backgroundColor: hexToRgba(brandColor, 0.10) }]}>
                          <Ionicons name="gift-outline" size={15} color={brandColor} />
                        </View>
                      )}
                      <Text style={styles.rewardName} numberOfLines={1}>{reward.name}</Text>
                      <View style={[styles.rewardBadge, { backgroundColor: hexToRgba(brandColor, 0.12), borderColor: hexToRgba(brandColor, 0.22) }]}>
                        <Ionicons name="water" size={11} color={brandColor} />
                        <Text style={[styles.rewardCost, { color: brandColor }]}>{reward.drops_cost}</Text>
                      </View>
                    </View>
                  </React.Fragment>
                ))}
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        <View style={{ height: !isHome && session ? 100 : 40 }} />
        </View>{/* end scrollInner */}
      </Animated.ScrollView>

      {/* Sticky CTA */}
      {!isHome && session && (
        <View style={styles.bottomBar}>
          <PlatformBlur
            androidColor="rgba(12,12,22,0.97)"
            intensity={80}
            tint="dark"
            style={[styles.bottomBlur, { paddingBottom: Math.max(insets.bottom, 12) + 20 }]}
          >
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: brandColor }]}
              onPress={handleSetHomeGym}
              activeOpacity={0.85}
              disabled={settingHome}
            >
              {settingHome ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="home" size={19} color="#000" />
                  <Text style={styles.ctaText}>{t('setAsHomeGym')}</Text>
                </>
              )}
            </TouchableOpacity>
          </PlatformBlur>
        </View>
      )}

      {/* Fullscreen gallery viewer */}
      <GalleryViewer
        visible={galleryViewerVisible}
        images={galleryImages}
        initialIndex={galleryViewerIndex}
        onClose={() => setGalleryViewerVisible(false)}
      />

      <GymMapsPickerSheet
        visible={mapsPickerOpen}
        onClose={() => setMapsPickerOpen(false)}
        accentColor={brandColor}
        target={
          gym
            ? { gymName: gym.name, fullAddress, lat: mapLat, lng: mapLng }
            : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Gallery inside scroll
  galleryClip: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
    overflow: 'hidden',
  },
  galleryInner: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
  },
  galleryGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  galleryDots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    alignItems: 'center',
  },
  galleryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  // Header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    letterSpacing: 1.2,
  },
  headerSpacer: { width: 40 },

  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
  errorBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  errorBtnText: { fontSize: 15, fontWeight: '600' },

  scrollView: { flex: 1 },
  scrollContent: {},
  scrollInner: {
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: '#000000',
  },

  // ── Hero identity card ──
  heroWrapper: {
    marginBottom: 12,
  },
  heroLogoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 0,
    zIndex: 2,
    // Pull logo down so it overlaps the card below
    marginBottom: -36,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,22,0.50)',
  },
  heroBlur: { borderRadius: 24, overflow: 'hidden' },
  logoOverlay: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.50,
    shadowRadius: 14,
    elevation: 8,
    overflow: 'hidden',
  },
  logoImg: { width: 68, height: 68, borderRadius: 18 },
  logoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  homePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  homePillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  gymName: {
    ...fontStyles.heading,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 46,
    paddingBottom: 2,
  },
  gymDescription: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },

  // Hero stat strip (inside hero card)
  heroStatStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginHorizontal: 0,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    position: 'relative',
  },
  heroStatDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  heroStatValue: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 19,
  },
  heroStatLabel: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // Address strip (inside hero card)
  addressStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 13,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  addressIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  addressStripText: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    flex: 1,
    lineHeight: 19,
  },

  // Map CTA (inside hero card)
  mapBtnRow: {
    borderTopWidth: 1,
    marginTop: 10,
  },
  mapBtnSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  mapBtnSingleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapBtnText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.1,
  },

  // ── Glass cards ──
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 12,
    backgroundColor: 'rgba(12,12,22,0.50)',
  },
  cardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    ...fontStyles.heading,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.5,
    flex: 1,
  },
  descriptionText: {
    ...fontStyles.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.60)',
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  // Open/closed badge in hours header
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
  },

  // Hours
  hoursGrid: { gap: 2 },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  hoursDay: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
  },
  hoursTime: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },

  // Contact
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  contactIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  contactText: {
    ...fontStyles.body,
    fontSize: 14,
    letterSpacing: 0.1,
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 4,
  },

  // Rewards
  rewardCountBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rewardCountText: {
    ...fontStyles.heading,
    fontSize: 12,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 12,
  },
  rewardThumb: { width: 36, height: 36, borderRadius: 10 },
  rewardThumbEmpty: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardName: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  rewardCost: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },

  // CTA
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  bottomBlur: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
  },
  ctaText: {
    ...fontStyles.heading,
    fontSize: 17,
    color: '#000',
    letterSpacing: 0.3,
  },
});
