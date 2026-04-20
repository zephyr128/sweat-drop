'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Building2, MapPin, Palette, Clock, Camera, Crown } from 'lucide-react';
import { GymGeneralForm, type GymGeneralData } from '@/components/modules/GymGeneralForm';
import { CheckinSettingsModule } from '@/components/modules/CheckinSettingsModule';
import { BrandingModule } from '@/components/modules/BrandingModule';
import { WorkingHoursForm } from '@/components/forms/WorkingHoursForm';
import { GymGalleryManager } from '@/components/modules/GymGalleryManager';
import { OwnerManagementModule } from '@/components/modules/OwnerManagementModule';
import type { GymWorkingHours } from '@/lib/actions/gym-actions';

interface GymSetupTabsProps {
  gymId: string;
  gymName: string;
  ownerId: string;
  role: string;
  gymData: GymGeneralData;
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
  workingHours: GymWorkingHours | null;
  currentOwner: {
    id: string;
    email: string;
    username: string | null;
    full_name: string | null;
  } | null;
}

const ALL_TABS = [
  { key: 'general', label: 'General', icon: Building2 },
  { key: 'hours', label: 'Hours', icon: Clock },
  { key: 'gallery', label: 'Gallery', icon: Camera },
  { key: 'location', label: 'Location & Check-in', icon: MapPin },
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'ownership', label: 'Ownership', icon: Crown },
] as const;

type TabKey = (typeof ALL_TABS)[number]['key'];

export function GymSetupTabs({
  gymId,
  gymName,
  ownerId,
  role,
  gymData,
  checkinData,
  brandingData,
  workingHours,
  currentOwner,
}: GymSetupTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const showBranding = role === 'gym_owner' && brandingData !== null;
  const showOwnership = role === 'superadmin';
  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.key === 'branding') return showBranding;
    if (t.key === 'ownership') return showOwnership;
    return true;
  });

  const initialTab = (searchParams.get('tab') as TabKey) || 'general';
  const [activeTab, setActiveTab] = useState<TabKey>(
    visibleTabs.some((t) => t.key === initialTab) ? initialTab : 'general',
  );

  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabKey;
    if (tabParam && visibleTabs.some((t) => t.key === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams, visibleTabs]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const params = new URLSearchParams();
    if (tab !== 'general') params.set('tab', tab);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1 overflow-x-auto">
        {visibleTabs.map((tab) => {
          const active = activeTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap ${
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

      {activeTab === 'hours' && (
        <WorkingHoursForm gymId={gymId} initialData={workingHours} />
      )}

      {activeTab === 'gallery' && (
        <GymGalleryManager gymId={gymId} />
      )}

      {activeTab === 'location' && (
        <CheckinSettingsModule
          gymId={gymId}
          gymName={gymData.name}
          initialData={checkinData}
        />
      )}

      {activeTab === 'branding' && showBranding && (
        <BrandingModule
          ownerId={ownerId}
          initialData={brandingData || { primary_color: null, logo_url: null, background_url: null }}
        />
      )}

      {activeTab === 'ownership' && showOwnership && (
        <OwnerManagementModule
          gymId={gymId}
          gymName={gymName}
          currentOwner={currentOwner}
        />
      )}
    </div>
  );
}
