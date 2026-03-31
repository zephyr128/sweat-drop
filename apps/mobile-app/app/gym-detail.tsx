import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Platform,
  Dimensions,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeIn,
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

  const brandColor = gym?.primary_color ?? appBranding.primary;
  const isHome = gym?.id === homeGymId;

  const dbLat = gym ? parseCoord((gym as any).latitude ?? (gym as any).lat) : null;
  const dbLng = gym ? parseCoord((gym as any).longitude ?? (gym as any).lng) : null;
  const mapLat = dbLat ?? geocoded?.lat ?? null;
  const mapLng = dbLng ?? geocoded?.lng ?? null;
  const hasMapCoords = mapLat != null && mapLng != null;

  // Parallax scroll
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Parallax: images translate up at half scroll speed, stretchy on pull-down
  const galleryInnerStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, GALLERY_HEIGHT],
      [0, -GALLERY_HEIGHT * 0.4],
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

  const headerOpacityStyle = useAnimatedStyle(() => ({ opacity: 0 }));

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

  const openInAppleMaps = useCallback(() => {
    if (!gym) return;
    if (mapLat != null && mapLng != null) {
      Linking.openURL(`maps:0,0?q=${encodeURIComponent(gym.name)}@${mapLat},${mapLng}`);
    } else if (gym.address) {
      const q = encodeURIComponent(`${gym.address}, ${gym.city || ''}`);
      Linking.openURL(`maps:0,0?q=${q}`);
    }
  }, [gym, mapLat, mapLng]);

  const openInGoogleMaps = useCallback(() => {
    if (!gym) return;
    if (mapLat != null && mapLng != null) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${mapLat},${mapLng}`);
    } else if (gym.address) {
      const q = encodeURIComponent(`${gym.address}, ${gym.city || ''}`);
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
    }
  }, [gym, mapLat, mapLng]);

  const openInMaps = useCallback(() => {
    if (!gym) return;
    if (mapLat != null && mapLng != null) {
      const url = Platform.select({ ios: `maps:0,0?q=${gym.name}@${mapLat},${mapLng}`, android: `geo:${mapLat},${mapLng}?q=${mapLat},${mapLng}(${gym.name})` });
      if (url) Linking.openURL(url);
    } else if (gym.address) {
      const q = encodeURIComponent(`${gym.address}, ${gym.city || ''}`);
      const url = Platform.select({ ios: `maps:0,0?q=${q}`, android: `geo:0,0?q=${q}` });
      if (url) Linking.openURL(url);
    }
  }, [gym, mapLat, mapLng]);

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
        <View style={styles.header}><BackButton /><View style={styles.headerSpacer} /></View>
        <View style={styles.centerContent}><ActivityIndicator size="large" color={appBranding.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!gym) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}><BackButton /><View style={styles.headerSpacer} /></View>
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
      <LinearGradient
        colors={['#000000', '#000000']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Floating header — always on top */}
      <SafeAreaView edges={['top']} style={styles.floatingHeader}>
        <BackButton />
        <Animated.View style={[styles.headerTitleContainer, headerOpacityStyle]}>
          <Text style={styles.headerTitle} numberOfLines={1}>{gym.name}</Text>
        </Animated.View>
        <View style={styles.headerSpacer} />
      </SafeAreaView>

      {/* Single scroll view — gallery is first child, content follows naturally */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Gallery — inside scroll, clips parallax, FlatList handles horizontal swipes */}
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
              colors={['transparent', 'rgba(0,0,0,0.45)', '#000000']}
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

        {/* All content gets horizontal padding */}
        <View style={styles.scrollInner}>
        {/* Gym Identity */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.identitySection}>
          {/* Logo overlapping gallery */}
          {gym.logo_url && (
            <View style={[styles.logoOverlay, { borderColor: hexToRgba(brandColor, 0.35), shadowColor: brandColor }]}>
              <Image source={gym.logo_url} style={styles.logoImg} contentFit="contain" transition={200} />
            </View>
          )}
          {!gym.logo_url && (
            <View style={[styles.logoPlaceholder, { backgroundColor: hexToRgba(brandColor, 0.08), borderColor: hexToRgba(brandColor, 0.15) }]}>
              <Ionicons name="fitness" size={32} color={brandColor} />
            </View>
          )}

          <Text style={styles.gymName}>{gym.name}</Text>

          {/* Stat cards — matches home screen design */}
          <View style={styles.statsRow}>
            {isHome && (
              <View style={[styles.statCardOuter, { borderColor: hexToRgba(brandColor, 0.28) }]}>
                <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
                  <LinearGradient
                    colors={[hexToRgba(brandColor, 0.14), hexToRgba(brandColor, 0.06)]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.statCardGradient}
                  >
                    <Ionicons name="home" size={17} color={brandColor} />
                    <Text style={[styles.statValue, { color: brandColor }]}>{t('home')}</Text>
                    <Text style={styles.statLabel}>{t('yourHomeGym')}</Text>
                  </LinearGradient>
                </BlurView>
              </View>
            )}
            {memberCount != null && memberCount > 0 && (
              <View style={[styles.statCardOuter, { borderColor: 'rgba(255,255,255,0.12)' }]}>
                <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.statCardGradient}
                  >
                    <Ionicons name="people-outline" size={17} color="rgba(255,255,255,0.65)" />
                    <Text style={styles.statValue}>{memberCount}</Text>
                    <Text style={styles.statLabel}>{t('members')}</Text>
                  </LinearGradient>
                </BlurView>
              </View>
            )}
            {gym.working_hours && openStatus.label && (
              <View style={[styles.statCardOuter, { borderColor: openStatus.isOpen ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.22)' }]}>
                <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
                  <LinearGradient
                    colors={openStatus.isOpen
                      ? ['rgba(74,222,128,0.14)', 'rgba(74,222,128,0.05)']
                      : ['rgba(248,113,113,0.12)', 'rgba(248,113,113,0.04)']
                    }
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.statCardGradient}
                  >
                    <Ionicons
                      name={openStatus.isOpen ? 'radio-button-on' : 'radio-button-off'}
                      size={17}
                      color={openStatus.isOpen ? '#4ade80' : '#f87171'}
                    />
                    <Text style={[styles.statValue, { color: openStatus.isOpen ? '#4ade80' : '#f87171' }]}>
                      {t(openStatus.label)}
                    </Text>
                    <Text style={styles.statLabel} numberOfLines={1}>
                      {openStatus.isOpen && openStatus.nextTime ? `${t('closesAt', { time: openStatus.nextTime })}` : ''}
                      {!openStatus.isOpen && openStatus.nextTime && openStatus.nextDay ? `${t('opensAt', { day: t(openStatus.nextDay), time: openStatus.nextTime })}` : ''}
                    </Text>
                  </LinearGradient>
                </BlurView>
              </View>
            )}
            {rewards.length > 0 && (
              <View style={[styles.statCardOuter, { borderColor: hexToRgba(brandColor, 0.22) }]}>
                <BlurView intensity={50} tint="dark" style={styles.statCardBlur}>
                  <LinearGradient
                    colors={[hexToRgba(brandColor, 0.12), hexToRgba(brandColor, 0.04)]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.statCardGradient}
                  >
                    <Ionicons name="gift-outline" size={17} color={brandColor} />
                    <Text style={[styles.statValue, { color: brandColor }]}>{rewards.length}+</Text>
                    <Text style={styles.statLabel}>{t('rewards')}</Text>
                  </LinearGradient>
                </BlurView>
              </View>
            )}
          </View>

          {/* Address */}
          {!!fullAddress && (
            <View style={[styles.addressCard, { borderColor: hexToRgba(brandColor, 0.15) }]}>
              <BlurView intensity={50} tint="dark" style={styles.addressCardBlur}>
                <View style={styles.addressCardTop}>
                  <View style={[styles.addressIconWrap, { backgroundColor: hexToRgba(brandColor, 0.12) }]}>
                    <Ionicons name="location" size={18} color={brandColor} />
                  </View>
                  <Text style={styles.addressCardText}>{fullAddress}</Text>
                </View>
                <View style={styles.addressCardDivider} />
                <View style={styles.addressCardActions}>
                  <TouchableOpacity style={styles.addressMapBtn} onPress={openInAppleMaps} activeOpacity={0.75}>
                    <Ionicons name="map" size={14} color={brandColor} />
                    <Text style={[styles.addressMapBtnText, { color: brandColor }]}>Apple Maps</Text>
                  </TouchableOpacity>
                  <View style={styles.addressMapBtnDivider} />
                  <TouchableOpacity style={styles.addressMapBtn} onPress={openInGoogleMaps} activeOpacity={0.75}>
                    <Ionicons name="navigate" size={14} color={brandColor} />
                    <Text style={[styles.addressMapBtnText, { color: brandColor }]}>Google Maps</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          )}
        </Animated.View>

        {/* About Section */}
        {!!gym.description && (
          <Animated.View entering={FadeInDown.delay(160).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.1) }]}>
                    <Ionicons name="information-circle-outline" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('about')}</Text>
                </View>
                <Text style={styles.descriptionText}>{gym.description}</Text>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Working Hours */}
        {gym.working_hours && (
          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.1) }]}>
                    <Ionicons name="time-outline" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('hours')}</Text>
                </View>
                <View style={styles.hoursGrid}>
                  {DAY_ORDER.map((day) => {
                    const hrs = gym.working_hours?.[day];
                    const isToday = day === todayKey;
                    return (
                      <View key={day} style={[styles.hoursRow, isToday && { backgroundColor: hexToRgba(brandColor, 0.07), borderRadius: 8 }]}>
                        <Text style={[styles.hoursDay, isToday && { color: brandColor, fontWeight: '700' }]}>{DAY_LABELS[day]}</Text>
                        <Text style={[styles.hoursTime, isToday && { color: brandColor, fontWeight: '700' }]}>
                          {hrs ? `${hrs.open} – ${hrs.close}` : t('closed')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Contact */}
        {(gym.phone || gym.instagram || gym.website) && (
          <Animated.View entering={FadeInDown.delay(380).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.1) }]}>
                    <Ionicons name="call-outline" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('contact')}</Text>
                </View>
                {gym.phone && (
                  <TouchableOpacity style={styles.contactRow} onPress={callPhone} activeOpacity={0.7}>
                    <Ionicons name="call-outline" size={16} color={brandColor} />
                    <Text style={[styles.contactText, { color: brandColor }]}>{gym.phone}</Text>
                  </TouchableOpacity>
                )}
                {gym.phone && gym.instagram && <View style={styles.divider} />}
                {gym.instagram && (
                  <TouchableOpacity style={styles.contactRow} onPress={openInstagram} activeOpacity={0.7}>
                    <Ionicons name="logo-instagram" size={16} color={brandColor} />
                    <Text style={[styles.contactText, { color: brandColor }]}>{gym.instagram}</Text>
                  </TouchableOpacity>
                )}
                {gym.instagram && gym.website && <View style={styles.divider} />}
                {gym.website && (
                  <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(gym.website!)} activeOpacity={0.7}>
                    <Ionicons name="globe-outline" size={16} color={brandColor} />
                    <Text style={[styles.contactText, { color: brandColor }]} numberOfLines={1}>{gym.website}</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Rewards */}
        {rewards.length > 0 && (
          <Animated.View entering={FadeInDown.delay(420).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.1) }]}>
                    <Ionicons name="gift" size={16} color={brandColor} />
                  </View>
                  <Text style={styles.cardTitle}>{t('availableRewards')}</Text>
                </View>
                {rewards.map((reward, idx) => (
                  <React.Fragment key={reward.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.rewardRow}>
                      {reward.image_url ? (
                        <Image source={reward.image_url} style={styles.rewardThumb} contentFit="cover" transition={150} cachePolicy="disk" />
                      ) : (
                        <View style={[styles.rewardThumbEmpty, { backgroundColor: hexToRgba(brandColor, 0.08) }]}>
                          <Ionicons name="gift-outline" size={14} color={brandColor} />
                        </View>
                      )}
                      <Text style={styles.rewardName} numberOfLines={1}>{reward.name}</Text>
                      <View style={[styles.rewardBadge, { backgroundColor: hexToRgba(brandColor, 0.1) }]}>
                        <Text style={[styles.rewardCost, { color: brandColor }]}>{reward.drops_cost} 💧</Text>
                      </View>
                    </View>
                  </React.Fragment>
                ))}
                {rewards.length >= 4 && (
                  <Text style={[styles.rewardMore, { color: hexToRgba(brandColor, 0.5) }]}>{t('andMore')}</Text>
                )}
              </BlurView>
            </View>
          </Animated.View>
        )}

        <View style={{ height: !isHome && session ? 100 : 40 }} />
        </View>{/* end scrollInner */}
      </Animated.ScrollView>

      {/* Sticky CTA */}
      {!isHome && session && (
        <View style={styles.bottomBar}>
          <BlurView intensity={80} tint="dark" style={styles.bottomBlur}>
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
          </BlurView>
        </View>
      )}

      {/* Fullscreen gallery viewer */}
      <GalleryViewer
        visible={galleryViewerVisible}
        images={galleryImages}
        initialIndex={galleryViewerIndex}
        onClose={() => setGalleryViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Gallery
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
    height: 200,
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
    paddingBottom: 8,
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
    alignItems: 'center',
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  headerSpacer: { width: 56 },

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
  scrollContent: { paddingBottom: 40 },
  scrollInner: {
    paddingHorizontal: theme.spacing.lg,
  },

  // Identity
  identitySection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  logoOverlay: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -36,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  logoImg: { width: 60, height: 60, borderRadius: 16 },
  logoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },
  gymName: {
    ...fontStyles.heading,
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    width: '100%',
  },
  statCardOuter: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statCardBlur: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  statCardGradient: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 20,
    textAlign: 'center',
  },
  statLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  addressCard: {
    width: '100%',
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  addressCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,20,30,0.75)',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  addressCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 12,
  },
  addressIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  addressCardText: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  addressCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: -16,
  },
  addressCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressMapBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
  },
  addressMapBtnDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  addressMapBtnText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  // Cards
  card: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  cardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
    flex: 1,
  },
  cardCount: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  descriptionText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  // Hours
  hoursGrid: { gap: 2 },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  hoursDay: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  hoursTime: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },

  // Contact
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  contactText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.2,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
  },

  // Rewards
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  rewardThumb: { width: 32, height: 32, borderRadius: 8 },
  rewardThumbEmpty: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardName: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  rewardBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  rewardCost: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rewardMore: {
    ...fontStyles.body,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
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
    paddingBottom: 36,
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
