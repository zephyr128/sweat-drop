/**
 * Deep-link route for HTTPS Universal / App Link machine QR codes.
 *
 * Mounted by expo-router when iOS / Android hands the app a URL matching
 *   https://sweat-drop.com/m/<uuid>[?s=csc]
 *
 * Immediately delegates to handleQrDeepLink which replicates the
 * ScannerScreen machine flow and calls router.replace for all final
 * navigations — this screen never stays on the back stack.
 */

import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/stores/authStore';
import { usePendingQRStore } from '@/lib/stores/usePendingQRStore';
import { useAppModal } from '@/lib/stores/useAppModal';
import { useGymData } from '@/hooks/useGymData';
import { parseQrPayload, handleQrDeepLink } from '@/lib/qr/handleQrDeepLink';
import { log } from '@/lib/logger';

export default function MachineDeepLink() {
  const { uuid, s } = useLocalSearchParams<{ uuid: string; s?: string }>();
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const showModal = useAppModal((state) => state.showModal);
  const { updateHomeGym } = useGymData();
  const setPendingQR = usePendingQRStore((state) => state.setPendingQR);
  const hasHandled = useRef(false);

  useEffect(() => {
    if (!isInitialized) return;
    if (hasHandled.current) return;

    if (!session?.user) {
      // Unauthenticated cold start — store the QR (best-effort; index.tsx may
      // discard it on the no-session path, that's fine) and explicitly route
      // to the welcome screen. Without this redirect the user would sit on a
      // blank black View forever — there is no global no-session guard in
      // _layout.tsx that would otherwise rescue them.
      const url = `https://sweat-drop.com/m/${uuid}${s ? `?s=${s}` : ''}`;
      log.debug('[MachineDeepLink] No session — storing pending QR:', url);
      setPendingQR(url);
      hasHandled.current = true;
      router.replace('/(onboarding)/welcome');
      return;
    }

    if (!uuid) {
      log.warn('[MachineDeepLink] Missing uuid param');
      router.replace('/home');
      return;
    }

    hasHandled.current = true;

    // Reconstruct payload using the legacy scheme so parseQrPayload handles it cleanly
    const raw = `sweatdrop://machine/${uuid}${s ? `?sensor=${s}` : ''}`;
    const payload = parseQrPayload(raw);

    log.debug('[MachineDeepLink] Handling payload:', payload);
    handleQrDeepLink(payload, { router, session, showModal, updateHomeGym });
  }, [isInitialized, session?.user, uuid, s]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
