'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Swords, Mail } from 'lucide-react';
import { ArenasList } from './ArenasList';
import { ArenasManager } from './ArenasManager';
import { ArenaInvitationsManager } from './ArenaInvitationsManager';
import { getPendingInvitationCount } from '@/lib/actions/arena-invitation-actions';

interface ArenasPageTabsProps {
  gymId: string;
  isSuperadmin: boolean;
}

type Tab = 'my-arenas' | 'invitations';

export function ArenasPageTabs({ gymId, isSuperadmin }: ArenasPageTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'my-arenas';
  const [pendingCount, setPendingCount] = useState(0);
  const [showManager, setShowManager] = useState(false);

  useEffect(() => {
    getPendingInvitationCount(gymId).then(setPendingCount);
  }, [gymId]);

  const setTab = useCallback((tab: Tab) => {
    const params = new URLSearchParams();
    if (tab !== 'my-arenas') params.set('tab', tab);
    router.push(`?${params.toString()}`, { scroll: false });
    setShowManager(false);
  }, [router]);

  const tabs: { key: Tab; label: string; icon: typeof Swords; badge?: number }[] = [
    { key: 'my-arenas', label: 'My Arenas', icon: Swords },
    { key: 'invitations', label: 'Invitations', icon: Mail, badge: pendingCount },
  ];

  return (
    <div>
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
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
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                  activeTab === tab.key
                    ? 'bg-black/20 text-black'
                    : 'bg-[#00E5FF] text-black'
                }`}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === 'my-arenas' && !showManager && (
        <ArenasList gymId={gymId} isSuperadmin={isSuperadmin} onManage={() => setShowManager(true)} />
      )}
      {activeTab === 'my-arenas' && showManager && (
        <div>
          <button
            onClick={() => setShowManager(false)}
            className="mb-4 text-sm text-[#00E5FF] hover:underline"
          >
            ← Back to list
          </button>
          <ArenasManager gymId={gymId} isSuperadmin={isSuperadmin} />
        </div>
      )}
      {activeTab === 'invitations' && (
        <ArenaInvitationsManager gymId={gymId} />
      )}
    </div>
  );
}
