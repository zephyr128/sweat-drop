import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';
import { useGymStore } from '@/lib/stores/useGymStore';

interface LocalDropsData {
  local_drops_balance: number;
  membership_id: string | null;
}

export function useLocalDrops(gymId: string | null) {
  const { session } = useSession();
  const [localDrops, setLocalDrops] = useState<LocalDropsData>({
    local_drops_balance: 0,
    membership_id: null,
  });
  const [loading, setLoading] = useState(true);

  const loadLocalDrops = async () => {
    if (!session?.user || !gymId) {
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gym_memberships')
        .select('id, local_drops_balance')
        .eq('user_id', session.user.id)
        .eq('gym_id', gymId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine (user hasn't earned drops in this gym yet)
        console.error('Error loading local drops:', error);
      }

      if (data) {
        setLocalDrops({
          local_drops_balance: data.local_drops_balance || 0,
          membership_id: data.id,
        });
      } else {
        // No membership yet, default to 0
        setLocalDrops({ local_drops_balance: 0, membership_id: null });
      }
    } catch (error) {
      console.error('Error loading local drops:', error);
      setLocalDrops({ local_drops_balance: 0, membership_id: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.user || !gymId) {
      setLocalDrops({ local_drops_balance: 0, membership_id: null });
      setLoading(false);
      return;
    }

    loadLocalDrops();
  }, [session?.user?.id, gymId]);

  const refreshLocalDrops = () => {
    loadLocalDrops();
  };

  return {
    localDrops: localDrops.local_drops_balance,
    membershipId: localDrops.membership_id,
    loading,
    refreshLocalDrops,
  };
}
