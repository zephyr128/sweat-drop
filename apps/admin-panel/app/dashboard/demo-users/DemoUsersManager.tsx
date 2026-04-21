'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, ShieldCheck, ShieldX } from 'lucide-react';
import { toggleDemoFlag, type DemoUserRow } from '@/lib/actions/demo-users';

interface DemoUsersManagerProps {
  initialQuery: string;
  demoUsers: DemoUserRow[];
  searchResults: DemoUserRow[];
}

function formatDate(value: string): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString();
}

function formatGymId(value: string | null): string {
  if (!value) return 'No home gym';
  return `${value.slice(0, 8)}...`;
}

export function DemoUsersManager({
  initialQuery,
  demoUsers,
  searchResults,
}: DemoUsersManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [isRouting, startRouting] = useTransition();
  const [isMutating, startMutating] = useTransition();

  const orderedSearchResults = useMemo(() => {
    const deduped = Array.from(
      new Map(searchResults.map((user) => [user.id, user])).values(),
    );

    return deduped.sort((a, b) => {
      if (a.is_demo !== b.is_demo) return a.is_demo ? 1 : -1;
      return a.username.localeCompare(b.username);
    });
  }, [searchResults]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    startRouting(() => {
      if (!trimmed) {
        router.push('/dashboard/demo-users');
        return;
      }
      router.push(`/dashboard/demo-users?q=${encodeURIComponent(trimmed)}`);
    });
  };

  const handleToggle = (user: DemoUserRow, nextValue: boolean) => {
    setUpdatingUserId(user.id);

    startMutating(async () => {
      try {
        const result = await toggleDemoFlag({ user_id: user.id, is_demo: nextValue });
        if (!result.success) {
          toast.error(result.error || 'Failed to update demo flag.');
          return;
        }

        toast.success(
          nextValue
            ? `Demo mode enabled for ${user.username}`
            : `Demo mode revoked for ${user.username}`,
        );
        router.refresh();
      } finally {
        setUpdatingUserId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">Find user by email or username</h2>
        <form onSubmit={submitSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users..."
              className="w-full bg-[#111111] border border-[#262626] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#00E5FF]/70"
            />
          </div>
          <button
            type="submit"
            disabled={isRouting}
            className="px-4 py-2.5 rounded-lg bg-[#00E5FF] text-black text-sm font-semibold hover:bg-[#00cde6] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRouting ? 'Searching...' : 'Search'}
          </button>
        </form>
      </section>

      <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-lg font-semibold text-white">Current demo users</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Users with `profiles.is_demo = true` can access simulator flows.
          </p>
        </div>

        {demoUsers.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500">No demo users enabled yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-[#121212]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">User</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Home Gym</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Created</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {demoUsers.map((user) => {
                  const rowBusy = isMutating && updatingUserId === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-[#111111] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm text-white font-medium">{user.full_name || user.username}</p>
                        <p className="text-xs text-zinc-500">@{user.username}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span>{user.email || 'No email'}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40">
                            DEMO
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300">{user.role}</td>
                      <td className="px-4 py-3 text-sm text-zinc-400" title={user.home_gym_id ?? 'No home gym'}>
                        {formatGymId(user.home_gym_id)}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{formatDate(user.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggle(user, false)}
                          disabled={rowBusy}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <ShieldX className="w-3.5 h-3.5" />
                          {rowBusy ? 'Revoking...' : 'Revoke demo'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-lg font-semibold text-white">Search results</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Use search to promote users into demo mode or revoke existing access.
          </p>
        </div>

        {!initialQuery ? (
          <div className="p-6 text-sm text-zinc-500">Enter a search term to find users.</div>
        ) : orderedSearchResults.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500">No users found for &quot;{initialQuery}&quot;.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead className="bg-[#121212]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">User</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wide text-zinc-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {orderedSearchResults.map((user) => {
                  const rowBusy = isMutating && updatingUserId === user.id;
                  return (
                    <tr key={user.id} className="hover:bg-[#111111] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm text-white font-medium">{user.full_name || user.username}</p>
                        <p className="text-xs text-zinc-500">@{user.username}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300">{user.email || 'No email'}</td>
                      <td className="px-4 py-3 text-sm text-zinc-300">{user.role}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold border ${
                            user.is_demo
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
                          }`}
                        >
                          {user.is_demo ? 'Demo enabled' : 'Regular user'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.is_demo ? (
                          <button
                            onClick={() => handleToggle(user, false)}
                            disabled={rowBusy}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <ShieldX className="w-3.5 h-3.5" />
                            {rowBusy ? 'Revoking...' : 'Revoke demo'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggle(user, true)}
                            disabled={rowBusy}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/25 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {rowBusy ? 'Promoting...' : 'Promote to demo'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
