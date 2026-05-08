/**
 * MachineNotInRangeOverlay
 *
 * Full-screen overlay displayed when BLE scanning finds no peripheral that
 * matches the session's paired sensor_id.  This replaces the generic
 * "reconnecting" loop for the specific case where the machine is simply off.
 *
 * AGENT NOTE: [2026-05-08] - mobile-coder (BLE cross-talk fix, Step 1)
 * Shown on BlePeripheralNotFoundError.  Unlocks the machine immediately so
 * no other user is blocked by a stale lock, then directs the user to power
 * the machine on and rescan the QR code.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';

interface MachineNotInRangeOverlayProps {
  primaryColor: string;
  machineType?: string | null;
  onEndAndRescan: () => void;
}

export function MachineNotInRangeOverlay({
  primaryColor,
  machineType,
  onEndAndRescan,
}: MachineNotInRangeOverlayProps) {
  const { t } = useTranslation('workout');

  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    machineType === 'bike' ? 'bicycle-outline'
    : machineType === 'treadmill' ? 'walk-outline'
    : machineType === 'elliptical' ? 'fitness-outline'
    : 'bluetooth-outline';

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.overlay}>
      {/* Icon badge */}
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.error + '18' }]}>
        <Ionicons name="bluetooth-outline" size={52} color={theme.colors.error} />
        <View style={styles.machineIconBadge}>
          <Ionicons name={icon} size={22} color={primaryColor} />
        </View>
      </View>

      {/* Copy */}
      <Animated.View entering={FadeInDown.delay(80).duration(260)} style={styles.copyBlock}>
        <Text style={styles.title}>{t('machineNotInRangeTitle')}</Text>
        <Text style={styles.body}>{t('machineNotInRangeBody')}</Text>
      </Animated.View>

      {/* Instruction card */}
      <Animated.View entering={FadeInDown.delay(140).duration(260)} style={styles.cardWrap}>
        <PlatformBlur
          intensity={50}
          tint="dark"
          androidColor="rgba(14,16,26,0.88)"
          style={styles.card}
        >
          <View style={styles.cardBorder} pointerEvents="none" />
          <Ionicons name="power-outline" size={20} color={primaryColor} />
          <Text style={[styles.cardText, { color: primaryColor }]}>
            {t('machineNotInRangePowerHint')}
          </Text>
        </PlatformBlur>
      </Animated.View>

      {/* CTA */}
      <Animated.View entering={FadeInDown.delay(200).duration(260)}>
        <TouchableOpacity
          style={[styles.ctaButton, { borderColor: theme.colors.error + '88' }]}
          onPress={onEndAndRescan}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Ionicons name="qr-code-outline" size={18} color={theme.colors.error} />
          <Text style={[styles.ctaText, { color: theme.colors.error }]}>
            {t('machineNotInRangeAction')}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 110,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  machineIconBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(10,14,26,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBlock: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 20,
    textAlign: 'center',
  },
  body: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  cardWrap: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 14,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,16,26,0.78)',
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cardText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    flex: 1,
    flexWrap: 'wrap',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(239,68,68,0.10)',
    marginTop: theme.spacing.sm,
  },
  ctaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});

export default MachineNotInRangeOverlay;
