import React from 'react';
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

export const PressableCard: React.FC<PressableCardProps> = ({
  onPress,
  disabled = false,
  style,
  children,
  haptic = 'light',
}) => {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 280, mass: 0.6 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.6 });
  };

  const handlePress = () => {
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
  };

  // Flatten so we can read flex/height/width for the outer wrapper
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const outerLayout: ViewStyle = {};
  if (flat?.flex !== undefined) outerLayout.flex = flat.flex;
  if (flat?.width !== undefined) outerLayout.width = flat.width;
  if (flat?.height !== undefined) outerLayout.height = flat.height;
  if (flat?.alignSelf !== undefined) outerLayout.alignSelf = flat.alignSelf;

  return (
    <Animated.View style={[outerLayout, animStyle]}>
      <Pressable
        onPress={handlePress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        disabled={disabled}
        style={styles.pressable}
      >
        {/* This View holds all visual card styling */}
        <View style={[styles.fill, style]}>
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pressable: {
    // Must fill the animated wrapper
    flex: 1,
  },
  fill: {
    flex: 1,
  },
});
