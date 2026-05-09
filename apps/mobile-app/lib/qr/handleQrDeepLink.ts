/**
 * Shared QR deep-link handler extracted from ScannerScreen.
 *
 * Provides:
 *   - parseQrPayload()  — normalises all QR URL formats into a discriminated union
 *   - handleQrDeepLink() — executes machine/checkin business logic and navigates
 *
 * All final router calls use router.replace so the deep-link route is removed
 * from the navigation stack. Back-presses from /workout or /checkin-result land
 * on whatever was beneath the deep-link route (typically /home).
 *
 * This module does NOT modify ScannerScreen — that file keeps its own copy of
 * the logic until the new routes are validated in production (per plan).
 */

import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useGymStore } from '@/lib/stores/useGymStore';
import { getDeviceFingerprintHash } from '@/lib/security/deviceFingerprint';
import { log } from '@/lib/logger';
import i18n from '@/lib/i18n';
import type { AppModalButton } from '@/lib/stores/useAppModal';
import { recoverStaleActiveSession } from '@/lib/qr/recoverStaleActiveSession';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedQR =
  | { kind: 'machine'; qrUuid: string; sensorHint: string | null }
  | { kind: 'checkin'; gymId: string }
  | { kind: 'unknown'; raw: string };

type MinimalRouter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replace: (...args: any[]) => void;
};

export type HandleQrDeepLinkOptions = {
  router: MinimalRouter;
  session: Session | null;
  showModal: (opts: { title: string; body?: string; buttons?: AppModalButton[] }) => void;
  updateHomeGym: (gymId: string) => Promise<void>;
};

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

// ── Parser ────────────────────────────────────────────────────────────────────

const HTTPS_HOSTS = new Set(['sweat-drop.com', 'www.sweat-drop.com']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeAndTrim(value: string): string {
  const base = value.trim();
  if (!base) return '';
  try {
    return decodeURIComponent(base).trim();
  } catch {
    return base;
  }
}

function extractMachineUuid(candidate: string): string | null {
  const normalized = decodeAndTrim(candidate);
  if (!normalized) return null;

  if (UUID_RE.test(normalized)) return normalized;

  if (normalized.startsWith('https://')) {
    try {
      const url = new URL(normalized);
      if (HTTPS_HOSTS.has(url.hostname)) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'm' && parts[1]) {
          const pathUuid = decodeAndTrim(parts[1]).replace(/\/+$/, '');
          if (UUID_RE.test(pathUuid)) return pathUuid;
        }
      }
    } catch {
      // Fall through to regex extraction.
    }
  }

  const match = normalized.match(UUID_RE);
  return match?.[0] ?? null;
}

/**
 * Normalise any QR payload format into a ParsedQR discriminated union.
 *
 * | Input                                           | Result                  |
 * |-------------------------------------------------|-------------------------|
 * | https://sweat-drop.com/m/<uuid>[?s=csc]         | machine                 |
 * | https://www.sweat-drop.com/m/<uuid>             | machine                 |
 * | https://sweat-drop.com/c/<gymId>                | checkin                 |
 * | sweatdrop://machine/<uuid>[?sensor=csc]         | machine (legacy)        |
 * | sweatdrop://checkin/<gymId>                     | checkin (legacy)        |
 * | <plain UUID string>                             | machine (scanner legacy)|
 * | anything else                                   | unknown                 |
 */
export function parseQrPayload(input: string): ParsedQR {
  if (!input) return { kind: 'unknown', raw: input };
  const raw = input.trim();

  // ── HTTPS Universal / App Link ──────────────────────────────────────────
  if (raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      if (HTTPS_HOSTS.has(url.hostname)) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'm' && parts[1]) {
          const sensorHint =
            url.searchParams.get('s') || url.searchParams.get('sensor') || null;
          const qrUuid = extractMachineUuid(parts[1]);
          if (!qrUuid) return { kind: 'unknown', raw };
          return { kind: 'machine', qrUuid, sensorHint };
        }
        if (parts[0] === 'c' && parts[1]) {
          return { kind: 'checkin', gymId: parts[1] };
        }
      }
    } catch {
      // Not a parseable URL — fall through to unknown
    }
    return { kind: 'unknown', raw };
  }

  // ── Legacy sweatdrop:// custom scheme ────────────────────────────────────
  if (raw.startsWith('sweatdrop://machine/')) {
    const rest = raw.slice('sweatdrop://machine/'.length);
    const [rawMachineValue, qs] = rest.split('?');
    const qrUuid = extractMachineUuid(rawMachineValue ?? '');
    if (!qrUuid) return { kind: 'unknown', raw };
    const params = qs ? new URLSearchParams(qs) : null;
    const sensorHint =
      params?.get('sensor') ?? params?.get('s') ?? null;
    return { kind: 'machine', qrUuid, sensorHint };
  }

  if (raw.startsWith('sweatdrop://checkin/')) {
    const gymId = raw.slice('sweatdrop://checkin/'.length).trim();
    if (!gymId) return { kind: 'unknown', raw };
    return { kind: 'checkin', gymId };
  }

  // ── Plain UUID fallback (in-app scanner only) ────────────────────────────
  const qrUuid = extractMachineUuid(raw);
  if (qrUuid) {
    return { kind: 'machine', qrUuid, sensorHint: null };
  }

  return { kind: 'unknown', raw };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function t(key: string): string {
  // Allow callers to specify a different namespace via "ns:key" prefix.
  // Without this, t('common:ok') would become i18n.t('scanner:common:ok') —
  // which resolves to a missing-key fallback like "COMMON.OK".
  if (key.includes(':')) {
    return i18n.t(key) as string;
  }
  return i18n.t(`scanner:${key}`) as string;
}

function normaliseCheckinStatus(rawStatus: string): string {
  const KNOWN = [
    'success',
    'already_checked_in',
    'too_far',
    'gym_not_found',
    'gym_suspended',
    'checkin_disabled',
    'cap_reached',
    'rate_limited',
    'fraud_blocked',
  ];
  if (KNOWN.includes(rawStatus)) return rawStatus;
  const msg = rawStatus.toLowerCase();
  if (
    msg.includes('fraud') ||
    msg.includes('abuse') ||
    msg.includes('risk') ||
    msg.includes('blocked')
  )
    return 'fraud_blocked';
  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('throttle') ||
    msg.includes('429')
  )
    return 'rate_limited';
  if (
    msg.includes('cap') ||
    msg.includes('daily limit') ||
    msg.includes('weekly limit') ||
    msg.includes('session limit') ||
    msg.includes('issuance')
  )
    return 'cap_reached';
  return 'error';
}

async function getGps(): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const Location = await import('expo-location').catch(() => null);
    if (!Location) return { lat: null, lng: null };

    const { status: currentStatus } = await Location.getForegroundPermissionsAsync();
    const effectiveStatus =
      currentStatus === 'undetermined'
        ? (await Location.requestForegroundPermissionsAsync()).status
        : currentStatus;

    if (effectiveStatus === 'granted') {
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      if (loc && typeof loc === 'object' && 'coords' in loc) {
        return { lat: loc.coords.latitude, lng: loc.coords.longitude };
      }
    }
  } catch {
    /* GPS unavailable — proceed without coordinates */
  }
  return { lat: null, lng: null };
}

// ── Public handler ────────────────────────────────────────────────────────────

/**
 * Execute QR deep-link business logic (machine scan or gym check-in).
 *
 * Called from the four deep-link route files:
 *   app/m/[uuid].tsx          (new HTTPS Universal Link — machine)
 *   app/c/[gymId].tsx         (new HTTPS Universal Link — check-in)
 *   app/machine/[uuid].tsx    (backward-compat sweatdrop:// — machine)
 *   app/checkin/[gymId].tsx   (backward-compat sweatdrop:// — check-in)
 *
 * All final navigations use router.replace to keep the deep-link route off
 * the back stack.
 */
export async function handleQrDeepLink(
  payload: ParsedQR,
  options: HandleQrDeepLinkOptions,
): Promise<void> {
  const { router, session, showModal } = options;

  const goHome = () => router.replace('/home');
  const errorModal = (title: string, body?: string) =>
    showModal({
      title,
      body,
      buttons: [{ label: t('common:ok'), onPress: goHome }],
    });

  if (!session?.user) {
    goHome();
    return;
  }

  if (payload.kind === 'unknown') {
    errorModal(t('error'), t('errorProcessing'));
    return;
  }

  if (payload.kind === 'checkin') {
    await handleCheckinFlow(payload.gymId, options);
    return;
  }

  await handleMachineFlow(payload.qrUuid, payload.sensorHint, options);
}

// ── Check-in flow ─────────────────────────────────────────────────────────────

async function handleCheckinFlow(
  gymId: string,
  { router, updateHomeGym }: HandleQrDeepLinkOptions,
): Promise<void> {
  try {
    const currentHomeGymId = useGymStore.getState().homeGymId;
    const isNewGym = !currentHomeGymId || currentHomeGymId !== gymId;

    if (isNewGym) {
      log.debug('[handleCheckinFlow] Switching home gym to:', gymId);
      useGymStore.getState().setHomeGymId(gymId);
      try {
        await updateHomeGym(gymId);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useAuthStore } = require('@/lib/stores/authStore');
        await useAuthStore.getState().refreshProfile();
      } catch (err) {
        log.error('[handleCheckinFlow] Error updating home gym:', err);
      }
    }

    const { lat, lng } = await getGps();

    const { data, error } = await supabase.rpc('perform_checkin', {
      p_gym_id: gymId,
      p_lat: lat,
      p_lng: lng,
    });

    if (error) throw error;

    const result = data as Record<string, unknown>;
    const rawStatus = result.success
      ? 'success'
      : String(result.error || 'error');
    const normalizedStatus = normaliseCheckinStatus(rawStatus);

    if (normalizedStatus === 'success') {
      void supabase
        .rpc('evaluate_referral_qualification', { p_referral_id: null })
        .then(({ error: e }) => {
          if (e && __DEV__)
            log.warn('[handleCheckinFlow] evaluate_referral_qualification failed:', e.message);
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
        returnTo: 'home',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = normaliseCheckinStatus(msg);
    router.replace({
      pathname: '/checkin-result',
      params: { status, errorMessage: msg, returnTo: 'home' },
    });
  }
}

// ── Machine flow ──────────────────────────────────────────────────────────────

async function handleMachineFlow(
  qrUuid: string,
  _sensorHint: string | null,
  options: HandleQrDeepLinkOptions,
): Promise<void> {
  const { router, session, showModal, updateHomeGym } = options;
  const goHome = () => router.replace('/home');
  const errorModal = (title: string, body?: string) =>
    showModal({ title, body, buttons: [{ label: t('common:ok'), onPress: goHome }] });

  try {
    const { data: machineStatus, error: rpcError } = await supabase.rpc(
      'get_machine_status',
      { p_qr_uuid: qrUuid },
    );

    if (rpcError) throw rpcError;

    if (!machineStatus || machineStatus.length === 0) {
      errorModal(t('machineNotFound'), t('machineNotFoundDesc'));
      return;
    }

    const machine = machineStatus[0] as MachineStatus;

    if (machine.is_under_maintenance) {
      errorModal(t('machineUnavailable'), t('machineUnavailableDesc'));
      return;
    }

    if (machine.is_busy && machine.current_user_id !== session?.user?.id) {
      errorModal(t('machineBusy'), t('machineBusyDesc'));
      return;
    }

    if (!machine.sensor_id) {
      errorModal(t('sensorNotPaired'), t('sensorNotPairedDesc'));
      return;
    }

    const currentHomeGymId = useGymStore.getState().homeGymId;
    const isFirstGym = !currentHomeGymId || machine.gym_id !== currentHomeGymId;

    if (isFirstGym) {
      log.debug('[handleMachineFlow] Switching home gym to:', machine.gym_id);
      useGymStore.getState().setHomeGymId(machine.gym_id);
      try {
        await updateHomeGym(machine.gym_id);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useAuthStore } = require('@/lib/stores/authStore');
        await useAuthStore.getState().refreshProfile();
      } catch (err) {
        log.error('[handleMachineFlow] Error updating home gym:', err);
      }
    }

    // ── Auto-checkin gate ─────────────────────────────────────────────────
    const { data: checkinStatusData } = await supabase.rpc('get_checkin_status', {
      p_gym_id: machine.gym_id,
    });
    const checkinRow = Array.isArray(checkinStatusData)
      ? checkinStatusData[0]
      : checkinStatusData;
    const alreadyCheckedIn = checkinRow?.already_checked_in === true;

    if (!alreadyCheckedIn) {
      const { lat, lng } = await getGps();
      const { data: ciData, error: ciError } = await supabase.rpc('perform_checkin', {
        p_gym_id: machine.gym_id,
        p_lat: lat,
        p_lng: lng,
      });

      if (!ciError) {
        const ciResult = ciData as Record<string, unknown>;
        const ciSuccess = ciResult?.success === true;

        if (ciSuccess) {
          void supabase.rpc('evaluate_referral_qualification', { p_referral_id: null });
          await startSessionAndRoute(machine, isFirstGym, options, ciResult, 'success');
          return;
        }

        // Non-success (already_checked_in / too_far / cap_reached / …): the
        // user scanned a MACHINE QR — they want to work out, not see a
        // check-in receipt. The /checkin-result screen is reserved for the
        // explicit check-in QR path. Silently proceed to the workout.
        log.debug(
          '[handleMachineFlow] Auto-checkin not awarded (status=' +
            String(ciResult?.error || 'unknown') +
            '), proceeding to workout',
        );
      } else {
        log.warn('[handleMachineFlow] Auto-checkin RPC failed, proceeding anyway:', ciError);
      }
    }

    // Already checked in / auto-checkin not awarded / RPC failed — go straight to workout
    await startSessionAndRoute(machine, isFirstGym, options, null, null);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errorModal(t('error'), msg || t('errorProcessing'));
  }
}

// ── Session start + routing ───────────────────────────────────────────────────

async function startSessionAndRoute(
  machine: MachineStatus,
  isFirstGym: boolean,
  options: HandleQrDeepLinkOptions,
  ciResult: Record<string, unknown> | null,
  ciStatus: string | null,
): Promise<void> {
  const { router, session, showModal } = options;
  const goHome = () => router.replace('/home');
  const errorModal = (title: string, body?: string) =>
    showModal({ title, body, buttons: [{ label: t('common:ok'), onPress: goHome }] });

  try {
    if (!session?.user) throw new Error('No active session');

    const deviceHash = await getDeviceFingerprintHash();
    const { data: startResultData, error: startSessionError } = await supabase.rpc(
      'start_session_safely',
      {
        p_machine_id: machine.machine_id,
        p_started_at: new Date().toISOString(),
        p_device_hash: deviceHash,
      },
    );

    if (startSessionError) throw startSessionError;

    const startResultRaw = Array.isArray(startResultData)
      ? startResultData[0]
      : startResultData;
    const startResult = (startResultRaw ?? null) as StartSessionResult | null;

    if (!startResult?.success || !startResult?.session_id) {
      const errorCode = startResult?.error_code;
      // Step 6 (Bug 1): split the conflated branch into two distinct UX paths.
      // The deep-link entry uses the global AppModal (no occlusion risk here —
      // /m/[uuid] and /machine/[uuid] are plain card screens, not
      // transparentModal). NFC/Universal-Link entries land here.
      if (errorCode === 'machine_busy') {
        showModal({
          title: t('machineBusyOther'),
          body: t('machineBusyOtherDesc'),
          buttons: [{ label: t('common:ok'), onPress: goHome }],
        });
        return;
      }
      if (errorCode === 'user_active_session_conflict') {
        showModal({
          title: t('previousWorkoutOpen'),
          body: t('previousWorkoutOpenDesc'),
          buttons: [
            { label: t('common:cancel'), style: 'cancel', onPress: goHome },
            {
              label: t('closeAndRetry'),
              onPress: () => {
                void recoverAndRetryDeepLink(machine, isFirstGym, options, ciResult, ciStatus);
              },
            },
          ],
        });
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

    const Haptics = await import('expo-haptics');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const workoutParams: Record<string, string> = {
      sessionId: newSession.id,
      machineId: machine.machine_id,
      gymId: machine.gym_id,
      machineType: machine.machine_type,
      sensorId: machine.sensor_id || '',
      bleProtocol: machine.ble_protocol || '',
    };

    if (ciResult !== null && ciStatus !== null) {
      // Auto-checkin path — show checkin-result first, then auto-forward to workout
      const pendingWorkoutDestination = isFirstGym
        ? JSON.stringify({
            pathname: '/gym-welcome',
            params: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              gymName: (newSession as any).gym?.name ?? 'Your Gym',
              ...workoutParams,
            },
          })
        : JSON.stringify({ pathname: '/workout', params: workoutParams });

      const rawStatus = ciResult?.success
        ? 'success'
        : String(ciResult?.error || ciStatus);
      const normalizedStatus = normaliseCheckinStatus(rawStatus) === 'error'
        ? 'success'
        : normaliseCheckinStatus(rawStatus);

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
    } else {
      // Already checked in — navigate directly
      if (isFirstGym) {
        const gymName =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newSession as any).gym?.name ??
          useGymStore.getState().activeGym?.name ??
          'Tvojoj teretani';
        router.replace({
          pathname: '/gym-welcome',
          params: { gymName, ...workoutParams },
        });
      } else {
        router.replace({ pathname: '/workout', params: workoutParams });
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errorModal(t('error'), msg || t('errorWorkout'));
  }
}

// ── Recover-and-retry (Step 6, Bug 1) ─────────────────────────────────────────

/**
 * Close the user's stale `is_active = true` session and retry the deep-link
 * session start. Mirrors `handleRecoverAndRetry` in `ScannerScreen.tsx` but
 * routes failures through the deep-link error modal (which sends the user
 * back to /home rather than re-opening the scanner).
 */
async function recoverAndRetryDeepLink(
  machine: MachineStatus,
  isFirstGym: boolean,
  options: HandleQrDeepLinkOptions,
  ciResult: Record<string, unknown> | null,
  ciStatus: string | null,
): Promise<void> {
  const { router, session, showModal } = options;
  const goHome = () => router.replace('/home');

  try {
    const userId = session?.user?.id;
    if (!userId) {
      goHome();
      return;
    }

    const result = await recoverStaleActiveSession(userId);
    if (!result.closed && result.reason === 'failed') {
      showModal({
        title: t('recoveryFailed'),
        body: t('recoveryFailedDesc'),
        buttons: [{ label: t('common:ok'), onPress: goHome }],
      });
      return;
    }

    // Either we closed the orphan, or there wasn't one — either way,
    // start_session_safely() should now succeed.
    await startSessionAndRoute(machine, isFirstGym, options, ciResult, ciStatus);
  } catch (err) {
    log.error('[handleQrDeepLink] recover-and-retry failed:', err);
    showModal({
      title: t('recoveryFailed'),
      body: t('recoveryFailedDesc'),
      buttons: [{ label: t('common:ok'), onPress: goHome }],
    });
  }
}
