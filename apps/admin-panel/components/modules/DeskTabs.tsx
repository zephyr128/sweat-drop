'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Ticket, Activity } from 'lucide-react';
import { RedemptionVerifier } from './RedemptionVerifier';
import { RedemptionsList } from './RedemptionsList';
import { LiveFeedWidget } from '@/components/analytics/LiveFeedWidget';

interface DeskTabsProps {
  gymId: string;
}

type Tab = 'verify' | 'queue' | 'activity';

export function DeskTabs({ gymId }: DeskTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'verify';

  const setTab = useCallback((tab: Tab) => {
    const params = new URLSearchParams();
    if (tab !== 'verify') params.set('tab', tab);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router]);

  const tabs: { key: Tab; label: string; icon: typeof ShieldCheck }[] = [
    { key: 'verify', label: 'Verify Code', icon: ShieldCheck },
    { key: 'queue', label: 'Redemptions', icon: Ticket },
    { key: 'activity', label: 'Live Activity', icon: Activity },
  ];

  return (
    <div>
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1 mb-6">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-[#00E5FF] text-black'
                  : 'text-[#808080] hover:text-white'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'verify' && (
        <div className="max-w-2xl mx-auto">
          <RedemptionVerifier gymId={gymId} />
        </div>
      )}
      {activeTab === 'queue' && <RedemptionsList gymId={gymId} />}
      {activeTab === 'activity' && <LiveFeedWidget gymId={gymId} />}
    </div>
  );
}
