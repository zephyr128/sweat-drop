import { View, StyleSheet } from 'react-native';
import { theme } from '@/lib/theme';

interface OnboardingProgressProps {
  current: number;
  total: number;
  primaryColor?: string;
}

export function OnboardingProgress({
  current,
  total,
  primaryColor = theme.colors.primary,
}: OnboardingProgressProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              width: i === current - 1 ? 24 : 8,
              backgroundColor:
                i < current ? primaryColor : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 32,
  },
  dot: {
    height: 3,
    borderRadius: 2,
  },
});
