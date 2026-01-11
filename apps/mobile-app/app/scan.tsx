import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';

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
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.centerContent}>
          <View style={styles.card}>
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
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Continue Workout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
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
            placeholderTextColor={theme.colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/workout')}
            activeOpacity={0.8}
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
    backgroundColor: '#000000',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scannerPlaceholder: {
    alignItems: 'center',
    marginBottom: theme.spacing['2xl'],
    padding: theme.spacing.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  placeholderTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  placeholderText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  manualInput: {
    width: '100%',
  },
  inputLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '50',
  },
  buttonText: {
    color: '#000000',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.5,
  },
});
