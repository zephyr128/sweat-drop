'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { List, LayoutGrid } from 'lucide-react';
import { MachinesList } from './MachinesList';
import { MachineFloor } from '@/components/analytics/MachineFloor';
import type { UserRole } from '@/lib/auth';

interface MachinesPageViewProps {
  gymId: string;
  userRole: UserRole;
}

type View = 'list' | 'floor';

export function MachinesPageView({ gymId, userRole }: MachinesPageViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = (searchParams.get('view') as View) || 'list';

  const setView = useCallback((v: View) => {
    const params = new URLSearchParams(searchParams.toString());
    if (v === 'list') params.delete('view');
    else params.set('view', v);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, searchParams]);

  return (
    <div>
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setView('list')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            view === 'list' ? 'bg-[#00E5FF] text-black' : 'text-[#808080] hover:text-white'
          }`}
        >
          <List className="w-4 h-4" /> List
        </button>
        <button
          onClick={() => setView('floor')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            view === 'floor' ? 'bg-[#00E5FF] text-black' : 'text-[#808080] hover:text-white'
          }`}
        >
          <LayoutGrid className="w-4 h-4" /> Live Floor
        </button>
      </div>

      {view === 'list' && <MachinesList gymId={gymId} userRole={userRole} />}
      {view === 'floor' && <MachineFloor gymId={gymId} userRole={userRole} />}
    </div>
  );
}
