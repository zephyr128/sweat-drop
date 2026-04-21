import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useIsDemoUser } from '@/hooks/useIsDemoUser';

const ENV_DEV_QR_UUID = process.env.EXPO_PUBLIC_DEV_QR_UUID || '';

interface DemoMachine {
  machine_id: string;
  qr_uuid: string;
  machine_name: string;
  machine_type: string;
  gym_id: string;
}

/**
 * Returns the demo machine the current user can attach simulator sessions to.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_DEV_QR_UUID env (dev/preview convenience).
 *   2. RPC get_my_demo_machine() (production — server-controlled, requires
 *      profiles.is_demo = true AND machines.is_demo_machine = true).
 *
 * Returns null when:
 *   - User is not is_demo, OR
 *   - No demo machine configured for user's gym.
 */
export function useDemoMachine(): { qrUuid: string | null; loading: boolean } {
  const isDemo = useIsDemoUser();
  const [qrUuid, setQrUuid] = useState<string | null>(ENV_DEV_QR_UUID || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isDemo) {
      setQrUuid(null);
      setLoading(false);
      return;
    }

    if (ENV_DEV_QR_UUID) {
      setQrUuid(ENV_DEV_QR_UUID);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_demo_machine');
        if (cancelled) return;
        if (error) {
          log.warn('[useDemoMachine] RPC failed:', error.message);
          setQrUuid(null);
          return;
        }

        const row = (Array.isArray(data) ? data[0] : data) as DemoMachine | undefined;
        setQrUuid(row?.qr_uuid ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  return { qrUuid, loading };
}
