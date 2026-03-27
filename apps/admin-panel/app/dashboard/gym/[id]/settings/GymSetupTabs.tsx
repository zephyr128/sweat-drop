'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Building2, MapPin, Palette } from 'lucide-react';
import { GymGeneralForm } from '@/components/modules/GymGeneralForm';
import { CheckinSettingsModule } from '@/components/modules/CheckinSettingsModule';
import { BrandingModule } from '@/components/modules/BrandingModule';

interface GymSetupTabsProps {
  gymId: string;
  ownerId: string;
  role: string;
  gymData: {
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
  };
  checkinData: {
    checkin_drops: number;
    lat: number | null;
    lng: number | null;
    gps_radius_m: number;
    address: string | null;
    city: string | null;
    checkin_verification_mode: 'lenient' | 'strict';
    economyMaxCheckinDropsPerDay: number | null;
    gymRowCheckinDrops: number | null;
  };
  brandingData: {
    primary_color: string | null;
    logo_url: string | null;
    background_url: string | null;
  } | null;
}

const TABS = [
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'location', label: 'Location & Check-in', icon: MapPin },
  { key: 'branding', label: 'Branding', icon: Palette },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function GymSetupTabs({
  gymId,
  ownerId,
  role,
  gymData,
  checkinData,
  brandingData,
}: GymSetupTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = (searchParams.get('tab') as TabKey) || 'general';
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'general'
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabKey;
    if (tabParam && TABS.some((t) => t.key === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== 'general') params.set('tab', tab);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const showBranding = role === 'gym_owner' && brandingData !== null;
  const visibleTabs = showBranding ? TABS : TABS.filter((t) => t.key !== 'branding');

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1">
        {visibleTabs.map((tab) => {
          const active = activeTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                active
                  ? 'bg-[#1A1A1A] text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <TabIcon className={`w-4 h-4 ${active ? 'text-[#00E5FF]' : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'general' && (
        <GymGeneralForm gymId={gymId} initialData={gymData} />
      )}

      {activeTab === 'location' && (
        <CheckinSettingsModule gymId={gymId} initialData={checkinData} />
      )}

      {activeTab === 'branding' && showBranding && (
        <BrandingModule
          ownerId={ownerId}
          initialData={brandingData || { primary_color: null, logo_url: null, background_url: null }}
        />
      )}
    </div>
  );
}
