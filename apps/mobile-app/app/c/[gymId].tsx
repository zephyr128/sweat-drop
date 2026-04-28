/**
 * Deep-link route for HTTPS Universal / App Link check-in QR codes.
 *
 * Mounted by expo-router when iOS / Android hands the app a URL matching
 *   https://sweat-drop.com/c/<gymId>
 *
 * Immediately delegates to handleQrDeepLink which replicates the
 * ScannerScreen check-in flow and calls router.replace for all final
 * navigations — this screen never stays on the back stack.
 */

import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useAuthStore } from '@/lib/stores/authStore';
import { usePendingQRStore } from '@/lib/stores/usePendingQRStore';
import { useAppModal } from '@/lib/stores/useAppModal';
import { useGymData } from '@/hooks/useGymData';
import { parseQrPayload, handleQrDeepLink } from '@/lib/qr/handleQrDeepLink';
import { log } from '@/lib/logger';

export default function CheckinDeepLink() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  const router = useThrottledRouter();
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
      // Unauthenticated cold start — without an explicit redirect the user
      // would sit on a blank black View forever (no global no-session guard
      // exists in _layout.tsx).
      const url = `https://sweat-drop.com/c/${gymId}`;
      log.debug('[CheckinDeepLink] No session — storing pending QR:', url);
      setPendingQR(url);
      hasHandled.current = true;
      router.replace('/(onboarding)/welcome');
      return;
    }

    if (!gymId) {
      log.warn('[CheckinDeepLink] Missing gymId param');
      router.replace('/home');
      return;
    }

    hasHandled.current = true;

    const payload = parseQrPayload(`sweatdrop://checkin/${gymId}`);

    log.debug('[CheckinDeepLink] Handling payload:', payload);
    handleQrDeepLink(payload, { router, session, showModal, updateHomeGym });
  }, [isInitialized, session?.user, gymId]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
