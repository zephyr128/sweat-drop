import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import Animated, { SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { theme, fontStyles } from '@/lib/theme';

interface WorkoutControlsProps {
  isPaused: boolean;
  onPauseResume: () => void;
  onFinishPressIn: () => void;
  onFinishPressOut: () => void;
  finishButtonStyle: any;
  finishWorkoutLabel: string;
  primaryColor: string;
  showPauseButton?: boolean;
}

export default function WorkoutControls({
  isPaused,
  onPauseResume,
  onFinishPressIn,
  onFinishPressOut,
  finishButtonStyle,
  finishWorkoutLabel,
  primaryColor,
  showPauseButton = true,
}: WorkoutControlsProps) {
  return (
    <View style={styles.controls}>
      {showPauseButton && (
        <TouchableOpacity
          style={[styles.controlButton, styles.pauseButton]}
          onPress={onPauseResume}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPaused ? 'play' : 'pause'}
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      )}

      <Pressable
        style={styles.finishButtonContainer}
        onPressIn={onFinishPressIn}
        onPressOut={onFinishPressOut}
      >
        <View
          style={[
            styles.finishButton,
            {
              backgroundColor: primaryColor + '18',
              borderColor: primaryColor + '60',
            },
          ]}
        >
          <Animated.View
            style={[
              styles.finishButtonFill,
              finishButtonStyle,
              { backgroundColor: primaryColor },
            ]}
          />
          <Text style={styles.finishButtonText}>{finishWorkoutLabel}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  pauseButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  finishButtonContainer: {
    flex: 1,
  },
  finishButton: {
    height: 56,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  finishButtonFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    opacity: 0.9,
  },
  finishButtonText: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 20,
    zIndex: 1,
  },
});
