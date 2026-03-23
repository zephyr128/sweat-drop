'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

interface MachineHeatmapWidgetProps {
  machineUsage: Array<{ machine_type: string; scan_count: number }>;
  gymId?: string;
}

export function MachineHeatmapWidget({ machineUsage, gymId }: MachineHeatmapWidgetProps) {
  const [liveCount, setLiveCount] = useState<{ active: number; total: number } | null>(null);

  useEffect(() => {
    if (!gymId) return;

    async function fetchLive() {
      const { data, error } = await supabase
        .from('machines')
        .select('id, is_busy')
        .eq('gym_id', gymId!);

      if (!error && data) {
        setLiveCount({
          total: data.length,
          active: data.filter((m: { is_busy: boolean }) => m.is_busy).length,
        });
      }
    }

    fetchLive();

    const channel = supabase
      .channel(`widget-machines-${gymId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'machines',
        filter: `gym_id=eq.${gymId}`,
      }, () => {
        fetchLive();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gymId]);

  const totalScans = (machineUsage || []).reduce(
    (sum, m) => sum + Number(m.scan_count || 0),
    0
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-white">Machine Status</h4>
        {liveCount && liveCount.active > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400">{liveCount.active} active</span>
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {liveCount ? (
          <>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{liveCount.active}</p>
              <p className="text-xs text-[#808080]">
                machine{liveCount.active !== 1 ? 's' : ''} in use now
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-[#808080]">
                {totalScans.toLocaleString()} total scans &bull; {liveCount.total} machines
              </p>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{totalScans.toLocaleString()}</p>
            <p className="text-xs text-[#808080]">total scans</p>
          </div>
        )}

        {gymId && (
          <Link
            href={`/dashboard/gym/${gymId}/machines/analytics`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg hover:bg-[#00E5FF]/20 transition-colors text-sm font-medium mt-2"
          >
            View Machine Hub
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
