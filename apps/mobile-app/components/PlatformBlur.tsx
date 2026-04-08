/**
 * PlatformBlur — cross-platform blur utility.
 *
 * expo-blur's BlurView works natively on iOS.
 * On Android it renders nothing visible (transparent), so we fall back to
 * a solid dark overlay that matches the app's dark design system.
 *
 * Usage:
 *   <PlatformBlur intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
 *
 * For glass cards (dark overlay on top of content, not fullscreen):
 *   <PlatformBlur intensity={40} tint="dark" style={styles.cardBackground} androidColor="rgba(14,17,24,0.97)" />
 */

import React from 'react';
import { Platform, StyleSheet, StyleProp, View, ViewStyle } from 'react-native';
import { BlurView, BlurViewProps } from 'expo-blur';

interface PlatformBlurProps extends Omit<BlurViewProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /**
   * Android fallback background color.
   * Use a semi-transparent dark color for overlays/modals,
   * or a solid dark color for glass cards.
   * Defaults to 'rgba(10,14,22,0.97)' (near-black, matches app background).
   */
  androidColor?: string;
  children?: React.ReactNode;
}

export function PlatformBlur({
  style,
  intensity = 60,
  tint = 'dark',
  androidColor = 'rgba(10,14,22,0.97)',
  children,
  ...rest
}: PlatformBlurProps) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={tint} style={style as any} {...rest}>
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[style, { backgroundColor: androidColor }]}>
      {children}
    </View>
  );
}

/**
 * PlatformBlurOverlay — for full-screen modal backdrops.
 * iOS: blur + dark tint. Android: near-opaque dark overlay.
 */
export function PlatformBlurOverlay({
  opacity = 0.88,
  blurIntensity = 40,
  style,
}: {
  opacity?: number;
  blurIntensity?: number;
  style?: ViewStyle;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={blurIntensity}
        tint="dark"
        style={[StyleSheet.absoluteFillObject, style]}
      />
    );
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: `rgba(0,0,0,${opacity})` },
        style,
      ]}
    />
  );
}
