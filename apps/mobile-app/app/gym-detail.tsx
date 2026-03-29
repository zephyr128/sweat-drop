import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useGymStore, Gym, GymWorkingHours } from '@/lib/stores/useGymStore';
import { useGymData } from '@/hooks/useGymData';
import { useSession } from '@/hooks/useSession';
import { theme } from '@/lib/theme';
import { BackButton } from '@/components/BackButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 260;

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function getTodayKey(): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[new Date().getDay()];
}

interface RewardPreview {
  id: string;
  name: string;
  drops_cost: number;
  image_url: string | null;
}

export default function GymDetailScreen() {
  const router = useRouter();
  const { session } = useSession();
  const params = useLocalSearchParams<{ gymId: string }>();
  const { homeGymId, setHomeGymId, setActiveGym, clearPreview } = useGymStore();
  const { updateHomeGym } = useGymData();

  const [gym, setGym] = useState<Gym | null>(null);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<RewardPreview[]>([]);
  const [settingHome, setSettingHome] = useState(false);

  const isHome = gym?.id === homeGymId;
  const brandColor = gym?.primary_color || theme.colors.primary;

  useEffect(() => {
    if (params.gymId) {
      loadGymDetails(params.gymId);
      loadRewardsPreview(params.gymId);
    }
  }, [params.gymId]);

  const loadGymDetails = async (gymId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', gymId)
        .single();

      if (error) throw error;
      if (!data) return;

      let branding = {
        primary_color: '#00E5FF',
        logo_url: null as string | null,
        background_url: null as string | null,
      };

      if (data.owner_id) {
        const { data: ownerBranding } = await supabase
          .from('owner_branding')
          .select('primary_color, logo_url, background_url')
          .eq('owner_id', data.owner_id)
          .single();

        if (ownerBranding) {
          branding = {
            primary_color: ownerBranding.primary_color || branding.primary_color,
            logo_url: ownerBranding.logo_url || branding.logo_url,
            background_url: ownerBranding.background_url || branding.background_url,
          };
        }
      }

      setGym({
        ...data,
        primary_color: branding.primary_color,
        logo_url: branding.logo_url,
        background_url: branding.background_url,
      });
    } catch (error) {
      console.error('Error loading gym details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRewardsPreview = async (gymId: string) => {
    try {
      const { data } = await supabase
        .from('rewards')
        .select('id, name, drops_cost, image_url')
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .order('drops_cost', { ascending: true })
        .limit(4);

      if (data) setRewards(data);
    } catch (error) {
      console.error('Error loading rewards preview:', error);
    }
  };

  const handleSetHomeGym = async () => {
    if (!gym || !session?.user) return;
    setSettingHome(true);
    try {
      await updateHomeGym(gym.id);
      Alert.alert(
        'Home Gym Set!',
        `${gym.name} is now your home gym. You can start earning drops here!`,
        [{ text: 'Great!', onPress: () => router.back() }]
      );
    } catch {
      Alert.alert('Error', 'Failed to set home gym. Please try again.');
    } finally {
      setSettingHome(false);
    }
  };

  const openInMaps = () => {
    if (!gym) return;
    if (gym.latitude && gym.longitude) {
      const url = Platform.select({
        ios: `maps:0,0?q=${gym.name}@${gym.latitude},${gym.longitude}`,
        android: `geo:${gym.latitude},${gym.longitude}?q=${gym.latitude},${gym.longitude}(${gym.name})`,
      });
      if (url) Linking.openURL(url);
    } else if (gym.address) {
      const q = encodeURIComponent(`${gym.address}, ${gym.city || ''}`);
      const url = Platform.select({
        ios: `maps:0,0?q=${q}`,
        android: `geo:0,0?q=${q}`,
      });
      if (url) Linking.openURL(url);
    }
  };

  const openInstagram = () => {
    if (!gym?.instagram) return;
    const handle = gym.instagram.replace('@', '');
    Linking.openURL(`https://instagram.com/${handle}`);
  };

  const callPhone = () => {
    if (!gym?.phone) return;
    Linking.openURL(`tel:${gym.phone}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!gym) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Gym not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.errorLink, { color: theme.colors.primary }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const todayKey = getTodayKey();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          {gym.background_url ? (
            <ImageBackground
              source={{ uri: gym.background_url }}
              style={styles.heroImage}
              resizeMode="cover"
            >
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                style={StyleSheet.absoluteFillObject}
              />
              <HeroContent gym={gym} brandColor={brandColor} isHome={isHome} />
            </ImageBackground>
          ) : (
            <LinearGradient
              colors={[hexToRgba(brandColor, 0.15), 'rgba(10,14,26,1)']}
              style={styles.heroImage}
            >
              <HeroContent gym={gym} brandColor={brandColor} isHome={isHome} />
            </LinearGradient>
          )}
          <SafeAreaView style={styles.backButtonPosition} edges={['top']}>
            <BackButton />
          </SafeAreaView>
        </View>

        {/* Address Card */}
        {(gym.address || gym.city) && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <TouchableOpacity
              style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}
              onPress={openInMaps}
              activeOpacity={0.8}
            >
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardRow}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.15) }]}>
                    <Ionicons name="location" size={20} color={brandColor} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardLabel}>Address</Text>
                    <Text style={styles.cardValue}>
                      {gym.address || ''}{gym.address && gym.city ? ', ' : ''}{gym.city || ''}
                      {gym.country ? `, ${gym.country}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="navigate-outline" size={20} color={theme.colors.textSecondary} />
                </View>
              </BlurView>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Working Hours Card */}
        {gym.working_hours && (
          <Animated.View entering={FadeInDown.delay(160).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.15) }]}>
                    <Ionicons name="time" size={20} color={brandColor} />
                  </View>
                  <Text style={styles.cardLabel}>Working Hours</Text>
                </View>
                <View style={styles.hoursGrid}>
                  {DAY_ORDER.map((day) => {
                    const hours = gym.working_hours?.[day];
                    const isToday = day === todayKey;
                    return (
                      <View key={day} style={[styles.hoursRow, isToday && styles.hoursRowToday]}>
                        <Text style={[styles.hoursDay, isToday && { color: brandColor, fontWeight: '700' }]}>
                          {DAY_LABELS[day]}
                        </Text>
                        <Text style={[styles.hoursTime, isToday && { color: brandColor, fontWeight: '600' }]}>
                          {hours ? `${hours.open} – ${hours.close}` : 'Closed'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* About Card */}
        {gym.description && (
          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.15) }]}>
                    <Ionicons name="information-circle" size={20} color={brandColor} />
                  </View>
                  <Text style={styles.cardLabel}>About</Text>
                </View>
                <Text style={styles.descriptionText}>{gym.description}</Text>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Contact Card */}
        {(gym.phone || gym.instagram || gym.website) && (
          <Animated.View entering={FadeInDown.delay(280).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.15) }]}>
                    <Ionicons name="call" size={20} color={brandColor} />
                  </View>
                  <Text style={styles.cardLabel}>Contact</Text>
                </View>
                <View style={styles.contactList}>
                  {gym.phone && (
                    <TouchableOpacity style={styles.contactRow} onPress={callPhone} activeOpacity={0.7}>
                      <Ionicons name="call-outline" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.contactText}>{gym.phone}</Text>
                      <Text style={[styles.contactAction, { color: brandColor }]}>Call</Text>
                    </TouchableOpacity>
                  )}
                  {gym.instagram && (
                    <TouchableOpacity style={styles.contactRow} onPress={openInstagram} activeOpacity={0.7}>
                      <Ionicons name="logo-instagram" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.contactText}>{gym.instagram}</Text>
                      <Text style={[styles.contactAction, { color: brandColor }]}>Open</Text>
                    </TouchableOpacity>
                  )}
                  {gym.website && (
                    <TouchableOpacity
                      style={styles.contactRow}
                      onPress={() => Linking.openURL(gym.website!)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="globe-outline" size={16} color={theme.colors.textSecondary} />
                      <Text style={styles.contactText} numberOfLines={1}>{gym.website}</Text>
                      <Text style={[styles.contactAction, { color: brandColor }]}>Visit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Rewards Preview */}
        {rewards.length > 0 && (
          <Animated.View entering={FadeInDown.delay(340).duration(400)}>
            <View style={[styles.card, { borderColor: hexToRgba(brandColor, 0.12) }]}>
              <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.cardIcon, { backgroundColor: hexToRgba(brandColor, 0.15) }]}>
                    <Ionicons name="gift" size={20} color={brandColor} />
                  </View>
                  <Text style={styles.cardLabel}>Available Rewards</Text>
                </View>
                <View style={styles.rewardsList}>
                  {rewards.map((reward) => (
                    <View key={reward.id} style={styles.rewardRow}>
                      <Text style={styles.rewardName} numberOfLines={1}>{reward.name}</Text>
                      <View style={styles.rewardCost}>
                        <Ionicons name="water" size={12} color={brandColor} />
                        <Text style={[styles.rewardCostText, { color: brandColor }]}>
                          {reward.drops_cost}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
                {rewards.length >= 4 && (
                  <Text style={[styles.moreText, { color: hexToRgba(brandColor, 0.6) }]}>
                    ...and more
                  </Text>
                )}
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Spacer for sticky CTA */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      {!isHome && session && (
        <View style={styles.stickyCta}>
          <BlurView intensity={80} tint="dark" style={styles.stickyCtaBlur}>
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
                  <Ionicons name="home-outline" size={20} color="#000" />
                  <Text style={styles.ctaText}>Set as Home Gym</Text>
                </>
              )}
            </TouchableOpacity>
          </BlurView>
        </View>
      )}
    </SafeAreaView>
  );
}

interface HeroContentProps {
  gym: Gym;
  brandColor: string;
  isHome: boolean;
}

const HeroContent: React.FC<HeroContentProps> = ({ gym, brandColor, isHome }) => (
  <View style={styles.heroContent}>
    {gym.logo_url ? (
      <Image source={{ uri: gym.logo_url }} style={styles.heroLogo} resizeMode="contain" />
    ) : (
      <View style={[styles.heroLogoPlaceholder, { backgroundColor: brandColor + '25' }]}>
        <Ionicons name="fitness" size={40} color={brandColor} />
      </View>
    )}
    <Text style={styles.heroName}>{gym.name}</Text>
    {gym.is_founding_partner && (
      <View style={styles.heroFoundingBadge}>
        <Ionicons name="medal" size={14} color="#FFD700" />
        <Text style={styles.heroFoundingText}>Founding Partner</Text>
      </View>
    )}
    {isHome && (
      <View style={[styles.heroHomeBadge, { borderColor: brandColor + '50' }]}>
        <Ionicons name="checkmark-circle" size={14} color={brandColor} />
        <Text style={[styles.heroHomeText, { color: brandColor }]}>Your Home Gym</Text>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  errorLink: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  heroContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    justifyContent: 'flex-end',
  },
  heroContent: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    gap: 8,
  },
  heroLogo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    marginBottom: 4,
  },
  heroLogoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  heroFoundingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,215,0,0.12)',
  },
  heroFoundingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 0.5,
  },
  heroHomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroHomeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  backButtonPosition: {
    position: 'absolute',
    top: 0,
    left: 16,
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardBlur: {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    padding: 18,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    lineHeight: 22,
  },

  hoursGrid: {
    gap: 6,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  hoursRowToday: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  hoursDay: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  hoursTime: {
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    fontFamily: 'Courier',
  },

  descriptionText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    lineHeight: 24,
    letterSpacing: 0.2,
  },

  contactList: {
    gap: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contactText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  contactAction: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  rewardsList: {
    gap: 10,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rewardName: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginRight: 12,
  },
  rewardCost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rewardCostText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  moreText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  stickyCta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  stickyCtaBlur: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
});
