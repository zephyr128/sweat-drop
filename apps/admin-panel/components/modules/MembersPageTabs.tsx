'use client';

import { useState } from 'react';
import { Users, HeartPulse } from 'lucide-react';
import { MemberList } from './MemberList';
import { RetentionDashboard } from './RetentionDashboard';

interface MembersPageTabsProps {
  gymId: string;
}

type Tab = 'members' | 'retention';

export function MembersPageTabs({ gymId }: MembersPageTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('members');

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'members', label: 'Members', icon: Users },
    { key: 'retention', label: 'Retention', icon: HeartPulse },
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
            </button>
          );
        })}
      </div>

      {activeTab === 'members' && <MemberList gymId={gymId} />}
      {activeTab === 'retention' && <RetentionDashboard gymId={gymId} />}
    </div>
  );
}
