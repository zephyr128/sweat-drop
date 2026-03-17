'use client';

import { useState, useEffect } from 'react';
import { Swords, Mail } from 'lucide-react';
import { ArenasManager } from './ArenasManager';
import { ArenaInvitationsManager } from './ArenaInvitationsManager';
import { getPendingInvitationCount } from '@/lib/actions/arena-invitation-actions';

interface ArenasPageTabsProps {
  gymId: string;
  isSuperadmin: boolean;
}

type Tab = 'arenas' | 'invitations';

export function ArenasPageTabs({ gymId, isSuperadmin }: ArenasPageTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('arenas');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingInvitationCount(gymId).then(setPendingCount);
  }, [gymId]);

  const tabs: { key: Tab; label: string; icon: typeof Swords; badge?: number }[] = [
    { key: 'arenas', label: 'My Arenas', icon: Swords },
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
              onClick={() => setActiveTab(tab.key)}
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

      {activeTab === 'arenas' && (
        <ArenasManager gymId={gymId} isSuperadmin={isSuperadmin} />
      )}
      {activeTab === 'invitations' && (
        <ArenaInvitationsManager gymId={gymId} />
      )}
    </div>
  );
}
