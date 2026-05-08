/**
 * PeripheralMismatchModal
 *
 * Safety modal shown when the mid-session peripheral guard detects that the
 * currently connected BLE peripheral does not match the machine paired in the
 * database (peripheral_id_mismatch).  The workout is force-finalised and drops
 * are awarded only for the verified activity before the mismatch was detected.
 *
 * AGENT NOTE: [2026-05-08] - mobile-coder (BLE cross-talk fix, Step 3)
 * This is the "last line of defence" safety brake after Step 1 already
 * prevents wrong-machine connections at initial connect time.  It handles the
 * residual case where a reconnect cycle could re-introduce cross-talk.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { theme, fontStyles } from '@/lib/theme';
import { useTranslation } from 'react-i18next';

interface PeripheralMismatchModalProps {
  primaryColor: string;
  onAcknowledge: () => void;
}

export function PeripheralMismatchModal({
  primaryColor,
  onAcknowledge,
}: PeripheralMismatchModalProps) {
  const { t } = useTranslation('workout');

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.overlay}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.error + '18' }]}>
        <Ionicons name="warning-outline" size={52} color={theme.colors.error} />
      </View>

      {/* Copy */}
      <Animated.View entering={FadeInDown.delay(80).duration(260)} style={styles.copyBlock}>
        <Text style={styles.title}>{t('peripheralMismatchTitle')}</Text>

        <View style={styles.cardWrap}>
          <PlatformBlur
            intensity={50}
            tint="dark"
            androidColor="rgba(14,16,26,0.88)"
            style={styles.card}
          >
            <View style={styles.cardBorder} pointerEvents="none" />
            <Ionicons name="shield-checkmark-outline" size={18} color={primaryColor} />
            <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
              {t('peripheralMismatchBody')}
            </Text>
          </PlatformBlur>
        </View>
      </Animated.View>

      {/* CTA */}
      <Animated.View entering={FadeInDown.delay(160).duration(260)}>
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: primaryColor + '22', borderColor: primaryColor + '55' }]}
          onPress={onAcknowledge}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: primaryColor }]}>
            {t('peripheralMismatchAction')}
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
    zIndex: 120,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBlock: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 20,
    textAlign: 'center',
  },
  cardWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    ...fontStyles.body,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
    flexWrap: 'wrap',
  },
  ctaButton: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: theme.spacing.sm,
    alignItems: 'center',
    minWidth: 120,
  },
  ctaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
});

export default PeripheralMismatchModal;
