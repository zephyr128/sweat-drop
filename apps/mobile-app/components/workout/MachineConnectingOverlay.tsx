/**
 * MachineConnectingOverlay
 *
 * Premium full-screen overlay shown while waiting for BLE connection.
 * Subtle pulsing glow rings + machine-type icon in the center, with
 * action-first copy telling the user what to do ("Start pedaling",
 * "Turn on the treadmill and start walking", etc).
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { theme, fontStyles } from '@/lib/theme';
import { MachineConnectingAnimation } from './MachineConnectingAnimation';

type MachineKind = 'bike' | 'treadmill' | 'elliptical' | 'stepper' | 'generic';

function normalizeKind(input?: string | null): MachineKind {
  const v = (input || '').toLowerCase();
  if (v.includes('bike') || v.includes('cycle')) return 'bike';
  if (v.includes('tread') || v.includes('run') || v.includes('walk')) return 'treadmill';
  if (v.includes('ellip')) return 'elliptical';
  if (v.includes('step') || v.includes('climb')) return 'stepper';
  return 'generic';
}

function iconForKind(kind: MachineKind): React.ComponentProps<typeof Ionicons>['name'] {
  switch (kind) {
    case 'bike':
      return 'bicycle-outline';
    case 'treadmill':
      return 'walk-outline';
    case 'elliptical':
      return 'fitness-outline';
    case 'stepper':
      return 'trending-up-outline';
    default:
      return 'bluetooth-outline';
  }
}

interface MachineConnectingOverlayProps {
  machineType?: string | null;
  machineName?: string | null;
  bleStatus?: string;
  primaryColor: string;
  showCancel: boolean;
  hasSyncedDuration: boolean;
  onCancelOrFinish: () => void;
}

export function MachineConnectingOverlay({
  machineType,
  machineName,
  bleStatus,
  primaryColor,
  showCancel,
  hasSyncedDuration,
  onCancelOrFinish,
}: MachineConnectingOverlayProps) {
  const { t } = useTranslation('workout');

  const kind = useMemo(() => normalizeKind(machineType), [machineType]);

  const title = machineName
    ? t('connectingTitleNamed', { name: machineName })
    : t('connectingTitle');

  const actionTitle = t(`connectStart.${kind}.title`);
  const actionBody = t(`connectStart.${kind}.body`);

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={styles.overlay}
    >
      {/* Subtle pulsing glow + machine icon */}
      <View style={styles.glowWrap}>
        <MachineConnectingAnimation
          machineType={machineType}
          primaryColor={primaryColor}
          size={140}
        />
      </View>

      {/* Headline */}
      <Animated.View
        entering={FadeInDown.delay(80).duration(260)}
        style={styles.copyBlock}
      >
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* Action instruction card */}
        <View style={styles.actionCard}>
          <PlatformBlur
            intensity={50}
            tint="dark"
            androidColor="rgba(14,16,26,0.85)"
            style={styles.actionCardInner}
          >
            <View style={styles.actionCardBorder} pointerEvents="none" />
            <View style={[styles.actionIcon, { backgroundColor: primaryColor + '22' }]}>
              <Ionicons name={iconForKind(kind)} size={20} color={primaryColor} />
            </View>
            <View style={styles.actionTextBlock}>
              <Text style={[styles.actionTitle, { color: primaryColor }]}>
                {actionTitle}
              </Text>
              <Text style={styles.actionBody}>{actionBody}</Text>
            </View>
          </PlatformBlur>
        </View>

        {/* Live BLE status */}
        {bleStatus ? (
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: primaryColor }]} />
            <Text style={styles.statusPillText} numberOfLines={1}>
              {bleStatus}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      {/* Escape hatch */}
      {showCancel && (
        <Animated.View entering={FadeInDown.delay(160).duration(260)}>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: theme.colors.error + '88' }]}
            onPress={onCancelOrFinish}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons
              name={hasSyncedDuration ? 'checkmark-circle-outline' : 'close-circle-outline'}
              size={18}
              color={theme.colors.error}
            />
            <Text style={[styles.cancelButtonText, { color: theme.colors.error }]}>
              {hasSyncedDuration ? t('cantConnectFinish') : t('cancelWorkout')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
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
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: theme.spacing.lg,
  },
  glowWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  copyBlock: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  title: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  actionCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  actionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(14,16,26,0.78)',
  },
  actionCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  actionBody: {
    ...fontStyles.body,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textSecondary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    maxWidth: '100%',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.9,
  },
  statusPillText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(239,68,68,0.10)',
    marginTop: theme.spacing.lg,
  },
  cancelButtonText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});

export default MachineConnectingOverlay;
