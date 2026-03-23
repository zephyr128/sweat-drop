'use client';

import { useState } from 'react';
import { ShoppingBag, Ticket } from 'lucide-react';
import { StoreManager } from './StoreManager';
import { RedemptionsManager } from './RedemptionsManager';

interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  price_drops: number;
  stock: number | null;
  image_url: string | null;
  is_active: boolean;
  redemption_limit?: string | null;
  sponsor_name?: string | null;
  sponsor_logo?: string | null;
  available_from?: string | null;
  available_until?: string | null;
}

interface Redemption {
  id: string;
  redemption_code: string;
  drops_spent: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  source_type?: string;
  description?: string | null;
  created_at: string;
  confirmed_at?: string;
  profiles: {
    id: string;
    username: string;
    email: string;
  } | null;
  rewards: {
    id: string;
    name: string;
    reward_type: string;
    price_drops: number;
    image_url?: string;
  } | null;
  confirmed_by_profile?: {
    id: string;
    username: string;
  } | null;
}

interface StorePageTabsProps {
  gymId: string;
  storeItems: StoreItem[];
  pendingRedemptions: Redemption[];
  confirmedRedemptions: Redemption[];
  pendingCount: number;
}

type Tab = 'rewards' | 'redemptions';

export function StorePageTabs({
  gymId,
  storeItems,
  pendingRedemptions,
  confirmedRedemptions,
  pendingCount,
}: StorePageTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('rewards');

  const tabs: { key: Tab; label: string; icon: typeof ShoppingBag; badge?: number }[] = [
    { key: 'rewards', label: 'Rewards', icon: ShoppingBag },
    { key: 'redemptions', label: 'Redemptions', icon: Ticket, badge: pendingCount },
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

      {activeTab === 'rewards' && (
        <StoreManager gymId={gymId} initialItems={storeItems} />
      )}
      {activeTab === 'redemptions' && (
        <RedemptionsManager
          gymId={gymId}
          initialPendingRedemptions={pendingRedemptions as any}
          initialConfirmedRedemptions={confirmedRedemptions as any}
        />
      )}
    </div>
  );
}
