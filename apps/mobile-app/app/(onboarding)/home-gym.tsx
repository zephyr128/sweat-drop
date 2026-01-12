import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';

export default function HomeGymScreen() {
  const [gyms, setGyms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const router = useRouter();
  const { theme: currentTheme } = useTheme();

  useEffect(() => {
    loadGyms();
  }, []);

  const loadGyms = async () => {
    const { data, error } = await supabase
      .from('gyms')
      .select('*')
      .order('name');

    if (!error && data) {
      setGyms(data);
    }
    setLoading(false);
  };

  const handleContinue = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.replace('/home');
      return;
    }

    if (selectedGymId) {
      await supabase
        .from('profiles')
        .update({ home_gym_id: selectedGymId })
        .eq('id', user.id);
    }

    router.replace('/home');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Pure black background */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="fitness" size={48} color={currentTheme.colors.primary} />
          <Text style={styles.title}>Select Your Home Gym</Text>
          <Text style={styles.subtitle}>Optional - you can change this later</Text>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {gyms.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.gymItem,
                selectedGymId === item.id && [styles.gymItemSelected, { borderColor: currentTheme.colors.primary + '60' }],
              ]}
              onPress={() => setSelectedGymId(item.id)}
              activeOpacity={0.8}
            >
              <View style={styles.gymItemContent}>
                <Ionicons 
                  name={selectedGymId === item.id ? "checkmark-circle" : "ellipse-outline"} 
                  size={24} 
                  color={selectedGymId === item.id ? currentTheme.colors.primary : theme.colors.textSecondary} 
                />
                <View style={styles.gymItemText}>
                  <Text style={styles.gymName}>{item.name}</Text>
                  {item.city && <Text style={styles.gymLocation}>{item.city}</Text>}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[currentTheme.colors.primary, currentTheme.colors.primaryDark]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.buttonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.background} />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  list: {
    flex: 1,
    marginBottom: theme.spacing.lg,
  },
  listContent: {
    gap: theme.spacing.md,
  },
  gymItem: {
    backgroundColor: theme.glass.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.glass.border,
  },
  gymItemSelected: {
    borderWidth: 2,
  },
  gymItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  gymItemText: {
    flex: 1,
  },
  gymName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.5,
  },
  gymLocation: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  buttonContainer: {
    gap: theme.spacing.md,
  },
  primaryButton: {
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
    ...theme.shadows.glow,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  buttonText: {
    color: theme.colors.background,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.glass.border,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  skipButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
