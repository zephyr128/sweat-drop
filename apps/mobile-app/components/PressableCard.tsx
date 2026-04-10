import React, { useCallback, useMemo } from 'react';
import { Pressable, View, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface PressableCardProps {
  onPress?: () => void;
  disabled?: boolean;
  /** Visual card styles (bg, border, borderRadius, overflow, flex, etc.) */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
}

export const PressableCard: React.FC<PressableCardProps> = React.memo(function PressableCard({
  onPress,
  disabled = false,
  style,
  children,
  haptic = 'light',
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 280, mass: 0.6 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.6 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    if (haptic !== 'none') {
      const feedbackStyle =
        haptic === 'medium'
          ? Haptics.ImpactFeedbackStyle.Medium
          : haptic === 'heavy'
            ? Haptics.ImpactFeedbackStyle.Heavy
            : Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(feedbackStyle).catch(() => {});
    }
    onPress();
  }, [onPress, haptic]);

  const flat = useMemo(() => StyleSheet.flatten(style) as ViewStyle | undefined, [style]);
  const outerLayout = useMemo<ViewStyle>(() => {
    const layout: ViewStyle = {};
    if (flat?.flex !== undefined) layout.flex = flat.flex;
    if (flat?.width !== undefined) layout.width = flat.width;
    if (flat?.height !== undefined) layout.height = flat.height;
    if (flat?.alignSelf !== undefined) layout.alignSelf = flat.alignSelf;
    return layout;
  }, [flat?.flex, flat?.width, flat?.height, flat?.alignSelf]);

  const innerStyle = useMemo(() => [styles.fill, style], [style]);

  return (
    <Animated.View style={[outerLayout, animStyle]}>
      <Pressable
        onPress={handlePress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
        style={styles.pressable}
      >
        <View style={innerStyle}>
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pressable: {
    // Must fill the animated wrapper
    flex: 1,
  },
  fill: {
    flex: 1,
  },
});
