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
import { useTranslation } from 'react-i18next';
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
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymData } from '@/hooks/useGymData';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useBranding } from '@/lib/hooks/useBranding';
import { theme, fontStyles } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_AREA_SIZE = 250;
const CORNER_LENGTH = 30;
const CORNER_WIDTH = 4;

// Development mode: Hardcoded QR UUID for testing
// Change this to your test machine's QR UUID
// To find your machine's QR UUID, scan the QR code once and check the console logs
const DEV_QR_UUID = '92e1ad0d-8a2a-4993-8b19-61244ab82164'; // Replace with your test machine QR UUID

interface MachineStatus {
  machine_id: string;
  machine_name: string;
  gym_id: string;
  machine_type: 'treadmill' | 'bike' | 'elliptical';
  sensor_id: string | null;
  ble_protocol: 'ftms' | 'fitshow' | 'magene' | 'ksfit' | null;
  is_busy: boolean;
  current_user_id: string | null;
  is_active: boolean;
  is_under_maintenance: boolean;
}

export function ScannerScreen() {
  const { t } = useTranslation('scanner');
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
  const branding = useBranding();
  const device = useCameraDevice('back');
  const hasScannedRef = useRef(false);

  // ── Refs to defeat stale closures in useCodeScanner ──
  // useCodeScanner memoizes its onCodeScanned callback and never updates it,
  // so every value used inside the callback chain must be read via refs.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const updateHomeGymRef = useRef(updateHomeGym);
  updateHomeGymRef.current = updateHomeGym;
  const isScanningRef = useRef(isScanning);
  isScanningRef.current = isScanning;
  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;
  
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
          t('permissionRequired'),
          t('permissionDesc'),
          [
            { text: t('common:cancel'), style: 'cancel' },
            {
              text: t('openSettings'),
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
          t('permissionRestricted'),
          t('permissionRestrictedDesc'),
          [
            { text: t('common:cancel'), style: 'cancel' },
            {
              text: t('openSettings'),
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
        t('permissionError'),
        t('permissionErrorDesc'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('openSettings'),
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

  const handleCheckin = async (gymId: string) => {
    const currentSession = sessionRef.current;
    if (!currentSession?.user || isProcessing) return;
    setIsProcessing(true);

    // Switch home gym if user has none or scanned a different gym
    const currentHomeGymId = useGymStore.getState().homeGymId;
    const isNewGym = !currentHomeGymId || currentHomeGymId !== gymId;
    if (isNewGym) {
      const reason = !currentHomeGymId ? 'No home gym' : `Different gym (was ${currentHomeGymId})`;
      console.log(`[CheckIn] ${reason} — switching to:`, gymId);
      useGymStore.getState().setHomeGymId(gymId);
      try {
        await updateHomeGymRef.current(gymId);
        const { useAuthStore } = require('@/lib/stores/authStore');
        await useAuthStore.getState().refreshProfile();
      } catch (err) {
        console.error('[CheckIn] Error setting home gym:', err);
      }
    }

    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();

      if (status === 'granted') {
        const location = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (location && typeof location === 'object' && 'coords' in location) {
          lat = location.coords.latitude;
          lng = location.coords.longitude;
        }
      } else if (status === 'undetermined') {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus === 'granted') {
          const location = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ]);
          if (location && typeof location === 'object' && 'coords' in location) {
            lat = location.coords.latitude;
            lng = location.coords.longitude;
          }
        }
      }
    } catch (locationError) {
      console.warn('[CheckIn] GPS error, proceeding without location:', locationError);
    }

    try {
      const { data, error } = await supabase.rpc('perform_checkin', {
        p_gym_id: gymId,
        p_lat: lat,
        p_lng: lng,
      });
      if (error) throw error;

      const result = data as Record<string, unknown>;
      router.replace({
        pathname: '/checkin-result',
        params: {
          status: result.success ? 'success' : String(result.error || 'error'),
          dropsEarned: String(result.drops_earned || 0),
          gymName: String(result.gym_name || ''),
          streakDays: String(result.streak_days || 0),
          checkinDrops: String(result.checkin_drops || 0),
          distanceM: String(result.distance_m || 0),
          radiusM: String(result.radius_m || 0),
          isNewGym: isNewGym ? '1' : '0',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      router.replace({
        pathname: '/checkin-result',
        params: { status: 'error', errorMessage: msg },
      });
    } finally {
      setIsProcessing(false);
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
      // Check-in QR: sweatdrop://checkin/{gymId}
      if (qrCode.startsWith('sweatdrop://checkin/')) {
        const gymId = qrCode.replace('sweatdrop://checkin/', '').trim();
        await handleCheckin(gymId);
        return;
      }

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
          t('machineNotFound'),
          t('machineNotFoundDesc'),
          [
            {
              text: t('common:ok'),
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
          t('machineUnavailable'),
          t('machineUnavailableDesc'),
          [
            {
              text: t('common:ok'),
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
      if (machine.is_busy && machine.current_user_id !== sessionRef.current?.user?.id) {
        Alert.alert(
          t('machineBusy'),
          t('machineBusyDesc'),
          [
            {
              text: t('common:ok'),
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
          t('sensorNotPaired'),
          t('sensorNotPairedDesc'),
          [
            {
              text: t('common:ok'),
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

      // ── Read homeGymId directly from store to avoid stale closure ──
      const currentHomeGymId = useGymStore.getState().homeGymId;
      console.log('[Scanner] Current homeGymId from store:', currentHomeGymId, '| Scanned gym:', machine.gym_id);

      // First-time user OR different gym → show gym-welcome
      if (!currentHomeGymId || machine.gym_id !== currentHomeGymId) {
        const reason = !currentHomeGymId ? 'No home gym set' : `Different gym detected (was ${currentHomeGymId})`;
        console.log(`[Scanner] ${reason} — switching to:`, machine.gym_id);
        // Set in store IMMEDIATELY (before async DB call) so it's available even if DB update is slow
        useGymStore.getState().setHomeGymId(machine.gym_id);
        try {
          // Use ref to avoid stale closure from useCodeScanner
          await updateHomeGymRef.current(machine.gym_id);
          // Sync authStore profile so home screen sees the new gym
          const { useAuthStore } = require('@/lib/stores/authStore');
          await useAuthStore.getState().refreshProfile();
        } catch (error) {
          console.error('[Scanner] Error setting home gym:', error);
          // Store already has the value — DB will be synced on next loadUserHomeGym
        }
        // Show gym-welcome screen
        proceedWithWorkout(machine, true);
        return;
      }

      proceedWithWorkout(machine);
    } catch (error: any) {
      console.error('[Scanner] Error processing QR code:', error);
      Alert.alert(
        t('error'),
        error.message || t('errorProcessing'),
        [
          {
            text: t('common:ok'),
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

  const proceedWithWorkout = async (machine: MachineStatus, isFirstGym = false) => {
    try {
      setIsProcessing(true);

      // Always read session from ref to avoid stale closure
      const currentSession = sessionRef.current;
      
      if (currentSession?.user) {
        const { data: lockResult, error: lockError } = await supabase.rpc('lock_machine', {
          p_machine_id: machine.machine_id,
          p_user_id: currentSession.user.id,
        });

        if (lockError || !lockResult) {
          Alert.alert(
            t('lockFailed'),
            t('lockFailedDesc'),
            [
              {
                text: t('common:ok'),
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

      // Create session (use currentSession from ref, not stale closure)
      if (!currentSession?.user) {
        throw new Error('No active session — cannot create workout');
      }

      const { data: newSession, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: currentSession.user.id,
          gym_id: machine.gym_id,
          machine_id: machine.machine_id,
          started_at: new Date().toISOString(),
          is_active: true,
        })
        .select('*, machine:machine_id(*), gym:gym_id(*)')
        .single();

      if (sessionError) {
        await supabase.rpc('unlock_machine', {
          p_machine_id: machine.machine_id,
          p_user_id: currentSession.user.id,
        });
        throw sessionError;
      }

      // Success haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Build shared workout params
      const workoutParams: Record<string, string> = {
        sessionId: newSession.id,
        machineId: machine.machine_id,
        gymId: machine.gym_id,
        machineType: machine.machine_type,
        sensorId: machine.sensor_id || '',
        bleProtocol: machine.ble_protocol || '',
        ...(planParams ? {
          planId: planParams.planId,
          subscriptionId: planParams.subscriptionId,
          planItemId: planParams.planItemId,
          exerciseIndex: planParams.exerciseIndex,
        } : {}),
      };

      if (isFirstGym) {
        // ── First-time gym user → show welcome screen ──
        const gymName = newSession.gym?.name
          ?? useGymStore.getState().activeGym?.name
          ?? 'Tvojoj teretani';

        router.replace({
          pathname: '/gym-welcome',
          params: {
            gymName,
            ...workoutParams,
          },
        });
      } else {
        // ── Returning user → go directly to workout ──
        router.replace({
          pathname: '/workout',
          params: workoutParams,
        });
      }
    } catch (error: any) {
      console.error('[Scanner] Error proceeding with workout:', error);
      Alert.alert(
        t('error'),
        error.message || t('errorWorkout'),
        [
          {
            text: t('common:ok'),
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
          t('machineNotFound'),
          t('devModeNotFound', { uuid: DEV_QR_UUID }),
          [
            {
              text: t('common:ok'),
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
          t('machineUnavailable'),
          t('machineUnavailableDesc'),
          [
            {
              text: t('common:ok'),
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
          t('sensorNotPaired'),
          t('sensorNotPairedDesc'),
          [
            {
              text: t('common:ok'),
              onPress: () => {
                setIsScanning(true);
                setIsProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // ── Read homeGymId directly from store to avoid stale closure ──
      const currentDevHomeGymId = useGymStore.getState().homeGymId;
      console.log('[Scanner][Dev] Current homeGymId from store:', currentDevHomeGymId, '| Scanned gym:', machine.gym_id);

      if (!currentDevHomeGymId || machine.gym_id !== currentDevHomeGymId) {
        const reason = !currentDevHomeGymId ? 'No home gym set' : `Different gym detected (was ${currentDevHomeGymId})`;
        console.log(`[Scanner][Dev] ${reason} — switching to:`, machine.gym_id);
        useGymStore.getState().setHomeGymId(machine.gym_id);
        try {
          await updateHomeGymRef.current(machine.gym_id);
          const { useAuthStore } = require('@/lib/stores/authStore');
          await useAuthStore.getState().refreshProfile();
        } catch (error) {
          console.error('[Scanner][Dev] Error setting home gym:', error);
        }
        proceedWithWorkout(machine, true);
        return;
      }

      proceedWithWorkout(machine);
    } catch (error: any) {
      console.error('[Scanner] Development mode error:', error);
      Alert.alert(
        t('devModeError'),
        error.message || t('errorProcessing'),
        [
          {
            text: t('common:ok'),
            onPress: () => {
              setIsScanning(true);
              setIsProcessing(false);
            },
          },
        ]
      );
    }
  };

  // Store handler in ref so useCodeScanner always calls the latest version
  const handleQRCodeScannedRef = useRef(handleQRCodeScanned);
  handleQRCodeScannedRef.current = handleQRCodeScanned;

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      // Use refs for ALL values — useCodeScanner memoizes this callback
      // and never updates it, so direct state references would be stale.
      if (codes.length > 0 && !hasScannedRef.current && !isProcessingRef.current && isScanningRef.current) {
        isScanningRef.current = false;
        const qrCode = codes[0].value;
        if (qrCode) {
          handleQRCodeScannedRef.current(qrCode);
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
          <Ionicons name="camera-outline" size={64} color={branding.primary} />
          <Text style={styles.permissionTitle}>{t('permissionRequired')}</Text>
          <Text style={styles.permissionText}>
            {t('permissionDesc')}
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: branding.primary }]}
            onPress={checkCameraPermission}
          >
            <Text style={[styles.permissionButtonText, { color: branding.onPrimary }]}>{t('grantPermission')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsButton, { borderColor: branding.primary }]}
            onPress={() => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }}
          >
            <Text style={[styles.settingsButtonText, { color: branding.primary }]}>{t('openSettings')}</Text>
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
          <ActivityIndicator size="large" color={branding.primary} />
          <Text style={styles.loadingText}>{t('initializingCamera')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Calculate scan area position (centered, but raised up by 70px)
  const scanAreaTop = (SCREEN_HEIGHT - SCAN_AREA_SIZE) / 2 - 70;
  const scanAreaLeft = (SCREEN_WIDTH - SCAN_AREA_SIZE) / 2;

  return (
    <View style={styles.cameraContainer}>
      {isScanning && !isProcessing && (
        <Camera
          style={StyleSheet.absoluteFillObject}
          device={device}
          isActive={isScanning}
          codeScanner={codeScanner}
          torch={torchEnabled ? 'on' : 'off'}
        />
      )}

      {/* Dark fallback behind camera (visible when camera not active) */}
      {(!isScanning || isProcessing) && (
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Premium Overlay - Clean flex approach without gaps */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Top overlay */}
        <View style={[styles.overlaySection, { height: scanAreaTop }]} />
        
        {/* Middle section with scan area */}
        <View style={styles.overlayMiddle}>
          <View style={[styles.overlaySection, { flex: 1 }]} />
          
          {/* Scan Frame with Premium Animations */}
          <Animated.View style={[styles.scanFrameContainer, frameAnimatedStyle]}>
            <View style={styles.scanFrame}>
              {/* Corner indicators - Branding color */}
              <View style={[styles.corner, styles.topLeft, { borderColor: branding.primary }]} />
              <View style={[styles.corner, styles.topRight, { borderColor: branding.primary }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: branding.primary }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: branding.primary }]} />
              
              {/* Laser Sweep Effect - Branding color */}
              {isScanning && !isProcessing && (
                <Animated.View style={[styles.laserSweep, laserAnimatedStyle, laserGlowStyle, { shadowColor: branding.primary }]}>
                  <LinearGradient
                    colors={[
                      'transparent',
                      branding.primary + 'FF',
                      branding.primary + 'FF',
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
            <ActivityIndicator size="large" color={branding.primary} />
            <Text style={styles.processingText}>{t('processingQr')}</Text>
          </View>
        ) : (
          <Text style={styles.instructionsText}>
            {t('instruction')}
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
              color={torchEnabled ? branding.primary : theme.colors.text}
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
            color={isProcessing ? theme.colors.textSecondary : branding.primary}
          />
        </BlurView>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'transparent',
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
    ...fontStyles.bodyMedium,
    color: theme.colors.text,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    ...fontStyles.bodyMedium,
    color: theme.colors.text,
    fontSize: 14,
    marginTop: 10,
    letterSpacing: 0.5,
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
    ...fontStyles.heading,
    fontSize: 26,
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
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 15,
  },
  permissionButtonText: {
    ...fontStyles.heading,
    fontSize: 18,
  },
  settingsButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  settingsButtonText: {
    ...fontStyles.heading,
    fontSize: 18,
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
