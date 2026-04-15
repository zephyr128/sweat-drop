'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/lib/auth';
import { GymSwitcher } from './GymSwitcher';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  UserCog,
  ShoppingBag,
  QrCode,
  Cpu,
  ClipboardList,
  Target,
  Trophy,
  Swords,
  FileBarChart,
  Settings,
  Coins,
  ShieldAlert,
  Building2,
  Award,
  Activity,
  ShieldCheck,
  ScrollText,
  Megaphone,
  ListTodo,
} from 'lucide-react';
import { getPendingInvitationCount } from '@/lib/actions/arena-invitation-actions';
import { getPendingRedemptionCount } from '@/lib/actions/redemption-actions';
import { getPendingWaitlistCount } from '@/lib/actions/waitlist-actions';

interface SidebarProps {
  role: UserRole;
  currentGymId?: string | null;
  username?: string | null;
  email?: string | null;
}

export function Sidebar({ role, currentGymId, username: _username, email: _email }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [gymIdFromStorage, setGymIdFromStorage] = useState<string | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [pendingRedemptionCount, setPendingRedemptionCount] = useState(0);
  const [pendingWaitlistCount, setPendingWaitlistCount] = useState(0);
  
  const gymIdFromUrl = useMemo(() => {
    const match = pathname?.match(/^\/dashboard\/gym\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (gymIdFromUrl) {
        sessionStorage.setItem('selectedGymId', gymIdFromUrl);
        setGymIdFromStorage(gymIdFromUrl);
      } else {
        const stored = sessionStorage.getItem('selectedGymId');
        setGymIdFromStorage(stored);
      }
    }
  }, [pathname, gymIdFromUrl]);
  
  const effectiveGymId = gymIdFromUrl || gymIdFromStorage || currentGymId;

  useEffect(() => {
    if (effectiveGymId && ['gym_owner', 'gym_admin'].includes(role)) {
      getPendingInvitationCount(effectiveGymId).then(setPendingInviteCount);
      getPendingRedemptionCount(effectiveGymId).then(setPendingRedemptionCount);
    }
    if (effectiveGymId && role === 'receptionist') {
      getPendingRedemptionCount(effectiveGymId).then(setPendingRedemptionCount);
    }
    if (role === 'superadmin') {
      getPendingWaitlistCount().then(setPendingWaitlistCount);
    }
  }, [effectiveGymId, role]);

  const isActive = (path: string) => {
    if (!pathname) return false;
    if (pathname === path) return true;
    if (role === 'superadmin') return pathname === path;
    // Exact prefix match, but exclude child nav items that have their own entry
    // e.g. /members/engagement is its own nav link, so /members shouldn't match it
    const isPrefix = pathname.startsWith(path + '/') || pathname.startsWith(path + '?');
    if (!isPrefix) return false;
    // Check if any sibling nav item is a more specific match
    const allHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));
    const longerMatch = allHrefs.some(
      (h) => h !== path && h.length > path.length && pathname.startsWith(h),
    );
    return !longerMatch;
  };

  const Icon = ({ icon: IconComponent, isActive: active }: { icon: LucideIcon; isActive: boolean }) => (
    <IconComponent
      className={active ? 'text-[#00E5FF]' : 'text-zinc-500'}
      size={18}
      strokeWidth={1.5}
    />
  );

  // ── Nav types ────────────────────────────────────────────────────
  type NavLink = { href: string; label: string; icon: LucideIcon; badge?: number; badgeColor?: 'cyan' | 'amber' };
  type NavGroup = { title: string; items: NavLink[] };

  // ── SuperAdmin ──────────────────────────────────────────────────
  const superadminLinks: NavLink[] = [
    { href: '/dashboard/super', label: 'Gyms', icon: Building2 },
    { href: '/dashboard/super/owners', label: 'Owners', icon: Users },
    { href: '/dashboard/super/waitlist', label: 'Waitlist', icon: ListTodo, badge: pendingWaitlistCount, badgeColor: 'amber' },
    { href: '/dashboard/super/machines', label: 'Global Machines', icon: Cpu },
    { href: '/dashboard/super/achievements', label: 'Achievements', icon: Award },
    { href: '/dashboard/arenas', label: 'Arenas', icon: Swords },
    { href: '/dashboard/super/risk', label: 'Risk Console', icon: ShieldAlert },
    { href: '/dashboard/super/health', label: 'System Health', icon: Activity },
    { href: '/dashboard/super/reports', label: 'Reports', icon: FileBarChart },
  ];

  // ── Gym Owner / Gym Admin (new IA) ──────────────────────────────
  const gymNavGroups = (gymId?: string | null): NavGroup[] => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      {
        title: 'HOME',
        items: [
          { href: `${base}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
        ],
      },
      {
        title: 'PEOPLE',
        items: [
          { href: `${base}/members`, label: 'Members', icon: Users },
          { href: `${base}/members/engagement`, label: 'Engagement', icon: Megaphone },
          ...(role !== 'gym_admin' ? [{ href: `${base}/team`, label: 'Team', icon: UserCog }] : []),
        ],
      },
      {
        title: 'REWARDS & DESK',
        items: [
          { href: `${base}/store`, label: 'Store', icon: ShoppingBag, badge: pendingRedemptionCount, badgeColor: 'amber' },
          { href: `${base}/checkin`, label: 'Check-in', icon: QrCode },
          { href: `${base}/activity`, label: 'Activity Log', icon: ScrollText },
        ],
      },
      {
        title: 'FLOOR & PROGRAMS',
        items: [
          { href: `${base}/machines`, label: 'Machines', icon: Cpu },
          { href: `${base}/workout-plans`, label: 'Workout Plans', icon: ClipboardList },
        ],
      },
      {
        title: 'GROWTH',
        items: [
          { href: `${base}/challenges`, label: 'Challenges', icon: Target },
          { href: `${base}/leaderboard-history`, label: 'Leaderboard', icon: Trophy },
          { href: `${base}/arenas`, label: 'Arenas', icon: Swords, badge: pendingInviteCount },
          { href: `${base}/reports`, label: 'Reports', icon: FileBarChart },
        ],
      },
      {
        title: 'SETTINGS',
        items: [
          { href: `${base}/settings`, label: 'Gym Setup', icon: Settings },
        ],
      },
      {
        title: 'ADVANCED',
        items: [
          { href: `${base}/economy`, label: 'Economy', icon: Coins },
          { href: `${base}/risk`, label: 'Safety & Fair Play', icon: ShieldAlert },
        ],
      },
    ];
  };

  // ── Receptionist — locked desk-operator scope ──────────────────
  // Desk already covers verify + redemptions queue + live activity.
  // No Store link needed — avoids redundant nav.
  const receptionistGroups = (gymId?: string | null): NavGroup[] => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      {
        title: 'DESK',
        items: [
          { href: `${base}/desk`, label: 'Desk', icon: ShieldCheck, badge: pendingRedemptionCount, badgeColor: 'amber' },
          { href: `${base}/checkin`, label: 'Check-in', icon: QrCode },
          { href: `${base}/activity`, label: 'Activity Log', icon: ScrollText },
        ],
      },
    ];
  };

  const getNavGroups = (): NavGroup[] => {
    if (role === 'superadmin') {
      return [{ title: '', items: superadminLinks }];
    }
    if (role === 'receptionist') {
      return receptionistGroups(effectiveGymId);
    }
    return gymNavGroups(effectiveGymId);
  };

  const navGroups = getNavGroups();

  return (
    <>
      {/* Mobile menu button — h-16 matches Header so icon aligns with avatar row */}
      <div className="md:hidden fixed left-0 top-0 z-50 flex h-16 items-center pl-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 bg-zinc-950 border border-zinc-900 rounded-lg text-white hover:bg-zinc-900 transition-colors"
          aria-label="Toggle menu"
        >
          <span className="block text-2xl leading-none">{isOpen ? '✕' : '☰'}</span>
        </button>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-zinc-950 border-r border-zinc-900 h-dvh fixed left-0 top-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
      <div className="p-6 border-b border-zinc-900">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] to-[#00B8CC]">
          SweatDrop
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Admin Panel</p>
      </div>

      {/* Global section removed — Branding is now inside Gym Setup (Settings tab) */}

      {/* Gym Switcher */}
      {role === 'gym_owner' && (
        <div className="p-4 border-b border-zinc-900">
          <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">LOCATION</p>
          <GymSwitcher currentGymId={effectiveGymId} role={role} />
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="p-4 space-y-6 max-md:pb-[max(6rem,calc(2.5rem+env(safe-area-inset-bottom,0px)))]">
        {navGroups.map((group) => (
          <div key={group.title || 'root'}>
            {group.title && (
              <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">{group.title}</p>
            )}
            <div className="space-y-1">
              {group.items.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                      active
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                        : 'text-zinc-500 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <Icon icon={link.icon} isActive={active} />
                    <span className="text-sm font-medium flex-1">{link.label}</span>
                    {link.badge && link.badge > 0 ? (
                      <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                        link.badgeColor === 'amber'
                          ? 'bg-amber-500 text-black'
                          : 'bg-[#00E5FF] text-black'
                      }`}>
                        {link.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
    </>
  );
}
