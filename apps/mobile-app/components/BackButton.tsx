import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function BackButton() {
  const router = useRouter();
  const branding = useBranding();

  return (
    <TouchableOpacity
      style={[styles.button, { borderColor: hexToRgba(branding.primary, 0.15) }]}
      onPress={() => router.back()}
      activeOpacity={0.7}
    >
      <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    borderWidth: 1,
  },
});
