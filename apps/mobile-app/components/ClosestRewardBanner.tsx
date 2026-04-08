import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import { getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import { useTranslation } from 'react-i18next';

/* ── Types ────────────────────────────────────────── */
interface ClosestRewardBannerProps {
  reward: {
    name: string;
    priceDrops: number;
    rewardType: string;
    dropsAway: number;
    canAfford: boolean;
  };
  brandPrimary: string;
  onPress: () => void;
}

function getRewardIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'coffee':
      return 'cafe-outline';
    case 'protein':
      return 'nutrition-outline';
    case 'discount':
      return 'pricetag-outline';
    case 'merch':
      return 'shirt-outline';
    default:
      return 'gift-outline';
  }
}

/* ── Component ────────────────────────────────────── */
export const ClosestRewardBanner: React.FC<ClosestRewardBannerProps> = ({
  reward,
  brandPrimary,
  onPress,
}) => {
  const { t } = useTranslation('home');
  const icon = getRewardIcon(reward.rewardType);
  const canAfford = reward.canAfford;

  return (
    <TouchableOpacity
      style={[
        styles.wrapper,
        {
          borderColor: canAfford
            ? hexToRgba('#4CAF50', 0.3)
            : hexToRgba(brandPrimary, 0.15),
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.blur}>
        <View style={[styles.iconBg, { backgroundColor: canAfford ? 'rgba(76, 175, 80, 0.15)' : hexToRgba(brandPrimary, 0.12) }]}>
          <Ionicons
            name={icon}
            size={18}
            color={canAfford ? '#4CAF50' : brandPrimary}
          />
        </View>

        <View style={styles.textCol}>
          {canAfford ? (
            <Text style={styles.bannerText}>
              <Text style={[fontStyles.bodySemiBold, { color: '#4CAF50' }]}>{t('rewardRedeem')} </Text>
              <Text style={[fontStyles.bodySemiBold, { color: '#FFFFFF' }]}>{reward.name}</Text>
            </Text>
          ) : (
            <Text style={styles.bannerText}>
              <Text style={[getNumberStyle(13), { color: brandPrimary }]}>
                {reward.dropsAway}
              </Text>
              <Text style={{ color: '#B0B0B0' }}> {t('rewardDropsTo')} </Text>
              <Text style={[fontStyles.bodySemiBold, { color: '#FFFFFF' }]}>{reward.name}</Text>
            </Text>
          )}
        </View>

        <Ionicons
          name="chevron-forward"
          size={16}
          color={canAfford ? '#4CAF50' : hexToRgba(brandPrimary, 0.6)}
        />
      </PlatformBlur>
    </TouchableOpacity>
  );
};

/* ── Styles ───────────────────────────────────────── */
const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 20,
  },
  blur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  bannerText: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#B0B0B0',
    letterSpacing: 0.2,
  },
});
