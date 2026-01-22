'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase-client';
import { User, LogOut, ChevronDown } from 'lucide-react';

interface HeaderProps {
  username?: string | null;
  email?: string | null;
  role: UserRole;
}

export function Header({ username, email, role }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
      }
      router.push('/login');
      window.location.href = '/login';
    } catch (error) {
      // Logout error - user will be redirected anyway
    }
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'superadmin':
        return 'Super Admin';
      case 'gym_owner':
        return 'Gym Owner';
      case 'gym_admin':
        return 'Gym Admin';
      case 'receptionist':
        return 'Receptionist';
      default:
        return 'User';
    }
  };

  const getInitials = () => {
    if (username) {
      return username
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <header className="fixed top-0 right-0 left-64 bg-black border-b border-zinc-900 z-40 h-16 flex items-center justify-end px-6">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF] text-sm font-medium">
            {getInitials()}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-sm font-medium text-white">{username || 'User'}</p>
            <p className="text-xs text-zinc-500">{email || 'No email'}</p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            strokeWidth={1.5}
          />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-950 border border-zinc-900 rounded-lg shadow-lg z-20 overflow-hidden">
              <div className="p-4 border-b border-zinc-900">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-[#00E5FF]/20 flex items-center justify-center text-[#00E5FF] font-medium">
                    {getInitials()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {username || 'User'}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {email || 'No email'}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-zinc-900 text-zinc-300">
                    {getRoleLabel()}
                  </span>
                </div>
              </div>
              <div className="p-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-zinc-900 transition-colors"
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.5} />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
