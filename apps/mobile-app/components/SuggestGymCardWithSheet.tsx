import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { WaitlistBottomSheet } from '@/components/WaitlistBottomSheet';
import { fontStyles, hexToRgba, theme as baseTheme } from '@/lib/theme';

export type SuggestGymCardVariant = 'homeCarousel' | 'gymsList' | 'onboarding';

type Props = {
  variant: SuggestGymCardVariant;
  brandColor: string;
  /** When set, wraps the card in `FadeInDown` with this delay (onboarding ordering). */
  fadeInDelay?: number;
};

/**
 * Pressable “suggest a gym” card + shared `WaitlistBottomSheet` (gym waitlist form).
 * Use everywhere we surface gym suggestions so open/close and Supabase submit stay consistent.
 */
export function SuggestGymCardWithSheet({ variant, brandColor, fadeInDelay }: Props) {
  const [open, setOpen] = useState(false);
  const { t: tHome } = useTranslation('home');
  const { t: tGyms } = useTranslation('gyms');
  const { t: tOnboarding } = useTranslation('onboarding');

  const close = useCallback(() => setOpen(false), []);

  let card: React.ReactNode;
  if (variant === 'homeCarousel') {
    card = (
      <TouchableOpacity
        style={[styles.homeCarouselCard, { borderColor: hexToRgba(brandColor, 0.12) }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.homeCarouselIconWrap,
            {
              backgroundColor: hexToRgba(brandColor, 0.08),
              borderColor: hexToRgba(brandColor, 0.2),
            },
          ]}
        >
          <Ionicons name="add" size={22} color={hexToRgba(brandColor, 0.7)} />
        </View>
        <Text style={[styles.homeCarouselTitle, { color: 'rgba(255,255,255,0.5)' }]}>
          {tHome('notYourGym')}
        </Text>
        <Text style={[styles.homeCarouselSub, { color: hexToRgba(brandColor, 0.55) }]}>{tHome('suggestGym')}</Text>
      </TouchableOpacity>
    );
  } else if (variant === 'gymsList') {
    card = (
      <TouchableOpacity
        style={[styles.gymsListCard, { borderColor: hexToRgba(brandColor, 0.2) }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <View style={styles.gymsListInner}>
          <View
            style={[
              styles.gymsListIcon,
              {
                backgroundColor: hexToRgba(brandColor, 0.12),
                borderColor: hexToRgba(brandColor, 0.25),
              },
            ]}
          >
            <Ionicons name="add-circle-outline" size={24} color={brandColor} />
          </View>
          <View style={styles.gymsListText}>
            <Text style={styles.gymsListTitle}>{tGyms('suggestGymTitle')}</Text>
            <Text style={styles.gymsListSub}>{tGyms('suggestGymSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={baseTheme.colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  } else {
    card = (
      <TouchableOpacity style={styles.onboardingCard} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={20} color={brandColor} />
        <View style={styles.onboardingText}>
          <Text style={[styles.onboardingTitle, { color: baseTheme.colors.textSecondary }]}>
            {tOnboarding('homeGym.comingSoon')}
          </Text>
          <Text style={styles.onboardingSub}>{tOnboarding('homeGym.comingSoonSub')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const inner = fadeInDelay !== undefined ? (
    <Animated.View entering={FadeInDown.delay(fadeInDelay).duration(380)}>{card}</Animated.View>
  ) : (
    card
  );

  return (
    <>
      {inner}
      <WaitlistBottomSheet visible={open} onClose={close} brandColor={brandColor} />
    </>
  );
}

const styles = StyleSheet.create({
  homeCarouselCard: {
    width: 220,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(14,14,24,0.50)',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  homeCarouselIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeCarouselTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  homeCarouselSub: {
    ...fontStyles.body,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },

  gymsListCard: {
    borderRadius: baseTheme.borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  gymsListInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: baseTheme.spacing.md,
    backgroundColor: 'rgba(20,20,30,0.70)',
    borderRadius: baseTheme.borderRadius.xl,
  },
  gymsListIcon: {
    width: 48,
    height: 48,
    borderRadius: baseTheme.borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  gymsListText: {
    flex: 1,
    gap: 3,
  },
  gymsListTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: baseTheme.colors.text,
  },
  gymsListSub: {
    ...fontStyles.body,
    fontSize: 13,
    color: baseTheme.colors.textSecondary,
    lineHeight: 18,
  },

  onboardingCard: {
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
  onboardingText: {
    flex: 1,
    gap: 2,
  },
  onboardingTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  onboardingSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: baseTheme.colors.textTertiary,
    letterSpacing: 0.2,
    lineHeight: 18,
  },
});
