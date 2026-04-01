import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, fontStyles } from '@/lib/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/home');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Ionicons name="compass-outline" size={48} color="rgba(255,255,255,0.2)" />
      <Text style={styles.title}>Page not found</Text>
      <Text style={styles.subtitle}>Redirecting to home...</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace('/home')}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>Go home now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    marginTop: 8,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  button: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttonText: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 1.5,
    color: theme.colors.text,
  },
});
