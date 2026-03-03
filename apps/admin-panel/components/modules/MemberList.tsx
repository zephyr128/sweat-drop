'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getGymMembers,
  GymMember,
  MemberSortField,
  MemberStatusFilter,
} from '@/lib/actions/member-actions';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Droplet,
  Flame,
  Clock,
  Users,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/date';

interface MemberListProps {
  gymId: string;
}

const PAGE_SIZE = 25;

export function MemberList({ gymId }: MemberListProps) {
  const [members, setMembers] = useState<GymMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('all');
  const [sortBy, setSortBy] = useState<MemberSortField>('joined_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGymMembers(gymId, {
        search: debouncedSearch,
        statusFilter,
        sortBy,
        sortDir,
        page,
        pageSize: PAGE_SIZE,
      });
      if (res.success && res.data) {
        setMembers(res.data.members);
        setTotal(res.data.total);
      } else {
        setError(res.error || 'Failed to fetch members');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gymId, debouncedSearch, statusFilter, sortBy, sortDir, page]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSort = (field: MemberSortField) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: MemberSortField }) => {
    if (sortBy !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-[#00E5FF]" />
    ) : (
      <ChevronDown className="w-3 h-3 text-[#00E5FF]" />
    );
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statusBadge = (status: 'active' | 'at_risk' | 'churned') => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Active
          </span>
        );
      case 'at_risk':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" />
            At Risk
          </span>
        );
      case 'churned':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            Churned
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#808080]" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0A0A0A] border border-[#333] rounded-lg text-white text-sm placeholder:text-[#808080] focus:border-[#00E5FF] focus:outline-none focus:ring-1 focus:ring-[#00E5FF]/20"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as MemberStatusFilter);
            setPage(1);
          }}
          className="px-3 py-2.5 bg-[#0A0A0A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="at_risk">At Risk</option>
          <option value="churned">Churned</option>
        </select>
      </div>

      {/* Total count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#808080]">
          {total} member{total !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Table */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-[#FF5252] mx-auto mb-2" />
            <p className="text-[#FF5252] text-sm">{error}</p>
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-[#808080] text-sm">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-[#808080] mx-auto mb-3" />
            <p className="text-white font-medium">No members found</p>
            <p className="text-sm text-[#808080] mt-1">
              {search ? 'Try a different search term' : 'No members have joined yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1A1A1A]">
                  <th
                    className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('username')}
                  >
                    <div className="flex items-center gap-1">
                      Member
                      <SortIcon field="username" />
                    </div>
                  </th>
                  <th
                    className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('total_drops')}
                  >
                    <div className="flex items-center gap-1">
                      <Droplet className="w-3 h-3" />
                      Drops
                      <SortIcon field="total_drops" />
                    </div>
                  </th>
                  <th
                    className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('last_visit_date')}
                  >
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last Visit
                      <SortIcon field="last_visit_date" />
                    </div>
                  </th>
                  <th
                    className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('streak_days')}
                  >
                    <div className="flex items-center gap-1">
                      <Flame className="w-3 h-3" />
                      Streak
                      <SortIcon field="streak_days" />
                    </div>
                  </th>
                  <th
                    className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('joined_at')}
                  >
                    <div className="flex items-center gap-1">
                      Joined
                      <SortIcon field="joined_at" />
                    </div>
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[#808080] uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-[#111] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-[#808080]">
                            {member.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{member.username}</p>
                          <p className="text-xs text-[#808080] truncate">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-[#00E5FF]">
                        {member.total_drops.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-white">
                          {member.last_visit_date
                            ? formatDate(member.last_visit_date)
                            : 'Never'}
                        </p>
                        {member.days_inactive < 999 && (
                          <p className="text-xs text-[#808080]">{member.days_inactive}d ago</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Flame
                          className={`w-4 h-4 ${
                            member.streak_days > 0 ? 'text-amber-400' : 'text-[#333]'
                          }`}
                        />
                        <span className="text-sm text-white">{member.streak_days}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-white">
                        {formatDate(member.joined_at)}
                      </p>
                    </td>
                    <td className="px-6 py-4">{statusBadge(member.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#808080]">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="p-2 bg-[#0A0A0A] border border-[#333] rounded-lg text-white hover:bg-[#1A1A1A] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="p-2 bg-[#0A0A0A] border border-[#333] rounded-lg text-white hover:bg-[#1A1A1A] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
