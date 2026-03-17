'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/lib/auth';
import { GymSwitcher } from './GymSwitcher';
import type { LucideIcon } from 'lucide-react';
import {
  Palette,
  LayoutDashboard,
  Dumbbell,
  Trophy,
  ShoppingBag,
  Cpu,
  Ticket,
  Users,
  Building2,
  Activity,
  Award,
  ShieldCheck,
  HeartPulse,
  Swords,
  History,
  Mail,
  Settings,
} from 'lucide-react';
import { getPendingInvitationCount } from '@/lib/actions/arena-invitation-actions';

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
  
  // Extract gym ID from URL if present
  const gymIdFromUrl = useMemo(() => {
    const match = pathname?.match(/^\/dashboard\/gym\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);
  
  // Read gym ID from sessionStorage (set by GymSwitcher)
  // Also save gym ID to sessionStorage when it's in the URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // If gym ID is in URL, save it to sessionStorage
      if (gymIdFromUrl) {
        sessionStorage.setItem('selectedGymId', gymIdFromUrl);
        setGymIdFromStorage(gymIdFromUrl);
      } else {
        // Otherwise, read from sessionStorage
        const stored = sessionStorage.getItem('selectedGymId');
        setGymIdFromStorage(stored);
      }
    }
  }, [pathname, gymIdFromUrl]); // Re-read when pathname or gymIdFromUrl changes
  
  // Use gymId from URL if available, then from sessionStorage, then fall back to prop
  const effectiveGymId = gymIdFromUrl || gymIdFromStorage || currentGymId;

  // Fetch pending invitation count for gym owners/admins
  useEffect(() => {
    if (effectiveGymId && ['gym_owner', 'gym_admin'].includes(role)) {
      getPendingInvitationCount(effectiveGymId).then(setPendingInviteCount);
    }
  }, [effectiveGymId, role]);

  const isActive = (path: string) => {
    if (!pathname) return false;
    // Exact match
    if (pathname === path) return true;
    
    // For superadmin, only use exact match to prevent parent links from being active
    // when child routes are active
    if (role === 'superadmin') {
      return pathname === path;
    }
    
    // For other roles, allow parent path matching (e.g., /dashboard/gym/123 matches /dashboard/gym/123/dashboard)
    return pathname.startsWith(path + '/');
  };

  // Icon component helper
  const Icon = ({ icon: IconComponent, isActive: active }: { icon: LucideIcon; isActive: boolean }) => (
    <IconComponent
      className={active ? 'text-[#00E5FF]' : 'text-zinc-500'}
      size={18}
      strokeWidth={1.5}
    />
  );

  // SuperAdmin navigation
  const superadminLinks = [
    { href: '/dashboard/super', label: 'Gyms', icon: Building2 },
    { href: '/dashboard/super/owners', label: 'Owners', icon: Users },
    { href: '/dashboard/super/machines', label: 'Global Machines', icon: Cpu },
    { href: '/dashboard/super/achievements', label: 'Achievements', icon: Award },
    { href: '/dashboard/arenas', label: 'Arenas', icon: Swords },
    { href: '/dashboard/super/health', label: 'System Health', icon: Activity },
  ];

  // Gym Owner navigation (multi-gym access) - organized in groups
  const gymOwnerLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return {
      core: [
        { href: `${base}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
        { href: `${base}/members`, label: 'Members', icon: Users },
        { href: `${base}/retention`, label: 'Retention', icon: HeartPulse },
        { href: `${base}/workout-plans`, label: 'Workout Plans', icon: Dumbbell },
      ],
      management: [
        { href: `${base}/challenges`, label: 'Challenges', icon: Trophy },
        { href: `${base}/store`, label: 'Store Manager', icon: ShoppingBag },
        { href: `${base}/machines`, label: 'Machines', icon: Cpu },
        { href: `${base}/arenas`, label: 'Local Arenas', icon: Swords },
        { href: `${base}/invitations`, label: 'Invitations', icon: Mail, badge: pendingInviteCount },
        { href: `${base}/leaderboard-history`, label: 'Leaderboard History', icon: History },
      ],
      operations: [
        { href: `${base}/redemptions`, label: 'Redemptions', icon: Ticket },
        { href: `${base}/verify`, label: 'Verify Code', icon: ShieldCheck },
        { href: `${base}/team`, label: 'Team', icon: Users },
        { href: `${base}/settings`, label: 'Settings', icon: Settings },
      ],
    };
  };

  // Global links for gym owner (appear above gym switcher)
  const gymOwnerGlobalLinks = () => {
    return [
      { href: '/dashboard/branding', label: 'Branding', icon: Palette },
    ];
  };

  // Gym Admin navigation (single gym access) - organized in groups
  const gymAdminLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return {
      core: [
        { href: `${base}/dashboard`, label: 'Dashboard', icon: LayoutDashboard },
        { href: `${base}/members`, label: 'Members', icon: Users },
        { href: `${base}/retention`, label: 'Retention', icon: HeartPulse },
        { href: `${base}/workout-plans`, label: 'Workout Plans', icon: Dumbbell },
      ],
      management: [
        { href: `${base}/challenges`, label: 'Challenges', icon: Trophy },
        { href: `${base}/store`, label: 'Store Manager', icon: ShoppingBag },
        { href: `${base}/invitations`, label: 'Invitations', icon: Mail, badge: pendingInviteCount },
        { href: `${base}/leaderboard-history`, label: 'Leaderboard History', icon: History },
      ],
      operations: [
        { href: `${base}/redemptions`, label: 'Redemptions', icon: Ticket },
        { href: `${base}/verify`, label: 'Verify Code', icon: ShieldCheck },
        { href: `${base}/settings`, label: 'Settings', icon: Settings },
      ],
    };
  };

  // Receptionist navigation (redemption terminal only)
  const receptionistLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return {
      operations: [
        { href: `${base}/verify`, label: 'Verify Code', icon: ShieldCheck },
        { href: `${base}/redemptions`, label: 'Redemption Terminal', icon: Ticket },
        { href: `${base}/dashboard`, label: 'Live Feed', icon: LayoutDashboard },
      ],
    };
  };

  type CoreLink = { href: string; label: string; icon: LucideIcon; badge?: number };
  type CoreLinks = CoreLink[];
  type LinkGroups = {
    core?: CoreLinks;
    management?: CoreLinks;
    operations?: CoreLinks;
  };

  const getLinks = (): LinkGroups => {
    if (role === 'superadmin') {
      return { core: superadminLinks };
    } else if (role === 'gym_owner') {
      return gymOwnerLinks(effectiveGymId);
    } else if (role === 'gym_admin') {
      return gymAdminLinks(effectiveGymId);
    } else {
      return receptionistLinks(effectiveGymId);
    }
  };

  const links = getLinks();

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-zinc-950 border border-zinc-900 rounded-lg text-white hover:bg-zinc-900 transition-colors"
        aria-label="Toggle menu"
      >
        <span className="text-2xl">{isOpen ? '✕' : '☰'}</span>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-zinc-950 border-r border-zinc-900 h-screen fixed left-0 top-0 overflow-y-auto z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
      <div className="p-6 border-b border-zinc-900">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] to-[#00B8CC]">
          SweatDrop
        </h1>
        <p className="text-xs text-zinc-500 mt-1">Admin Panel</p>
      </div>

      {/* Global links for gym owner (above gym switcher) */}
      {role === 'gym_owner' && (
        <nav className="p-4 border-b border-zinc-900 space-y-2">
          <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">GLOBAL</p>
          {gymOwnerGlobalLinks().map((link) => {
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
                <span className="text-sm font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Gym Switcher at the top (only for gym owners) */}
      {role === 'gym_owner' && (
        <div className="p-4 border-b border-zinc-900">
          <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">LOCATION</p>
          <GymSwitcher currentGymId={effectiveGymId} role={role} />
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="p-4 space-y-6">
        {links.core && (
          <div>
            {role !== 'superadmin' && (
              <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">CORE</p>
            )}
            <div className="space-y-1">
              {links.core.map((link) => {
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
                    <span className="text-sm font-medium">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {links.management && (
          <div>
            <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">MANAGEMENT</p>
            <div className="space-y-1">
              {links.management.map((link) => {
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
                      <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-[#00E5FF] text-black rounded-full min-w-[18px] text-center">
                        {link.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {links.operations && (
          <div>
            <p className="text-xs text-zinc-500 mb-3 uppercase tracking-wider font-medium">OPERATIONS</p>
            <div className="space-y-1">
              {links.operations.map((link) => {
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
                    <span className="text-sm font-medium">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </aside>
    </>
  );
}
