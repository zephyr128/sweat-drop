/**
 * Premium ScannerScreen Component
 * Apple Fitness+ inspired design with premium micro-interactions
 * Uses react-native-vision-camera for QR code scanning
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Platform, Linking, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymData } from '@/hooks/useGymData';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_AREA_SIZE = 250;
const CORNER_LENGTH = 30;
const CORNER_WIDTH = 4;

// Development mode: Hardcoded QR UUID for testing
// Change this to your test machine's QR UUID
// To find your machine's QR UUID, scan the QR code once and check the console logs
const DEV_QR_UUID = '6a5b3904-1c60-417f-9737-0974464af239'; // Replace with your test machine QR UUID

interface MachineStatus {
  machine_id: string;
  machine_name: string;
  gym_id: string;
  machine_type: 'treadmill' | 'bike';
  sensor_id: string | null;
  is_busy: boolean;
  current_user_id: string | null;
  is_active: boolean;
  is_under_maintenance: boolean;
}

export function ScannerScreen() {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams<{
    planId?: string;
    subscriptionId?: string;
    planItemId?: string;
    exerciseIndex?: string;
  }>();
  const { session } = useSession();
  const { updateHomeGym } = useGymData();
  const { homeGymId } = useGymStore();
  const device = useCameraDevice('back');
  const hasScannedRef = useRef(false);
  
  // Premium Animations - All on UI thread for 60/120 FPS
  const scanLineY = useSharedValue(0);
  const frameScale = useSharedValue(1);
  const frameOpacity = useSharedValue(0.8);
  const laserOpacity = useSharedValue(1);
  const laserGlow = useSharedValue(0);

  useEffect(() => {
    checkCameraPermission();
  }, []);

  // Pulsating frame animation (subtle scale pulse)
  useEffect(() => {
    if (isScanning && !isProcessing && hasPermission) {
      frameScale.value = withRepeat(
        withSequence(
          withTiming(1.02, {
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, {
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      );
      
      frameOpacity.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.7, {
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      );
    } else {
      frameScale.value = withTiming(1, { duration: 300 });
      frameOpacity.value = withTiming(0.8, { duration: 300 });
    }
  }, [isScanning, isProcessing, hasPermission]);

  // Laser Sweep animation (smooth up and down)
  useEffect(() => {
    if (isScanning && !isProcessing && hasPermission) {
      scanLineY.value = withRepeat(
        withSequence(
          withTiming(SCAN_AREA_SIZE - 2, {
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0, {
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      );
      
      // Laser glow pulse
      laserGlow.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.3, {
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      );
    } else {
      scanLineY.value = 0;
      laserGlow.value = 0;
    }
  }, [isScanning, isProcessing, hasPermission]);

  const checkCameraPermission = async () => {
    try {
      const permission = await Camera.requestCameraPermission();
      console.log('[Scanner] Camera permission status:', permission);

      if (permission === 'granted') {
        setHasPermission(true);
      } else if (permission === 'denied') {
        Alert.alert(
          'Camera Permission Required',
          'SweatDrop needs camera access to scan QR codes. Please enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        setHasPermission(false);
      } else {
        Alert.alert(
          'Camera Permission Restricted',
          'Camera access is restricted on this device. Please contact your administrator or enable it in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        setHasPermission(false);
      }
    } catch (error) {
      console.error('[Scanner] Camera permission error:', error);
      Alert.alert(
        'Camera Permission Error',
        'Failed to request camera permissions. Please try again or enable camera access in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ]
      );
      setHasPermission(false);
    }
  };

  const handleQRCodeScanned = async (qrCode: string) => {
    // Prevent multiple scans
    if (hasScannedRef.current || isProcessing) {
      return;
    }

    hasScannedRef.current = true;
    setIsScanning(false);
    setIsProcessing(true);

    // Haptic feedback immediately when code is recognized (before processing)
    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Parse QR code
      let qrUuid: string | null = null;
      let sensorType: string | null = null;

      if (qrCode.startsWith('sweatdrop://machine/')) {
        const urlParts = qrCode.replace('sweatdrop://machine/', '').split('?');
        qrUuid = urlParts[0];
        
        if (urlParts[1]) {
          const params = new URLSearchParams(urlParts[1]);
          sensorType = params.get('sensor') || 'csc';
        } else {
          sensorType = 'csc';
        }
      } else {
        qrUuid = qrCode.trim();
        sensorType = 'csc';
      }

      if (!qrUuid) {
        throw new Error('Invalid QR code format');
      }

      console.log('[Scanner] Scanned QR UUID:', qrUuid);

      // Check machine status via RPC
      const { data: machineStatus, error: rpcError } = await supabase.rpc('get_machine_status', {
        p_qr_uuid: qrUuid,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (!machineStatus || machineStatus.length === 0) {
        Alert.alert(
          'Machine Not Found',
          'QR kod nije validan ili sprava nije aktivna. Proverite da li je QR kod ispravan.',
          [
            {
              text: 'OK',
              onPress: () => {
                hasScannedRef.current = false;
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      const machine = machineStatus[0] as MachineStatus;

      // Check if machine is under maintenance
      if (machine.is_under_maintenance) {
        Alert.alert(
          'Sprava Nedostupna',
          'Ova sprava je trenutno u održavanju. Molimo koristite drugu spravu.',
          [
            {
              text: 'OK',
              onPress: () => {
                hasScannedRef.current = false;
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Check if machine is busy
      if (machine.is_busy && machine.current_user_id !== session?.user?.id) {
        Alert.alert(
          'Sprava Zauzeta',
          'Ova sprava je trenutno zauzeta. Molimo sačekajte ili koristite drugu spravu.',
          [
            {
              text: 'OK',
              onPress: () => {
                hasScannedRef.current = false;
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Check if machine has sensor_id
      if (!machine.sensor_id) {
        Alert.alert(
          'Senzor Nije Uparen',
          'Ova sprava nema uparen senzor. Molimo kontaktirajte administratora da upari senzor pre početka treninga.',
          [
            {
              text: 'OK',
              onPress: () => {
                hasScannedRef.current = false;
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Check if scanned gym is different from home gym
      if (homeGymId && machine.gym_id !== homeGymId) {
        Alert.alert(
          'Postavi kao Home Gym?',
          'Ova teretana nije vaš Home Gym. Da li želite da je postavite kao Home Gym?',
          [
            {
              text: 'Ne',
              style: 'cancel',
              onPress: () => {
                proceedWithWorkout(machine);
              },
            },
            {
              text: 'Da',
              onPress: async () => {
                try {
                  await updateHomeGym(machine.gym_id);
                  proceedWithWorkout(machine);
                } catch (error) {
                  console.error('[Scanner] Error updating home gym:', error);
                  Alert.alert(
                    'Greška',
                    'Nije moguće postaviti teretanu kao Home Gym. Nastavljamo sa treningom.',
                    [
                      {
                        text: 'OK',
                        onPress: () => {
                          proceedWithWorkout(machine);
                        },
                      },
                    ]
                  );
                }
              },
            },
          ]
        );
        return;
      }

      proceedWithWorkout(machine);
    } catch (error: any) {
      console.error('[Scanner] Error processing QR code:', error);
      Alert.alert(
        'Greška',
        error.message || 'Došlo je do greške pri skeniranju QR koda. Pokušajte ponovo.',
        [
          {
            text: 'OK',
            onPress: () => {
              hasScannedRef.current = false;
              setIsScanning(true);
              setIsProcessing(false);
            },
          },
        ]
      );
    }
  };

  const proceedWithWorkout = async (machine: MachineStatus) => {
    try {
      setIsProcessing(true);
      
      if (session?.user) {
        const { data: lockResult, error: lockError } = await supabase.rpc('lock_machine', {
          p_machine_id: machine.machine_id,
          p_user_id: session.user.id,
        });

        if (lockError || !lockResult) {
          Alert.alert(
            'Sprava Zauzeta',
            'Nije moguće zaključati spravu. Možda je već u upotrebi.',
            [
              {
                text: 'OK',
                onPress: () => {
                  hasScannedRef.current = false;
                  setIsScanning(true);
                  setIsProcessing(false);
                },
              },
            ]
          );
          return;
        }
      }

      // SmartCoach: Check if plan parameters are passed via route params (from plan-detail screen)
      // Only use plan if explicitly passed - don't automatically check for active plans
      const planParams = params.planId && params.subscriptionId && params.planItemId && params.exerciseIndex
        ? {
            planId: params.planId,
            subscriptionId: params.subscriptionId,
            planItemId: params.planItemId,
            exerciseIndex: params.exerciseIndex,
          }
        : null;

      // Create session
      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: session!.user.id,
          gym_id: machine.gym_id,
          machine_id: machine.machine_id,
          started_at: new Date().toISOString(),
          is_active: true,
        })
        .select('*, machine:machine_id(*), gym:gym_id(*)')
        .single();

      if (sessionError) {
        if (session?.user) {
          await supabase.rpc('unlock_machine', {
            p_machine_id: machine.machine_id,
            p_user_id: session.user.id,
          });
        }
        throw sessionError;
      }

      // Success haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to workout with plan parameters if available (from route params)
      router.replace({
        pathname: '/workout',
        params: {
          sessionId: newSession.id,
          machineId: machine.machine_id,
          gymId: machine.gym_id,
          machineType: machine.machine_type,
          sensorId: machine.sensor_id || '',
          ...(planParams ? {
            planId: planParams.planId,
            subscriptionId: planParams.subscriptionId,
            planItemId: planParams.planItemId,
            exerciseIndex: planParams.exerciseIndex,
          } : {}),
        },
      });
    } catch (error: any) {
      console.error('[Scanner] Error proceeding with workout:', error);
      Alert.alert(
        'Greška',
        error.message || 'Došlo je do greške pri pokretanju treninga. Pokušajte ponovo.',
        [
          {
            text: 'OK',
            onPress: () => {
              hasScannedRef.current = false;
              setIsScanning(true);
              setIsProcessing(false);
            },
          },
        ]
      );
    }
  };

  // Development mode: Automatically connect to test device
  const handleDevelopMode = async () => {
    try {
      setIsProcessing(true);
      setIsScanning(false);

      console.log('[Scanner] Development mode: Using QR UUID:', DEV_QR_UUID);

      // Check machine status via RPC
      const { data: machineStatus, error: rpcError } = await supabase.rpc('get_machine_status', {
        p_qr_uuid: DEV_QR_UUID,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (!machineStatus || machineStatus.length === 0) {
        Alert.alert(
          'Machine Not Found',
          `Development machine with QR UUID ${DEV_QR_UUID} not found. Please check DEV_QR_UUID in ScannerScreen.tsx`,
          [
            {
              text: 'OK',
              onPress: () => {
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      const machine = machineStatus[0] as MachineStatus;

      // Check if machine is under maintenance
      if (machine.is_under_maintenance) {
        Alert.alert(
          'Sprava Nedostupna',
          'Development sprava je trenutno u održavanju.',
          [
            {
              text: 'OK',
              onPress: () => {
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Check if machine has sensor_id
      if (!machine.sensor_id) {
        Alert.alert(
          'Senzor Nije Uparen',
          'Development sprava nema uparen senzor.',
          [
            {
              text: 'OK',
              onPress: () => {
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Proceed with workout (skip home gym check in dev mode)
      proceedWithWorkout(machine);
    } catch (error: any) {
      console.error('[Scanner] Development mode error:', error);
      Alert.alert(
        'Development Mode Error',
        error.message || 'Došlo je do greške u development modu. Proverite DEV_QR_UUID.',
        [
          {
            text: 'OK',
            onPress: () => {
              setIsScanning(true);
              setIsProcessing(false);
            },
          },
        ]
      );
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (codes.length > 0 && !hasScannedRef.current && !isProcessing && isScanning) {
        setIsScanning(false);
        const qrCode = codes[0].value;
        if (qrCode) {
          handleQRCodeScanned(qrCode);
        }
      }
    },
  });

  // Premium Animated Styles - All on UI thread
  const frameAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: frameScale.value }],
      opacity: frameOpacity.value,
    };
  });

  const laserAnimatedStyle = useAnimatedStyle(() => {
    const glowIntensity = interpolate(laserGlow.value, [0, 1], [0.5, 1]);
    return {
      transform: [{ translateY: scanLineY.value }],
      opacity: glowIntensity,
    };
  });

  const laserGlowStyle = useAnimatedStyle(() => {
    const glowRadius = interpolate(laserGlow.value, [0, 1], [8, 20]);
    return {
      shadowRadius: glowRadius,
      opacity: laserGlow.value,
    };
  });

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={theme.colors.primary} />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            SweatDrop needs camera access to scan QR codes on equipment. Please grant permission to continue.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={checkCameraPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }}
          >
            <Text style={styles.settingsButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Initializing camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate scan area position (centered, but raised up by 70px)
  const scanAreaTop = (SCREEN_HEIGHT - SCAN_AREA_SIZE) / 2 - 70;
  const scanAreaLeft = (SCREEN_WIDTH - SCAN_AREA_SIZE) / 2;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      
      {isScanning && !isProcessing && (
        <Camera
          style={StyleSheet.absoluteFillObject}
          device={device}
          isActive={isScanning}
          codeScanner={codeScanner}
          torch={torchEnabled ? 'on' : 'off'}
        />
      )}

      {/* Premium Overlay - Clean flex approach without gaps */}
      <View style={styles.overlayContainer}>
        {/* Top overlay */}
        <View style={[styles.overlaySection, { height: scanAreaTop }]} />
        
        {/* Middle section with scan area */}
        <View style={styles.overlayMiddle}>
          <View style={[styles.overlaySection, { flex: 1 }]} />
          
          {/* Scan Frame with Premium Animations */}
          <Animated.View style={[styles.scanFrameContainer, frameAnimatedStyle]}>
            <View style={styles.scanFrame}>
              {/* Corner indicators - Premium style */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              
              {/* Laser Sweep Effect */}
              {isScanning && !isProcessing && (
                <Animated.View style={[styles.laserSweep, laserAnimatedStyle, laserGlowStyle]}>
                  <LinearGradient
                    colors={[
                      'transparent',
                      theme.colors.primary + 'FF',
                      theme.colors.primary + 'FF',
                      'transparent',
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.laserGradient}
                  />
                </Animated.View>
              )}
            </View>
          </Animated.View>
          
          <View style={[styles.overlaySection, { flex: 1 }]} />
        </View>
        
        {/* Bottom overlay */}
        <View style={[styles.overlaySection, { flex: 1 }]} />
      </View>

      {/* Instructions Text */}
      <View style={styles.instructionsContainer}>
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.processingText}>Processing QR code...</Text>
          </View>
        ) : (
          <Text style={styles.instructionsText}>
            Position QR code within the frame
          </Text>
        )}
      </View>

      {/* Premium Close Button with BlurView */}
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <BlurView intensity={80} tint="dark" style={styles.buttonBlur}>
          <View style={styles.buttonBorder} />
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </BlurView>
      </TouchableOpacity>

      {/* Premium Flash Button with BlurView */}
      {device?.hasTorch && (
        <TouchableOpacity
          style={styles.flashButton}
          onPress={() => setTorchEnabled(!torchEnabled)}
          activeOpacity={0.7}
        >
          <BlurView intensity={80} tint="dark" style={styles.buttonBlur}>
            <View style={styles.buttonBorder} />
            <Ionicons
              name={torchEnabled ? 'flash' : 'flash-outline'}
              size={24}
              color={torchEnabled ? theme.colors.primary : theme.colors.text}
            />
          </BlurView>
        </TouchableOpacity>
      )}

      {/* Development Mode Button */}
      <TouchableOpacity
        style={styles.developButton}
        onPress={handleDevelopMode}
        activeOpacity={0.7}
        disabled={isProcessing}
      >
        <BlurView intensity={80} tint="dark" style={styles.buttonBlur}>
          <View style={styles.buttonBorder} />
          <Ionicons
            name="code-slash"
            size={24}
            color={isProcessing ? theme.colors.textSecondary : theme.colors.primary}
          />
        </BlurView>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlaySection: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  scanFrameContainer: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_LENGTH,
    height: CORNER_LENGTH,
    borderColor: theme.colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 12,
  },
  laserSweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    elevation: 10,
  },
  laserGradient: {
    width: '100%',
    height: '100%',
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  instructionsText: {
    color: theme.colors.text,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    color: theme.colors.text,
    fontSize: 14,
    marginTop: 10,
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    zIndex: 1000,
  },
  developButton: {
    position: 'absolute',
    top: 40,
    right: 128,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    zIndex: 1000,
  },
  flashButton: {
    position: 'absolute',
    top: 40,
    right: 74,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    zIndex: 1000,
  },
  buttonBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  buttonBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 15,
  },
  permissionButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingsButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  settingsButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.colors.text,
    marginTop: 10,
    fontSize: 14,
  },
});
