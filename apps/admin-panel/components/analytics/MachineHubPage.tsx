'use client';

import { useState } from 'react';
import { Radio, BarChart3 } from 'lucide-react';
import { LiveMachineMonitor } from './LiveMachineMonitor';
import { MachineAnalyticsDashboard } from './MachineAnalyticsDashboard';

interface MachineHubPageProps {
  gymId: string;
}

type Tab = 'live' | 'analytics';

export function MachineHubPage({ gymId }: MachineHubPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('live');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveTab('live')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'live'
              ? 'bg-[#00E5FF] text-black'
              : 'bg-[#1A1A1A] text-[#808080] border border-[#333] hover:text-white'
          }`}
        >
          <span className="relative flex items-center">
            <Radio className="w-4 h-4" />
            {activeTab === 'live' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </span>
          Live Monitor
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
            activeTab === 'analytics'
              ? 'bg-[#00E5FF] text-black'
              : 'bg-[#1A1A1A] text-[#808080] border border-[#333] hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'live' && <LiveMachineMonitor gymId={gymId} />}
      {activeTab === 'analytics' && <MachineAnalyticsDashboard gymId={gymId} />}
    </div>
  );
}
