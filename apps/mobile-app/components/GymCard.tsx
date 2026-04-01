import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Gym, GymWorkingHours } from '@/lib/stores/useGymStore';
import { theme, fontStyles } from '@/lib/theme';

interface GymCardProps {
  gym: Gym;
  isHomeGym?: boolean;
  onSetHomeGym?: () => void;
  onDetails?: () => void;
  variant?: 'full' | 'compact';
}

function getTodayHours(hours: GymWorkingHours | null | undefined): string | null {
  if (!hours) return null;
  const days: Array<keyof GymWorkingHours> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = days[new Date().getDay()];
  const todayHours = hours[today];
  if (!todayHours) return null;
  return `${todayHours.open} – ${todayHours.close}`;
}

export const GymCard: React.FC<GymCardProps> = ({
  gym,
  isHomeGym = false,
  onSetHomeGym,
  onDetails,
  variant = 'full',
}) => {
  const brandColor = gym.primary_color || theme.colors.primary;
  const todayHours = getTodayHours(gym.working_hours);

  return (
    <View style={styles.cardOuter}>
      {gym.background_url ? (
        <View style={styles.cardBackground}>
          <Image
            source={gym.background_url}
            style={[StyleSheet.absoluteFillObject, styles.cardBackgroundImage]}
            contentFit="cover"
            transition={200}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(10,10,20,0.92)', 'rgba(0,0,0,0.97)']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
          <CardContent
            gym={gym}
            brandColor={brandColor}
            isHomeGym={isHomeGym}
            todayHours={todayHours}
            onSetHomeGym={onSetHomeGym}
            onDetails={onDetails}
            variant={variant}
          />
        </View>
      ) : (
        <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
          <CardContent
            gym={gym}
            brandColor={brandColor}
            isHomeGym={isHomeGym}
            todayHours={todayHours}
            onSetHomeGym={onSetHomeGym}
            onDetails={onDetails}
            variant={variant}
          />
        </BlurView>
      )}
    </View>
  );
};

interface CardContentProps {
  gym: Gym;
  brandColor: string;
  isHomeGym: boolean;
  todayHours: string | null;
  onSetHomeGym?: () => void;
  onDetails?: () => void;
  variant: 'full' | 'compact';
}

const CardContent: React.FC<CardContentProps> = ({
  gym,
  brandColor,
  isHomeGym,
  todayHours,
  onSetHomeGym,
  onDetails,
  variant,
}) => {
  return (
    <View style={styles.cardInner}>
      {/* Header: Logo + Name + Badge */}
      <View style={styles.headerRow}>
        {gym.logo_url ? (
          <Image
            source={gym.logo_url}
            style={styles.logo}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={[styles.logoPlaceholder, { backgroundColor: brandColor + '25' }]}>
            <Ionicons name="fitness" size={28} color={brandColor} />
          </View>
        )}

        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.gymName} numberOfLines={1}>
              {gym.name}
            </Text>
            {isHomeGym && (
              <View style={[styles.homeBadge, { borderColor: brandColor + '40' }]}>
                <Ionicons name="home" size={10} color={brandColor} />
                <Text style={[styles.homeBadgeText, { color: brandColor }]}>Home</Text>
              </View>
            )}
          </View>
          {gym.is_founding_partner && (
            <View style={styles.foundingBadge}>
              <Ionicons name="medal" size={12} color="#FFD700" />
              <Text style={styles.foundingBadgeText}>Founding Partner</Text>
            </View>
          )}
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoSection}>
        {gym.address && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>
              {gym.address}{gym.city ? `, ${gym.city}` : ''}
            </Text>
          </View>
        )}
        {!gym.address && gym.city && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>
              {gym.city}{gym.country ? `, ${gym.country}` : ''}
            </Text>
          </View>
        )}
        {todayHours && (
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>Today {todayHours}</Text>
          </View>
        )}
      </View>

      {/* Action buttons (full variant only) */}
      {variant === 'full' && (
        <View style={styles.actionsRow}>
          {!isHomeGym && onSetHomeGym && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: brandColor }]}
              onPress={onSetHomeGym}
              activeOpacity={0.8}
            >
              <Ionicons name="home-outline" size={16} color="#000" />
              <Text style={styles.primaryBtnText}>Set as Home Gym</Text>
            </TouchableOpacity>
          )}
          {isHomeGym && (
            <View style={[styles.homeActiveTag, { borderColor: brandColor + '40' }]}>
              <Ionicons name="checkmark-circle" size={16} color={brandColor} />
              <Text style={[styles.homeActiveText, { color: brandColor }]}>Your Home Gym</Text>
            </View>
          )}
          {onDetails && (
            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={onDetails}
              activeOpacity={0.7}
            >
              <Text style={[styles.detailsBtnText, { color: brandColor }]}>Details</Text>
              <Ionicons name="arrow-forward" size={14} color={brandColor} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardBackground: {
    width: '100%',
    minHeight: 180,
  },
  cardBackgroundImage: {
    borderRadius: 20,
  },
  cardBlur: {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
    minHeight: 180,
  },
  cardInner: {
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gymName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  homeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  homeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  foundingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  foundingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFD700',
    letterSpacing: 0.4,
  },
  infoSection: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 15,
    letterSpacing: 1.5,
    color: '#000',
  },
  homeActiveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  homeActiveText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 'auto',
  },
  detailsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
