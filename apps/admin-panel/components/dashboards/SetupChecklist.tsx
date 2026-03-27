'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, MapPin, Gift, Cpu, UserPlus, Building2, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SetupStatus {
  gymInfo: boolean;
  checkinLocation: boolean;
  firstReward: boolean;
  firstMachine: boolean;
  invitedStaff: boolean;
}

interface SetupChecklistProps {
  gymId: string;
  status: SetupStatus;
}

interface ChecklistStep {
  key: keyof SetupStatus;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

export function SetupChecklist({ gymId, status }: SetupChecklistProps) {
  const [collapsed, setCollapsed] = useState(false);
  const base = `/dashboard/gym/${gymId}`;

  const steps: ChecklistStep[] = [
    { key: 'gymInfo', label: 'Complete gym info', description: 'Name, address, and location', icon: Building2, href: `${base}/settings` },
    { key: 'checkinLocation', label: 'Configure check-in', description: 'Set GPS coordinates for member check-in', icon: MapPin, href: `${base}/checkin` },
    { key: 'firstReward', label: 'Add first reward', description: 'Create a store item members can redeem', icon: Gift, href: `${base}/store` },
    { key: 'firstMachine', label: 'Add first machine', description: 'Register a treadmill or bike', icon: Cpu, href: `${base}/machines` },
    { key: 'invitedStaff', label: 'Invite a staff member', description: 'Add an admin or receptionist', icon: UserPlus, href: `${base}/team` },
  ];

  const completed = Object.values(status).filter(Boolean).length;
  const total = steps.length;

  if (completed >= total) return null;

  const progress = Math.round((completed / total) * 100);

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      {/* Header — always visible, acts as toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-zinc-900/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Gym Setup Checklist</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {completed}/{total} complete — {total - completed} remaining
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-[#00E5FF]">{progress}%</span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`} />
        </div>
      </button>

      {/* Progress bar — always visible */}
      <div className="px-5 pb-1">
        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00E5FF] to-[#00B8CC] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps — collapsible */}
      {!collapsed && (
        <div className="px-5 pt-3 pb-4 space-y-1">
          {steps.map((step) => {
            const done = status[step.key];
            const StepIcon = step.icon;
            return (
              <Link
                key={step.key}
                href={step.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all group ${
                  done ? 'opacity-50' : 'hover:bg-zinc-900/50'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-zinc-600 shrink-0 group-hover:text-[#00E5FF] transition-colors" />
                )}
                <StepIcon className={`w-3.5 h-3.5 shrink-0 ${done ? 'text-zinc-600' : 'text-zinc-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${done ? 'text-zinc-600 line-through' : 'text-white'}`}>{step.label}</p>
                  <p className="text-[10px] text-zinc-600 truncate">{step.description}</p>
                </div>
                {!done && (
                  <span className="text-[10px] text-[#00E5FF] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Set up →
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
