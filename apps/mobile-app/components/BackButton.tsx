import { TouchableOpacity, StyleSheet } from 'react-native';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { theme, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';

export default function BackButton() {
  const router = useThrottledRouter();
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
    marginRight: 12,
    borderWidth: 1,
  },
});
