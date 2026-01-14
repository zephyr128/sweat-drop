import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import { ReportIssueModal } from '@/components/ReportIssueModal';

export default function ScanScreen() {
  const [manualQRCode, setManualQRCode] = useState('');
  const [activeSession, setActiveSession] = useState<any>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [lastScannedMachine, setLastScannedMachine] = useState<{ id: string; name: string } | null>(null);
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    loadActiveSession();
  }, [session]);

  const loadActiveSession = async () => {
    if (!session?.user) return;

    const { data } = await supabase
      .from('sessions')
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
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

    // Find machine by QR code (preferred) or fallback to equipment
    let machine = null;
    let equipment = null;
    let gymId = null;
    let machineType: 'treadmill' | 'bike' | null = null;

    // Try to find in machines table first
    console.log('[Scan] Looking for machine with QR code:', qrCode.trim());
    const { data: machineData, error: machineError } = await supabase
      .from('machines')
      .select('*, gym:gym_id(*)')
      .eq('unique_qr_code', qrCode.trim())
      .single();

    console.log('[Scan] Machine lookup result:', { machineData, machineError });

    if (!machineError && machineData) {
      machine = machineData;
      gymId = machine.gym_id;
      machineType = machine.type as 'treadmill' | 'bike';
      
      // Check if gym is suspended
      if (machine.gym && machine.gym.is_suspended) {
        Alert.alert(
          'Gym Suspended',
          'This gym\'s subscription has expired. Please contact the gym owner.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Check if machine is active
      if (!machine.is_active) {
        Alert.alert(
          'Machine Inactive',
          'This machine is currently inactive. Please use another machine.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Check if machine is under maintenance
      if (machine.is_under_maintenance) {
        setLastScannedMachine({ id: machine.id, name: machine.name });
        Alert.alert(
          'Machine Unavailable',
          'Sorry, this machine is currently out of order. Please use another machine.',
          [
            { text: 'OK' },
            {
              text: 'Report Issue',
              onPress: () => {
                setReportModalVisible(true);
              },
            },
          ]
        );
        return;
      }
      
      console.log('[Scan] Machine found:', { id: machine.id, name: machine.name, type: machineType, gymId });
    } else {
      // Fallback to equipment table for backward compatibility
      const { data: equipmentData, error: eqError } = await supabase
        .from('equipment')
        .select('*, gym:gym_id(*)')
        .eq('qr_code', qrCode.trim())
        .eq('is_active', true)
        .single();

      if (eqError || !equipmentData) {
        console.error('Machine/Equipment lookup error:', machineError || eqError);
        console.log('Machine error details:', machineError);
        console.log('Equipment error details:', eqError);
        Alert.alert(
          'Invalid QR Code',
          `QR code not found. Please check:\n\n1. Is the machine active in Admin Panel?\n2. Is the QR code correct?\n\nError: ${machineError?.message || eqError?.message || 'Machine/Equipment not found'}`,
          [{ text: 'OK' }]
        );
        return;
      }

      equipment = equipmentData;
      gymId = equipment.gym_id;
      // Try to infer machine type from equipment_type
      if (equipment.equipment_type) {
        const eqType = equipment.equipment_type.toLowerCase();
        if (eqType.includes('treadmill')) {
          machineType = 'treadmill';
        } else if (eqType.includes('bike') || eqType.includes('bicycle')) {
          machineType = 'bike';
        }
      }
    }

    if (!gymId) {
      console.error('Machine/Equipment missing gym_id:', machine || equipment);
      Alert.alert('Error', 'Machine/Equipment is not associated with a gym');
      return;
    }

    console.log('Creating session:', {
      userId: session.user.id,
      gymId,
      machineId: machine?.id,
      equipmentId: equipment?.id,
      machineType,
    });

    // Start session
    const sessionData: any = {
      user_id: session.user.id,
      gym_id: gymId,
      started_at: new Date().toISOString(),
      is_active: true,
    };

    // Add machine_id if machine found, otherwise use equipment_id for backward compatibility
    if (machine) {
      sessionData.machine_id = machine.id;
    } else if (equipment) {
      sessionData.equipment_id = equipment.id;
    }

    const { data: newSession, error: sessionError } = await supabase
      .from('sessions')
      .insert(sessionData)
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
      .single();

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      Alert.alert('Error', `Failed to start workout: ${sessionError.message}`);
      return;
    }

    if (!newSession) {
      Alert.alert('Error', 'Failed to create workout session');
      return;
    }

    console.log('Session created successfully:', {
      id: newSession.id,
      gymId: newSession.gym_id,
      gymName: newSession.gym?.name,
      machineType,
    });

    router.push({
      pathname: '/workout',
      params: { 
        sessionId: newSession.id,
        machineType: machineType || '',
      },
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
            onPress={async () => {
              // For testing: create a mock session if no QR code entered
              if (!manualQRCode.trim()) {
                Alert.alert('Info', 'Please enter a QR code or scan one to start a workout');
                return;
              }
              // If QR code is entered, handleQRCodeSubmit will create the session
              await handleQRCodeSubmit(manualQRCode);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Start Workout</Text>
          </TouchableOpacity>

          {/* Report Issue Button - Always visible */}
          <TouchableOpacity
            style={styles.reportButton}
            onPress={async () => {
              if (!manualQRCode.trim()) {
                Alert.alert('Info', 'Please enter a QR code first to report an issue');
                return;
              }

              // Try to find machine to report
              const { data: machineData, error: machineError } = await supabase
                .from('machines')
                .select('id, name')
                .eq('unique_qr_code', manualQRCode.trim())
                .single();

              if (machineError || !machineData) {
                Alert.alert('Error', 'Machine not found. Please check the QR code.');
                return;
              }

              setLastScannedMachine({ id: machineData.id, name: machineData.name });
              setReportModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="warning-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.reportButtonText}>Report Issue</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Report Issue Modal */}
      {lastScannedMachine && (
        <ReportIssueModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          machineId={lastScannedMachine.id}
          machineName={lastScannedMachine.name}
        />
      )}
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
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  reportButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
});
