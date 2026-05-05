/**
 * Backward-compatibility route for legacy sweatdrop://machine/<uuid> custom-scheme QR codes.
 *
 * Before this feature, expo-router had no real route for this path and fell
 * through to [...unmatched].tsx, causing the "unmatched route visible after
 * scanner close" regression. This file structurally eliminates that bug.
 *
 * New stickers should encode https://sweat-drop.com/m/<uuid> instead (app/m/[uuid].tsx).
 * This route stays forever so legacy printed stickers keep working.
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

export default function MachineDeepLinkLegacy() {
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
      // Unauthenticated cold start — without an explicit redirect the user
      // would sit on a blank black View forever (no global no-session guard
      // exists in _layout.tsx).
      const url = `sweatdrop://machine/${uuid}${s ? `?sensor=${s}` : ''}`;
      log.debug('[MachineDeepLinkLegacy] No session — storing pending QR:', url);
      setPendingQR(url);
      hasHandled.current = true;
      router.replace('/(onboarding)/welcome');
      return;
    }

    if (!uuid) {
      log.warn('[MachineDeepLinkLegacy] Missing uuid param');
      router.replace('/home');
      return;
    }

    hasHandled.current = true;

    const raw = `sweatdrop://machine/${uuid}${s ? `?sensor=${s}` : ''}`;
    const payload = parseQrPayload(raw);

    log.debug('[MachineDeepLinkLegacy] Handling payload:', payload);
    handleQrDeepLink(payload, { router, session, showModal, updateHomeGym });
  }, [isInitialized, session?.user, uuid, s]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
