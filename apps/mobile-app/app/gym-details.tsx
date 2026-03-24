import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import BackButton from '@/components/BackButton';
import { useGymStore, type Gym } from '@/lib/stores/useGymStore';
import { useGymData } from '@/hooks/useGymData';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles } from '@/lib/theme';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

function parseCoord(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function buildAddressLines(gym: Gym): string[] {
  const parts: string[] = [];
  if (gym.address?.trim()) parts.push(gym.address.trim());
  const cityLine = [gym.city, gym.country].filter(Boolean).join(', ');
  if (cityLine) parts.push(cityLine);
  return parts;
}

function buildMapsQuery(gym: Gym): string {
  const lines = buildAddressLines(gym);
  if (lines.length > 0) return lines.join(', ');
  return gym.name;
}

function openInMaps(gym: Gym, lat: number | null, lng: number | null) {
  if (lat != null && lng != null) {
    const q = `${lat},${lng}`;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
    return;
  }
  Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildMapsQuery(gym))}`
  );
}

/** OSM StaticMap (no API key). Keep query unencoded so commas stay valid for staticmap.php. */
function staticMapUrl(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=640x260&markers=${lat},${lng},red-pushpin`;
}

const NOMINATIM_USER_AGENT = 'SweatdropMobile/1.0 (https://sweatdrop.app)';

async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } });
  if (!res.ok) return null;
  const data: unknown = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { lat?: string; lon?: string };
  const lat = parseFloat(String(row.lat ?? ''));
  const lng = parseFloat(String(row.lon ?? ''));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export default function GymDetailsScreen() {
  const { t } = useTranslation('gymDetails');
  const branding = useBranding();
  const { getActiveGymId, activeGym } = useGymStore();
  const { loadActiveGym } = useGymData();
  const [loadFinished, setLoadFinished] = useState(false);

  const gymId = getActiveGymId();

  useFocusEffect(
    useCallback(() => {
      if (!gymId) return;
      setLoadFinished(false);
      void loadActiveGym(gymId).finally(() => setLoadFinished(true));
    }, [gymId, loadActiveGym])
  );

  const gym = activeGym;

  const [geocoded, setGeocoded] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [mapImageFailed, setMapImageFailed] = useState(false);

  const dbLat = gym ? parseCoord(gym.lat) : null;
  const dbLng = gym ? parseCoord(gym.lng) : null;

  const geocodeKey = useMemo(() => {
    if (!gym) return '';
    return [gym.id, gym.address ?? '', gym.city ?? '', gym.country ?? '', gym.name ?? ''].join('|');
  }, [gym?.id, gym?.address, gym?.city, gym?.country, gym?.name]);

  useEffect(() => {
    const g = useGymStore.getState().activeGym;
    if (!g) {
      setGeocoded(null);
      setGeocodeLoading(false);
      return;
    }
    const pLat = parseCoord(g.lat);
    const pLng = parseCoord(g.lng);
    if (pLat != null && pLng != null) {
      setGeocoded(null);
      setGeocodeLoading(false);
      return;
    }
    const query = buildMapsQuery(g);
    if (!query.trim()) {
      setGeocoded(null);
      setGeocodeLoading(false);
      return;
    }
    let cancelled = false;
    setGeocodeLoading(true);
    setGeocoded(null);
    void geocodeAddress(query)
      .then((coords) => {
        if (!cancelled) setGeocoded(coords);
      })
      .catch(() => {
        if (!cancelled) setGeocoded(null);
      })
      .finally(() => {
        if (!cancelled) setGeocodeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [geocodeKey, dbLat, dbLng]);

  const lat = dbLat ?? geocoded?.lat ?? null;
  const lng = dbLng ?? geocoded?.lng ?? null;
  const hasMapCoords = lat != null && lng != null;

  useEffect(() => {
    setMapImageFailed(false);
  }, [dbLat, dbLng, geocoded?.lat, geocoded?.lng]);

  const addressLines = gym ? buildAddressLines(gym) : [];
  const hoursText = (gym?.working_hours && gym.working_hours.trim()) || t('defaultHours');

  if (!gymId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.headerRow}>
          <BackButton />
        </View>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('noGym')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!gym) {
    if (!loadFinished) {
      return (
        <SafeAreaView style={styles.container} edges={['top']}>
          <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
          <View style={styles.headerRow}>
            <BackButton />
          </View>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={branding.primary} />
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.headerRow}>
          <BackButton />
        </View>
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('loadError')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} style={StyleSheet.absoluteFillObject} />

      <View style={styles.headerRow}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View
            style={[
              styles.logoRing,
              {
                borderColor: branding.primary,
                shadowColor: branding.primary,
              },
            ]}
          >
            {gym.logo_url ? (
              <Image source={{ uri: gym.logo_url }} style={styles.logoImage} contentFit="contain" />
            ) : (
              <Ionicons name="fitness" size={56} color={branding.primary} />
            )}
          </View>
          <Text style={styles.gymTitle} numberOfLines={3}>
            {gym.name}
          </Text>
        </View>

        <BlurView intensity={40} tint="dark" style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
          <View style={styles.cardRow}>
            <Ionicons name="location-outline" size={22} color={branding.primary} />
            <View style={styles.cardTextCol}>
              <Text style={styles.cardLabel}>{t('address')}</Text>
              {addressLines.length > 0 ? (
                addressLines.map((line, i) => (
                  <Text key={i} style={styles.cardValue}>
                    {line}
                  </Text>
                ))
              ) : (
                <Text style={styles.muted}>—</Text>
              )}
            </View>
          </View>
        </BlurView>

        <BlurView intensity={40} tint="dark" style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
          <View style={styles.cardRow}>
            <Ionicons name="time-outline" size={22} color={branding.primary} />
            <View style={styles.cardTextCol}>
              <Text style={styles.cardLabel}>{t('hours')}</Text>
              <Text style={styles.cardValue}>{hoursText}</Text>
            </View>
          </View>
        </BlurView>

        <Text style={styles.mapSectionLabel}>{t('mapHint')}</Text>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openInMaps(gym, lat, lng)}
          style={[styles.mapWrap, { borderColor: hexToRgba(branding.primary, 0.2) }]}
        >
          <View style={styles.mapInner}>
            {geocodeLoading && !hasMapCoords ? (
              <View style={styles.mapPlaceholder}>
                <ActivityIndicator size="large" color={branding.primary} />
                <Text style={styles.mapPlaceholderText}>{t('mapLoading')}</Text>
              </View>
            ) : hasMapCoords && !mapImageFailed ? (
              <Image
                source={{ uri: staticMapUrl(lat!, lng!) }}
                style={styles.mapImage}
                contentFit="cover"
                transition={200}
                onError={() => setMapImageFailed(true)}
                onLoad={() => setMapImageFailed(false)}
              />
            ) : hasMapCoords && mapImageFailed ? (
              <View style={styles.mapPlaceholder}>
                <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.35)" />
                <Text style={styles.mapPlaceholderText}>{t('mapLoadError')}</Text>
              </View>
            ) : (
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map-outline" size={48} color="rgba(255,255,255,0.35)" />
                <Text style={styles.mapPlaceholderText}>{t('noLocation')}</Text>
              </View>
            )}
          </View>
          <View style={[styles.mapChip, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
            <Ionicons name="navigate" size={16} color={branding.primary} />
            <Text style={[styles.mapChipText, { color: branding.primary }]}>{t('openInMaps')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  logoRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  logoImage: {
    width: 118,
    height: 118,
    borderRadius: 59,
  },
  gymTitle: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 16,
  },
  cardTextCol: {
    flex: 1,
    gap: 4,
  },
  cardLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardValue: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  muted: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  mapSectionLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 10,
    marginTop: 8,
  },
  mapWrap: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    height: 200,
    backgroundColor: 'rgba(20,20,30,0.9)',
  },
  mapInner: {
    flex: 1,
    minHeight: 200,
  },
  mapImage: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPlaceholder: {
    flex: 1,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  mapPlaceholderText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  mapChip: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  mapChipText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
