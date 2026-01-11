import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export default function ScanScreen() {
  const [manualQRCode, setManualQRCode] = useState('');
  const [activeSession, setActiveSession] = useState<any>(null);
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    loadActiveSession();
  }, [session]);

  const loadActiveSession = async () => {
    if (!session?.user) return;

    const { data } = await supabase
      .from('sessions')
      .select('*, equipment:equipment_id(*), gym:gym_id(*)')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (data) {
      setActiveSession(data);
    }
  };

  const handleQRCodeSubmit = async (qrCode: string) => {
    if (!qrCode.trim()) {
      Alert.alert('Error', 'Please enter a QR code');
      return;
    }

    if (!session?.user) {
      Alert.alert('Error', 'Please sign in');
      return;
    }

    // Find equipment by QR code
    const { data: equipment, error: eqError } = await supabase
      .from('equipment')
      .select('*, gym:gym_id(*)')
      .eq('qr_code', qrCode.trim())
      .eq('is_active', true)
      .single();

    if (eqError || !equipment) {
      Alert.alert('Error', 'Invalid QR code');
      return;
    }

    // Start session
    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: session.user.id,
        gym_id: equipment.gym_id,
        equipment_id: equipment.id,
        started_at: new Date().toISOString(),
        is_active: true,
      })
      .select()
      .single();

    if (sessionError) {
      Alert.alert('Error', sessionError.message);
      return;
    }

    router.push({
      pathname: '/workout',
      params: { sessionId: newSession.id },
    });
  };

  if (activeSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.title}>Active Workout</Text>
          <Text style={styles.subtitle}>
            You have an active workout session
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              router.push({
                pathname: '/workout',
                params: { sessionId: activeSession.id },
              })
            }
          >
            <Text style={styles.buttonText}>Continue Workout</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContent}>
        <View style={styles.scannerPlaceholder}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderTitle}>QR Scanner</Text>
          <Text style={styles.placeholderText}>
            QR scanner requires a native build.{'\n'}
            Use the input below to manually enter QR codes for testing.
          </Text>
        </View>

        <View style={styles.manualInput}>
          <Text style={styles.inputLabel}>Enter QR Code:</Text>
          <TextInput
            style={styles.input}
            value={manualQRCode}
            onChangeText={setManualQRCode}
            placeholder="Enter QR code here"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleQRCodeSubmit(manualQRCode)}
          >
            <Text style={styles.buttonText}>Start Workout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scannerPlaceholder: {
    alignItems: 'center',
    marginBottom: 48,
    padding: 32,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    width: '100%',
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 24,
  },
  manualInput: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#14b8a6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
