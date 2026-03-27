'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShoppingBag, Ticket } from 'lucide-react';
import { StoreRewardsList } from './StoreRewardsList';
import { RedemptionsList } from './RedemptionsList';
import { RedemptionVerifier } from './RedemptionVerifier';
import { getPendingRedemptionCount } from '@/lib/actions/redemption-actions';

interface StorePageTabsProps {
  gymId: string;
  readOnly?: boolean;
}

type Tab = 'rewards' | 'redemptions';

export function StorePageTabs({ gymId, readOnly = false }: StorePageTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = readOnly ? 'redemptions' : 'rewards';
  const rawTab = searchParams.get('tab') as Tab | null;
  const activeTab = readOnly ? 'redemptions' : (rawTab || defaultTab);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingRedemptionCount(gymId).then(setPendingCount);
  }, [gymId]);

  const refreshPendingCount = useCallback(() => {
    getPendingRedemptionCount(gymId).then(setPendingCount);
  }, [gymId]);

  const setTab = useCallback((tab: Tab) => {
    const params = new URLSearchParams();
    if (tab !== 'rewards') params.set('tab', tab);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Always-visible verifier at top */}
      <RedemptionVerifier
        gymId={gymId}
        compact
        onRedemptionConfirmed={refreshPendingCount}
      />

      {/* Tabs — hidden for receptionist (readOnly) since they only see redemptions */}
      {!readOnly && (
        <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1">
          <button
            onClick={() => setTab('rewards')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'rewards'
                ? 'bg-[#00E5FF] text-black'
                : 'text-[#808080] hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Rewards
          </button>
          <button
            onClick={() => setTab('redemptions')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
              activeTab === 'redemptions'
                ? 'bg-[#00E5FF] text-black'
                : 'text-[#808080] hover:text-white'
            }`}
          >
            <Ticket className="w-4 h-4" />
            Redemptions
            {pendingCount > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                activeTab === 'redemptions'
                  ? 'bg-black/20 text-black'
                  : 'bg-amber-500 text-black'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'rewards' && !readOnly && <StoreRewardsList gymId={gymId} />}
      {activeTab === 'redemptions' && (
        <RedemptionsList gymId={gymId} onActionComplete={refreshPendingCount} />
      )}
    </div>
  );
}
