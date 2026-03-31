/**
 * Premium ScannerScreen Component
 * Apple Fitness+ inspired design with premium micro-interactions
 * Uses react-native-vision-camera for QR code scanning
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Linking,
  Dimensions,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
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
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymData } from '@/hooks/useGymData';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useBranding } from '@/lib/hooks/useBranding';
import { theme, fontStyles } from '@/lib/theme';
import { getDeviceFingerprintHash } from '@/lib/security/deviceFingerprint';
import { useDropLimitStatus } from '@/hooks/useDropLimitStatus';
import {
  encodeCustomSimulatorSensorId,
  type WorkoutSimulatorProfile,
} from '@/lib/workout/workout-simulator';
import { useAppModal } from '@/lib/stores/useAppModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_AREA_SIZE = 250;
const CORNER_LENGTH = 30;
const CORNER_WIDTH = 4;

const DEV_QR_UUID = process.env.EXPO_PUBLIC_DEV_QR_UUID || '';

type DevPresetMode = Exclude<WorkoutSimulatorProfile, 'custom' | 'disconnect_mid_session'> | 'custom';

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

interface StartSessionResult {
  success: boolean;
  session_id: string | null;
  action: 'created' | 'resumed' | 'error' | null;
  error_code: string | null;
  error_message: string | null;
}

function getSecurityStatusFromErrorMessage(message: string): 'cap_reached' | 'rate_limited' | 'fraud_blocked' | 'error' {
  const msg = message.toLowerCase();
  if (msg.includes('fraud') || msg.includes('abuse') || msg.includes('risk') || msg.includes('blocked')) {
    return 'fraud_blocked';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('throttle') || msg.includes('429')) {
    return 'rate_limited';
  }
  if (
    msg.includes('cap') ||
    msg.includes('daily limit') ||
    msg.includes('weekly limit') ||
    msg.includes('session limit') ||
    msg.includes('issuance')
  ) {
    return 'cap_reached';
  }
  return 'error';
}

export function ScannerScreen() {
  const { t } = useTranslation('scanner');
  const showModal = useAppModal((s) => s.showModal);
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [showDevSimulatorModal, setShowDevSimulatorModal] = useState(false);
  const [devPreset, setDevPreset] = useState<DevPresetMode>('normal_30min');
  const [devDurationMinutes, setDevDurationMinutes] = useState('30');
  const [devBaseRpm, setDevBaseRpm] = useState('72');
  const [devRpmAmplitude, setDevRpmAmplitude] = useState('8');
  const [devSpeedKmh, setDevSpeedKmh] = useState('8.5');
  const [devInclinePct, setDevInclinePct] = useState('1.5');
  const [devPowerWatts, setDevPowerWatts] = useState('165');
  const [devIntervalEnabled, setDevIntervalEnabled] = useState(false);
  const [devIntervalHighRpm, setDevIntervalHighRpm] = useState('112');
  const [devIntervalSeconds, setDevIntervalSeconds] = useState('45');
  const [devTimeScale, setDevTimeScale] = useState('1');
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
  const { getActiveGymId } = useGymStore();
  const dropLimit = useDropLimitStatus(getActiveGymId());
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
  
  const resetScan = useCallback(() => {
    hasScannedRef.current = false;
    setIsScanning(true);
    setIsProcessing(false);
  }, []);

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
      log.debug('[Scanner] Camera permission status:', permission);

      if (permission === 'granted') {
        setHasPermission(true);
      } else if (permission === 'denied') {
        const openSettings = () => Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings();
        showModal({
          title: t('permissionRequired'),
          body: t('permissionDesc'),
          buttons: [
            { label: t('common:cancel'), style: 'cancel' },
            { label: t('openSettings'), onPress: openSettings },
          ],
        });
        setHasPermission(false);
      } else {
        const openSettings = () => Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings();
        showModal({
          title: t('permissionRestricted'),
          body: t('permissionRestrictedDesc'),
          buttons: [
            { label: t('common:cancel'), style: 'cancel' },
            { label: t('openSettings'), onPress: openSettings },
          ],
        });
        setHasPermission(false);
      }
    } catch (error) {
      log.error('[Scanner] Camera permission error:', error);
      const openSettings = () => Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings();
      showModal({
        title: t('permissionError'),
        body: t('permissionErrorDesc'),
        buttons: [
          { label: t('common:cancel'), style: 'cancel' },
          { label: t('openSettings'), onPress: openSettings },
        ],
      });
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
      log.debug(`[CheckIn] ${reason} — switching to:`, gymId);
      useGymStore.getState().setHomeGymId(gymId);
      try {
        await updateHomeGymRef.current(gymId);
        const { useAuthStore } = require('@/lib/stores/authStore');
        await useAuthStore.getState().refreshProfile();
      } catch (err) {
        log.error('[CheckIn] Error setting home gym:', err);
      }
    }

    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const Location = await import('expo-location').catch(() => null);
      if (!Location) {
        throw new Error('expo-location-unavailable');
      }
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
      if ((locationError as Error)?.message !== 'expo-location-unavailable') {
        log.warn('[CheckIn] GPS error, proceeding without location:', locationError);
      }
    }

    try {
      const { data, error } = await supabase.rpc('perform_checkin', {
        p_gym_id: gymId,
        p_lat: lat,
        p_lng: lng,
      });
      if (error) throw error;

      const result = data as Record<string, unknown>;
      const rawStatus = result.success ? 'success' : String(result.error || 'error');
      const normalizedStatus =
        rawStatus === 'success' ||
        rawStatus === 'already_checked_in' ||
        rawStatus === 'too_far' ||
        rawStatus === 'gym_not_found' ||
        rawStatus === 'gym_suspended' ||
        rawStatus === 'checkin_disabled' ||
        rawStatus === 'cap_reached' ||
        rawStatus === 'rate_limited' ||
        rawStatus === 'fraud_blocked'
          ? rawStatus
          : getSecurityStatusFromErrorMessage(rawStatus);

      if (normalizedStatus === 'success') {
        // Settle referral rewards as part of the verified check-in event.
        void supabase
          .rpc('evaluate_referral_qualification', { p_referral_id: null })
          .then(({ error: qualificationError }) => {
            if (qualificationError && __DEV__) {
              log.warn('[CheckIn] evaluate_referral_qualification failed:', qualificationError.message);
            }
          });
      }

      router.replace({
        pathname: '/checkin-result',
        params: {
          status: normalizedStatus,
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
      const status = getSecurityStatusFromErrorMessage(msg);
      router.replace({
        pathname: '/checkin-result',
        params: { status, errorMessage: msg },
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

      log.debug('[Scanner] Scanned QR UUID:', qrUuid);

      // Check machine status via RPC
      const { data: machineStatus, error: rpcError } = await supabase.rpc('get_machine_status', {
        p_qr_uuid: qrUuid,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (!machineStatus || machineStatus.length === 0) {
        showModal({ title: t('machineNotFound'), body: t('machineNotFoundDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
        return;
      }

      const machine = machineStatus[0] as MachineStatus;

      // Check if machine is under maintenance
      if (machine.is_under_maintenance) {
        showModal({ title: t('machineUnavailable'), body: t('machineUnavailableDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
        return;
      }

      // Check if machine is busy
      if (machine.is_busy && machine.current_user_id !== sessionRef.current?.user?.id) {
        showModal({ title: t('machineBusy'), body: t('machineBusyDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
        return;
      }

      // Check if machine has sensor_id
      if (!machine.sensor_id) {
        showModal({ title: t('sensorNotPaired'), body: t('sensorNotPairedDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
        return;
      }

      // ── Read homeGymId directly from store to avoid stale closure ──
      const currentHomeGymId = useGymStore.getState().homeGymId;
      log.debug('[Scanner] Current homeGymId from store:', currentHomeGymId, '| Scanned gym:', machine.gym_id);

      // First-time user OR different gym → show gym-welcome
      const isFirstGym = !currentHomeGymId || machine.gym_id !== currentHomeGymId;
      if (isFirstGym) {
        const reason = !currentHomeGymId ? 'No home gym set' : `Different gym detected (was ${currentHomeGymId})`;
        log.debug(`[Scanner] ${reason} — switching to:`, machine.gym_id);
        // Set in store IMMEDIATELY (before async DB call) so it's available even if DB update is slow
        useGymStore.getState().setHomeGymId(machine.gym_id);
        try {
          // Use ref to avoid stale closure from useCodeScanner
          await updateHomeGymRef.current(machine.gym_id);
          // Sync authStore profile so home screen sees the new gym
          const { useAuthStore } = require('@/lib/stores/authStore');
          await useAuthStore.getState().refreshProfile();
        } catch (error) {
          log.error('[Scanner] Error setting home gym:', error);
          // Store already has the value — DB will be synced on next loadUserHomeGym
        }
      }

      // ── Auto-checkin gate ─────────────────────────────────────────────────────
      // If the user hasn't checked in today at this gym, perform checkin first,
      // show the checkin result screen, then automatically continue to the workout.
      const { data: checkinStatusData } = await supabase.rpc('get_checkin_status', {
        p_gym_id: machine.gym_id,
      });
      const checkinStatusRow = Array.isArray(checkinStatusData) ? checkinStatusData[0] : checkinStatusData;
      const alreadyCheckedIn = checkinStatusRow?.already_checked_in === true;

      if (!alreadyCheckedIn) {
        log.debug('[Scanner] User not checked in — performing auto-checkin before workout');

        // Gather GPS (best-effort, same as handleCheckin)
        let lat: number | null = null;
        let lng: number | null = null;
        try {
          const Location = await import('expo-location').catch(() => null);
          if (Location) {
            const { status } = await Location.getForegroundPermissionsAsync();
            if (status === 'granted') {
              const loc = await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
              ]);
              if (loc && typeof loc === 'object' && 'coords' in loc) {
                lat = loc.coords.latitude;
                lng = loc.coords.longitude;
              }
            }
          }
        } catch { /* GPS unavailable — proceed without coords */ }

        const { data: ciData, error: ciError } = await supabase.rpc('perform_checkin', {
          p_gym_id: machine.gym_id,
          p_lat: lat,
          p_lng: lng,
        });

        if (!ciError) {
          const ciResult = ciData as Record<string, unknown>;
          const ciStatus = ciResult?.success ? 'success' : String(ciResult?.error || 'error');
          if (ciStatus === 'success') {
            void supabase.rpc('evaluate_referral_qualification', { p_referral_id: null });
          }

          // Encode the pending workout so checkin-result can forward to it
          // after the success animation. The workout itself is started here
          // so checkin-result only needs to navigate (no RPC needed there).
          await autoCheckinThenStartWorkout(machine, isFirstGym, ciResult, ciStatus);
          return;
        }
        log.warn('[Scanner] Auto-checkin failed, proceeding to workout anyway:', ciError);
      }

      // Already checked in (or checkin failed) — proceed normally
      proceedWithWorkout(machine, isFirstGym);
    } catch (error: any) {
      log.error('[Scanner] Error processing QR code:', error);
      showModal({ title: t('error'), body: error.message || t('errorProcessing'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
    }
  };

  // Starts the workout session, then routes to checkin-result with the
  // pending workout params encoded so it forwards automatically when dismissed.
  const autoCheckinThenStartWorkout = async (
    machine: MachineStatus,
    isFirstGym: boolean,
    ciResult: Record<string, unknown>,
    ciStatus: string,
  ) => {
    try {
      setIsProcessing(true);
      const currentSession = sessionRef.current;
      if (!currentSession?.user) throw new Error('No active session');

      const planParams = params.planId && params.subscriptionId && params.planItemId && params.exerciseIndex
        ? {
            planId: params.planId,
            subscriptionId: params.subscriptionId,
            planItemId: params.planItemId,
            exerciseIndex: params.exerciseIndex,
          }
        : null;

      const deviceHash = await getDeviceFingerprintHash();
      const { data: startResultData, error: startSessionError } = await supabase.rpc('start_session_safely', {
        p_machine_id: machine.machine_id,
        p_started_at: new Date().toISOString(),
        p_device_hash: deviceHash,
      });

      if (startSessionError) throw startSessionError;

      const startResultRaw = Array.isArray(startResultData) ? startResultData[0] : startResultData;
      const startResult = (startResultRaw ?? null) as StartSessionResult | null;

      if (!startResult?.success || !startResult?.session_id) {
        const errorCode = startResult?.error_code;
        if (errorCode === 'machine_busy' || errorCode === 'user_active_session_conflict') {
          showModal({ title: t('machineBusy'), body: t('machineBusyDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
          return;
        }
        throw new Error(startResult?.error_message || t('errorWorkout'));
      }

      const { data: newSession, error: sessionFetchError } = await supabase
        .from('sessions')
        .select('*, machine:machine_id(*), gym:gym_id(*)')
        .eq('id', startResult.session_id)
        .single();

      if (sessionFetchError || !newSession) throw sessionFetchError || new Error('Failed to load started session');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const workoutParams: Record<string, string> = {
        sessionId: newSession.id,
        machineId: machine.machine_id,
        gymId: machine.gym_id,
        machineType: machine.machine_type,
        sensorId: machine.sensor_id || '',
        bleProtocol: machine.ble_protocol || '',
        ...(planParams ?? {}),
      };

      const pendingWorkoutDestination = isFirstGym
        ? JSON.stringify({ pathname: '/gym-welcome', params: { gymName: newSession.gym?.name ?? 'Your Gym', ...workoutParams } })
        : JSON.stringify({ pathname: '/workout', params: workoutParams });

      const rawStatus = ciResult?.success ? 'success' : String(ciResult?.error || ciStatus);
      const normalizedStatus =
        rawStatus === 'success' ||
        rawStatus === 'already_checked_in' ||
        rawStatus === 'too_far' ||
        rawStatus === 'gym_not_found' ||
        rawStatus === 'gym_suspended' ||
        rawStatus === 'checkin_disabled' ||
        rawStatus === 'cap_reached' ||
        rawStatus === 'rate_limited' ||
        rawStatus === 'fraud_blocked'
          ? rawStatus
          : 'success';

      router.replace({
        pathname: '/checkin-result',
        params: {
          status: normalizedStatus,
          dropsEarned: String(ciResult?.drops_earned || 0),
          gymName: String(ciResult?.gym_name || ''),
          streakDays: String(ciResult?.streak_days || 0),
          checkinDrops: String(ciResult?.checkin_drops || 0),
          distanceM: String(ciResult?.distance_m || 0),
          radiusM: String(ciResult?.radius_m || 0),
          isNewGym: isFirstGym ? '1' : '0',
          pendingWorkout: pendingWorkoutDestination,
        },
      });
    } catch (error: any) {
      log.error('[Scanner] autoCheckinThenStartWorkout error:', error);
      showModal({ title: t('error'), body: error.message || t('errorWorkout'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
    } finally {
      setIsProcessing(false);
    }
  };

  const proceedWithWorkout = async (
    machine: MachineStatus,
    isFirstGym = false,
    sensorIdOverride?: string,
  ) => {
    try {
      setIsProcessing(true);

      // Always read session from ref to avoid stale closure
      const currentSession = sessionRef.current;

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

      const deviceHash = await getDeviceFingerprintHash();

      // Atomic server-side start to avoid race/duplicate active sessions per machine.
      const { data: startResultData, error: startSessionError } = await supabase.rpc('start_session_safely', {
        p_machine_id: machine.machine_id,
        p_started_at: new Date().toISOString(),
        p_device_hash: deviceHash,
      });

      if (startSessionError) {
        throw startSessionError;
      }

      const startResultRaw = Array.isArray(startResultData) ? startResultData[0] : startResultData;
      const startResult = (startResultRaw ?? null) as StartSessionResult | null;

      if (!startResult?.success || !startResult?.session_id) {
        const errorCode = startResult?.error_code;
        if (errorCode === 'machine_busy' || errorCode === 'user_active_session_conflict') {
          showModal({ title: t('machineBusy'), body: t('machineBusyDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
          return;
        }
        throw new Error(startResult?.error_message || t('errorWorkout'));
      }

      const { data: newSession, error: sessionFetchError } = await supabase
        .from('sessions')
        .select('*, machine:machine_id(*), gym:gym_id(*)')
        .eq('id', startResult.session_id)
        .single();

      if (sessionFetchError || !newSession) {
        throw sessionFetchError || new Error('Failed to load started session');
      }

      // Success haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Build shared workout params
      const workoutParams: Record<string, string> = {
        sessionId: newSession.id,
        machineId: machine.machine_id,
        gymId: machine.gym_id,
        machineType: machine.machine_type,
        sensorId: sensorIdOverride || machine.sensor_id || '',
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
      log.error('[Scanner] Error proceeding with workout:', error);
      showModal({ title: t('error'), body: error.message || t('errorWorkout'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
    }
  };

  const parsePositiveNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const buildDevSimulatorSensorId = (): string => {
    if (devPreset !== 'custom') {
      return `sim:${devPreset}`;
    }

    return encodeCustomSimulatorSensorId({
      durationMinutes: Math.max(1, Math.round(parsePositiveNumber(devDurationMinutes, 30))),
      baseRpm: Math.round(parsePositiveNumber(devBaseRpm, 72)),
      rpmAmplitude: Math.max(0, Math.round(parsePositiveNumber(devRpmAmplitude, 8))),
      speedKmh: parsePositiveNumber(devSpeedKmh, 8.5),
      inclinePct: parsePositiveNumber(devInclinePct, 1.5),
      powerWatts: parsePositiveNumber(devPowerWatts, 165),
      intervalEnabled: devIntervalEnabled,
      intervalHighRpm: Math.round(parsePositiveNumber(devIntervalHighRpm, 112)),
      intervalSeconds: Math.round(parsePositiveNumber(devIntervalSeconds, 45)),
      timeScale: parsePositiveNumber(devTimeScale, 1),
    });
  };

  // Development mode: open debug simulator panel
  const handleDevelopMode = async () => {
    if (!__DEV__) return;
    setShowDevSimulatorModal(true);
  };

  const startDevelopWorkout = async (sensorIdOverride: string) => {
    if (!DEV_QR_UUID) {
      showModal({ title: 'Dev Mode', body: 'Set EXPO_PUBLIC_DEV_QR_UUID in .env' });
      return;
    }
    const resetDevScan = () => { setIsScanning(true); setIsProcessing(false); };
    try {
      setShowDevSimulatorModal(false);
      setIsProcessing(true);
      setIsScanning(false);

      // Check machine status via RPC
      const { data: machineStatus, error: rpcError } = await supabase.rpc('get_machine_status', {
        p_qr_uuid: DEV_QR_UUID,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (!machineStatus || machineStatus.length === 0) {
        showModal({ title: t('machineNotFound'), body: t('devModeNotFound', { uuid: DEV_QR_UUID }), buttons: [{ label: t('common:ok'), onPress: resetDevScan }] });
        return;
      }

      const machine = machineStatus[0] as MachineStatus;

      // Check if machine is under maintenance
      if (machine.is_under_maintenance) {
        showModal({ title: t('machineUnavailable'), body: t('machineUnavailableDesc'), buttons: [{ label: t('common:ok'), onPress: resetDevScan }] });
        return;
      }

      // Check if machine has sensor_id
      if (!machine.sensor_id) {
        showModal({ title: t('sensorNotPaired'), body: t('sensorNotPairedDesc'), buttons: [{ label: t('common:ok'), onPress: resetDevScan }] });
        return;
      }

      // ── Read homeGymId directly from store to avoid stale closure ──
      const currentDevHomeGymId = useGymStore.getState().homeGymId;
      log.debug('[Scanner][Dev] Current homeGymId from store:', currentDevHomeGymId, '| Scanned gym:', machine.gym_id);

      if (!currentDevHomeGymId || machine.gym_id !== currentDevHomeGymId) {
        const reason = !currentDevHomeGymId ? 'No home gym set' : `Different gym detected (was ${currentDevHomeGymId})`;
        log.debug(`[Scanner][Dev] ${reason} — switching to:`, machine.gym_id);
        useGymStore.getState().setHomeGymId(machine.gym_id);
        try {
          await updateHomeGymRef.current(machine.gym_id);
          const { useAuthStore } = require('@/lib/stores/authStore');
          await useAuthStore.getState().refreshProfile();
        } catch (error) {
          log.error('[Scanner][Dev] Error setting home gym:', error);
        }
        proceedWithWorkout(machine, true, sensorIdOverride);
        return;
      }

      proceedWithWorkout(machine, false, sensorIdOverride);
    } catch (error: any) {
      log.error('[Scanner] Development mode error:', error);
      showModal({ title: t('devModeError'), body: error.message || t('errorProcessing'), buttons: [{ label: t('common:ok'), onPress: resetDevScan }] });
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

      {/* Drop limit awareness banner */}
      {!dropLimit.loading && (dropLimit.limitReached || dropLimit.nearLimit || dropLimit.softSessionWarning) && !isProcessing && (
        <View style={[
          styles.limitBanner,
          dropLimit.limitReached ? styles.limitBannerReached : dropLimit.softSessionWarning ? styles.limitBannerSoft : undefined,
        ]}>
          <Ionicons
            name={dropLimit.limitReached ? 'information-circle' : dropLimit.softSessionWarning ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={18}
            color={dropLimit.limitReached ? '#93C5FD' : dropLimit.softSessionWarning ? '#86EFAC' : '#FDE68A'}
          />
          <Text style={[
            styles.limitBannerText,
            dropLimit.limitReached ? styles.limitBannerTextReached : dropLimit.softSessionWarning ? styles.limitBannerTextSoft : undefined,
          ]}>
            {dropLimit.limitReached
              ? t('limitReachedBanner', { earned: dropLimit.mintedToday })
              : dropLimit.softSessionWarning
                ? t('softSessionBanner', { count: dropLimit.rewardedSessionsToday })
                : t('nearLimitBanner', {
                    used: dropLimit.rewardedSessionsToday,
                    max: dropLimit.maxRewardedSessionsPerDay,
                  })}
          </Text>
        </View>
      )}

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
      {__DEV__ && (
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
      )}

      <Modal
        visible={showDevSimulatorModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDevSimulatorModal(false)}
      >
        <View style={styles.devModalBackdrop}>
          <View style={styles.devModalCard}>
            <Text style={styles.devModalTitle}>{t('devSimTitle')}</Text>
            <Text style={styles.devModalSubtitle}>{t('devSimSubtitle')}</Text>

            <View style={styles.devPresetRow}>
              <TouchableOpacity
                style={[styles.devPresetChip, devPreset === 'normal_30min' && styles.devPresetChipActive]}
                onPress={() => setDevPreset('normal_30min')}
              >
                <Text style={styles.devPresetLabel}>{t('devSimPresetNormal')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devPresetChip, devPreset === 'interval_training' && styles.devPresetChipActive]}
                onPress={() => setDevPreset('interval_training')}
              >
                <Text style={styles.devPresetLabel}>{t('devSimPresetInterval')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devPresetChip, devPreset === 'suspicious_spike' && styles.devPresetChipActive]}
                onPress={() => setDevPreset('suspicious_spike')}
              >
                <Text style={styles.devPresetLabel}>{t('devSimPresetSpike')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devPresetChip, devPreset === 'custom' && styles.devPresetChipActive]}
                onPress={() => setDevPreset('custom')}
              >
                <Text style={styles.devPresetLabel}>{t('devSimPresetCustom')}</Text>
              </TouchableOpacity>
            </View>

            {devPreset === 'custom' && (
              <View style={styles.devFieldsContainer}>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimDuration')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devDurationMinutes} onChangeText={setDevDurationMinutes} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimBaseRpm')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devBaseRpm} onChangeText={setDevBaseRpm} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimAmplitude')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devRpmAmplitude} onChangeText={setDevRpmAmplitude} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimSpeed')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devSpeedKmh} onChangeText={setDevSpeedKmh} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimIncline')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devInclinePct} onChangeText={setDevInclinePct} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimPower')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devPowerWatts} onChangeText={setDevPowerWatts} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimTimeScale')}</Text>
                  <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devTimeScale} onChangeText={setDevTimeScale} />
                </View>
                <View style={styles.devFieldRow}>
                  <Text style={styles.devFieldLabel}>{t('devSimIntervals')}</Text>
                  <Switch value={devIntervalEnabled} onValueChange={setDevIntervalEnabled} />
                </View>
                {devIntervalEnabled && (
                  <>
                    <View style={styles.devFieldRow}>
                      <Text style={styles.devFieldLabel}>{t('devSimIntervalHighRpm')}</Text>
                      <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devIntervalHighRpm} onChangeText={setDevIntervalHighRpm} />
                    </View>
                    <View style={styles.devFieldRow}>
                      <Text style={styles.devFieldLabel}>{t('devSimIntervalSeconds')}</Text>
                      <TextInput style={styles.devFieldInput} keyboardType="numeric" value={devIntervalSeconds} onChangeText={setDevIntervalSeconds} />
                    </View>
                  </>
                )}
              </View>
            )}

            <View style={styles.devActionsRow}>
              <TouchableOpacity
                style={styles.devCancelButton}
                onPress={() => setShowDevSimulatorModal(false)}
                disabled={isProcessing}
              >
                <Text style={styles.devCancelText}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devStartButton, { backgroundColor: branding.primary }]}
                onPress={() => startDevelopWorkout(buildDevSimulatorSensorId())}
                disabled={isProcessing}
              >
                <Text style={[styles.devStartText, { color: branding.onPrimary }]}>{t('devSimStart')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  limitBanner: {
    position: 'absolute',
    bottom: 160,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(120, 80, 0, 0.75)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  limitBannerReached: {
    backgroundColor: 'rgba(30, 64, 120, 0.75)',
  },
  limitBannerSoft: {
    backgroundColor: 'rgba(20, 83, 45, 0.7)',
  },
  limitBannerText: {
    ...fontStyles.body,
    color: '#FDE68A',
    fontSize: 13,
    flex: 1,
  },
  limitBannerTextReached: {
    color: '#93C5FD',
  },
  limitBannerTextSoft: {
    color: '#86EFAC',
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
  devModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  devModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0D111A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  devModalTitle: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 18,
  },
  devModalSubtitle: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },
  devPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  devPresetChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  devPresetChipActive: {
    borderColor: 'rgba(89, 177, 255, 0.9)',
    backgroundColor: 'rgba(89, 177, 255, 0.18)',
  },
  devPresetLabel: {
    ...fontStyles.body,
    color: theme.colors.text,
    fontSize: 12,
  },
  devFieldsContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
    gap: 8,
  },
  devFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  devFieldLabel: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  devFieldInput: {
    width: 96,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    color: theme.colors.text,
    paddingVertical: 6,
    paddingHorizontal: 10,
    textAlign: 'right',
  },
  devActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  devCancelButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  devCancelText: {
    ...fontStyles.bodyMedium,
    color: theme.colors.text,
  },
  devStartButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  devStartText: {
    ...fontStyles.bodyMedium,
  },
});
