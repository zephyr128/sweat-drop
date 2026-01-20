'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole } from '@/lib/auth';
import { GymSwitcher } from './GymSwitcher';
import { supabase } from '@/lib/supabase-client';

interface SidebarProps {
  role: UserRole;
  currentGymId?: string | null;
  username?: string | null;
  email?: string | null;
}

export function Sidebar({ role, currentGymId, username, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [gymIdFromStorage, setGymIdFromStorage] = useState<string | null>(null);
  
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // Clear session storage
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
      }
      // Redirect to login
      router.push('/login');
      // Force hard reload to clear all state
      window.location.href = '/login';
    } catch (error) {
      // Logout error - user will be redirected anyway
    }
  };

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

  // SuperAdmin navigation
  const superadminLinks = [
    { href: '/dashboard/super', label: 'Gyms', icon: '🏋️' },
    { href: '/dashboard/super/owners', label: 'Owners', icon: '👥' },
    { href: '/dashboard/super/machines', label: 'Global Machines', icon: '⚙️' },
    { href: '/dashboard/super/health', label: 'System Health', icon: '💚' },
  ];

  // Gym Owner navigation (multi-gym access)
  const gymOwnerLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      { href: `${base}/dashboard`, label: 'Dashboard', icon: '📊' },
      { href: `${base}/workout-plans`, label: 'Workout Plans', icon: '💪' },
      { href: `${base}/challenges`, label: 'Challenges', icon: '🏆' },
      { href: `${base}/store`, label: 'Store Manager', icon: '🛒' },
      { href: `${base}/machines`, label: 'Machines', icon: '⚙️' },
      { href: `${base}/redemptions`, label: 'Redemptions', icon: '🎫' },
      { href: `${base}/team`, label: 'Team', icon: '👥' },
    ];
  };

  // Global links for gym owner (appear above gym switcher)
  const gymOwnerGlobalLinks = () => {
    return [
      { href: '/dashboard/branding', label: 'Branding', icon: '🎨' },
    ];
  };

  // Gym Admin navigation (single gym access)
  const gymAdminLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      { href: `${base}/dashboard`, label: 'Dashboard', icon: '📊' },
      { href: `${base}/workout-plans`, label: 'Workout Plans', icon: '💪' },
      { href: `${base}/challenges`, label: 'Challenges', icon: '🏆' },
      { href: `${base}/store`, label: 'Store Manager', icon: '🛒' },
      { href: `${base}/redemptions`, label: 'Redemptions', icon: '🎫' },
    ];
  };

  // Receptionist navigation (redemption terminal only)
  const receptionistLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      { href: `${base}/redemptions`, label: 'Redemption Terminal', icon: '🎫' },
      { href: `${base}/dashboard`, label: 'Live Feed', icon: '📡' },
    ];
  };

  const links =
    role === 'superadmin'
      ? superadminLinks
      : role === 'gym_owner'
      ? gymOwnerLinks(effectiveGymId)
      : role === 'gym_admin'
      ? gymAdminLinks(effectiveGymId)
      : receptionistLinks(effectiveGymId);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg text-white hover:bg-[#1A1A1A] transition-colors"
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
        className={`w-64 bg-[#0A0A0A] border-r border-[#1A1A1A] h-screen fixed left-0 top-0 overflow-y-auto z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
      <div className="p-6 border-b border-[#1A1A1A]">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] to-[#00B8CC]">
          SweatDrop
        </h1>
        <p className="text-xs text-[#808080] mt-1">Admin Panel</p>
      </div>

      {/* Global links for gym owner (above gym switcher) */}
      {role === 'gym_owner' && (
        <nav className="p-4 border-b border-[#1A1A1A] space-y-2">
          <p className="text-xs text-[#808080] mb-2 uppercase tracking-wide">Global Settings</p>
          {gymOwnerGlobalLinks().map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive(link.href)
                  ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                  : 'text-[#B0B0B0] hover:bg-[#1A1A1A] hover:text-white'
              }`}
            >
              <span className="text-xl">{link.icon}</span>
              <span className="font-medium">{link.label}</span>
            </Link>
          ))}
        </nav>
      )}

      {/* Gym Switcher at the top (only for gym owners) */}
      {role === 'gym_owner' && (
        <div className="p-4 border-b border-[#1A1A1A]">
          <p className="text-xs text-[#808080] mb-2 uppercase tracking-wide">Switch Location</p>
          <GymSwitcher currentGymId={effectiveGymId} role={role} />
        </div>
      )}

      <nav className="p-4 space-y-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              isActive(link.href)
                ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
                : 'text-[#B0B0B0] hover:bg-[#1A1A1A] hover:text-white'
            }`}
          >
            <span className="text-xl">{link.icon}</span>
            <span className="font-medium">{link.label}</span>
          </Link>
        ))}
      </nav>

      {/* User Info Section */}
      <div className="p-4 border-t border-[#1A1A1A] mt-auto">
        <div className="mb-4 pb-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#00E5FF]/20 flex items-center justify-center">
              <span className="text-lg">👤</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm truncate">
                {username || 'User'}
              </p>
              <p className="text-[#808080] text-xs truncate">
                {email || 'No email'}
              </p>
            </div>
          </div>
          <div className="mt-2">
            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
              role === 'superadmin' 
                ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                : role === 'gym_owner'
                ? 'bg-[#00B8CC]/20 text-[#00B8CC]'
                : role === 'gym_admin'
                ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                : 'bg-[#FF9100]/20 text-[#FF9100]'
            }`}>
              {role === 'superadmin' ? 'Super Admin' :
               role === 'gym_owner' ? 'Gym Owner' :
               role === 'gym_admin' ? 'Gym Admin' :
               role === 'receptionist' ? 'Receptionist' : 'User'}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[#FF5252] hover:bg-[#FF5252]/10 hover:border border-transparent hover:border-[#FF5252]/30 transition-all"
        >
          <span className="text-xl">🚪</span>
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </aside>
    </>
  );
}
