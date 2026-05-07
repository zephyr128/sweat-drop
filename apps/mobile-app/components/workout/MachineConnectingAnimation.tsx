/**
 * MachineConnectingAnimation
 *
 * Subtle premium indicator shown while waiting for BLE connection.
 * Three concentric pulsing rings with the machine-type icon in the center,
 * all tinted to the active gym's primary color.
 *
 * No SVG illustrations — just a clean, breathing glow that feels alive
 * without being distracting.
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

type MachineKind = 'bike' | 'treadmill' | 'elliptical' | 'stepper' | 'generic';

function normalizeMachineType(input?: string | null): MachineKind {
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

interface MachineConnectingAnimationProps {
  machineType?: string | null;
  primaryColor: string;
  size?: number;
  style?: ViewStyle;
}

export function MachineConnectingAnimation({
  machineType,
  primaryColor,
  size = 140,
  style,
}: MachineConnectingAnimationProps) {
  const kind = useMemo(() => normalizeMachineType(machineType), [machineType]);

  return (
    <View
      style={[styles.container, { width: size, height: size }, style]}
      pointerEvents="none"
    >
      <PulseRing color={primaryColor} size={size} delay={0} />
      <PulseRing color={primaryColor} size={size * 0.75} delay={400} />
      <PulseRing color={primaryColor} size={size * 0.5} delay={800} />

      {/* Center icon */}
      <View style={[styles.iconCircle, { backgroundColor: primaryColor + '18' }]}>
        <Ionicons name={iconForKind(kind)} size={32} color={primaryColor} />
      </View>
    </View>
  );
}

function PulseRing({
  color,
  size,
  delay,
}: {
  color: string;
  size: number;
  delay: number;
}) {
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 1800, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, phase]);

  const animStyle = useAnimatedStyle(() => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    opacity: interpolate(phase.value, [0, 0.5, 1], [0.06, 0.22, 0.06], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(phase.value, [0, 1], [0.92, 1.08], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        { backgroundColor: color + '20', borderColor: color + '15' },
        animStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MachineConnectingAnimation;
