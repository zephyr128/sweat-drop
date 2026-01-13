'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserRole } from '@/lib/auth';
import { GymSwitcher } from './GymSwitcher';
import { supabase } from '@/lib/supabase-client';

interface SidebarProps {
  role: UserRole;
  currentGymId?: string | null;
}

export function Sidebar({ role, currentGymId }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

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

  const superadminLinks = [
    { href: '/dashboard', label: 'Global Dashboard', icon: '🌐' },
    { href: '/dashboard/gyms', label: 'Gym Management', icon: '🏋️' },
  ];

  const gymAdminLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      { href: `${base}/dashboard`, label: 'Dashboard', icon: '📊' },
      { href: `${base}/branding`, label: 'Branding', icon: '🎨' },
      { href: `${base}/machines`, label: 'Machines', icon: '🏋️' },
      { href: `${base}/challenges`, label: 'Challenges', icon: '🏆' },
      { href: `${base}/store`, label: 'Store Manager', icon: '🛒' },
      { href: `${base}/redemptions`, label: 'Redemptions', icon: '🎫' },
      { href: `${base}/settings`, label: 'Leaderboard Rewards', icon: '🥇' },
    ];
  };

  const receptionistLinks = (gymId?: string | null) => {
    const base = gymId ? `/dashboard/gym/${gymId}` : '/dashboard';
    return [
      { href: `${base}/dashboard`, label: 'Check-in', icon: '✅' },
      { href: `${base}/redemptions`, label: 'Redemptions', icon: '🎫' },
    ];
  };

  const links =
    role === 'superadmin'
      ? superadminLinks
      : role === 'gym_admin'
      ? gymAdminLinks(currentGymId)
      : receptionistLinks(currentGymId);

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

      {role === 'superadmin' && (
        <div className="p-4 border-t border-[#1A1A1A] mt-auto">
          <p className="text-xs text-[#808080] mb-2 uppercase tracking-wide">Gym Switcher</p>
          <GymSwitcher currentGymId={currentGymId} />
        </div>
      )}

      <div className="p-4 border-t border-[#1A1A1A] mt-auto">
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
