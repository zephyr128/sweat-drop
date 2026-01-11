import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function HomeGymScreen() {
  const [gyms, setGyms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);
  const router = useRouter();

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
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Select Your Home Gym</Text>
        <Text style={styles.subtitle}>Optional - you can change this later</Text>

        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.gymItem,
                selectedGymId === item.id && styles.gymItemSelected,
              ]}
              onPress={() => setSelectedGymId(item.id)}
            >
              <Text style={styles.gymName}>{item.name}</Text>
              {item.city && <Text style={styles.gymLocation}>{item.city}</Text>}
            </TouchableOpacity>
          )}
          style={styles.list}
        />

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.skipButton]}
          onPress={handleContinue}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  list: {
    flex: 1,
    marginBottom: 16,
  },
  gymItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gymItemSelected: {
    borderColor: '#6366f1',
  },
  gymName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  gymLocation: {
    fontSize: 14,
    color: '#6b7280',
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  skipButton: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
});
