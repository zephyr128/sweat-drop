'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  UserCog, Shield, ShieldCheck, Mail, UserPlus, X,
  Trash2, Clock, CheckCircle2, XCircle, ChevronDown,
  RefreshCw, Copy, AlertCircle, Send,
} from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableQuery } from '@/components/ui/DataTable';
import { listStaff, type StaffRow } from '@/lib/actions/list-actions';
import {
  createStaffInvitation,
  cancelInvitation,
  resendStaffInvitationEmail,
  getInviteAcceptUrl,
  getStaffInvitations,
  type StaffInvitation,
} from '@/lib/actions/staff-actions';
import type { PaginatedResult } from '@/lib/actions/list-helpers';
import { MemberAvatar } from '@/components/MemberAvatar';
import { confirmAction } from '@/components/ui/ConfirmDialog';

interface TeamListProps {
  gymId: string;
  isGymOwner: boolean;
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  gym_owner: { label: 'Owner', cls: 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/20' },
  gym_admin: { label: 'Admin', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  receptionist: { label: 'Receptionist', cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-700/50' },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock },
  accepted: { label: 'Accepted', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  expired: { label: 'Expired', cls: 'bg-zinc-800 text-zinc-500 border-zinc-700/50', icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-zinc-800 text-zinc-500 border-zinc-700/50', icon: XCircle },
};

const DELIVERY_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  sent: { label: 'Sent', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const invitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['gym_admin', 'receptionist']),
});
type InvitationFormData = z.infer<typeof invitationSchema>;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d: string | null | undefined) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const COLUMNS: ColumnDef<StaffRow>[] = [
  {
    key: 'username',
    label: 'Member',
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-3.5 py-0.5">
        <MemberAvatar username={row.username || row.email} avatarUrl={row.avatar_url} size="md" />
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{row.username || row.full_name || 'Unnamed'}</p>
          <p className="text-zinc-500 text-xs mt-0.5">{row.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'role',
    label: 'Role',
    sortable: true,
    render: (row) => {
      const badge = ROLE_BADGE[row.role] || { label: row.role, cls: 'bg-zinc-800 text-zinc-400 border-zinc-700/50' };
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.cls}`}>
          {row.role === 'gym_owner' ? <ShieldCheck className="w-3 h-3" /> :
           row.role === 'gym_admin' ? <Shield className="w-3 h-3" /> :
           <UserCog className="w-3 h-3" />}
          {badge.label}
        </span>
      );
    },
  },
  {
    key: 'created_at',
    label: 'Joined',
    sortable: true,
    render: (row) => (
      <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>
    ),
  },
];

export function TeamList({ gymId, isGymOwner }: TeamListProps) {
  const [data, setData] = useState<PaginatedResult<StaffRow>>({
    items: [], total: 0, page: 1, limit: 25, totalPages: 1,
  });
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc',
  });

  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [expandedInvId, setExpandedInvId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitationFormData>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { role: 'receptionist' },
  });

  const fetchData = useCallback((q: DataTableQuery) => {
    startTransition(async () => {
      const result = await listStaff(gymId, {
        q: q.q, page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir,
      });
      if (result.success) setData(result.data);
    });
  }, [gymId]);

  const fetchInvitations = useCallback(async () => {
    setInvLoading(true);
    const result = await getStaffInvitations(gymId);
    if (result.success && result.data) {
      setInvitations(Array.isArray(result.data) ? result.data as StaffInvitation[] : []);
    }
    setInvLoading(false);
  }, [gymId]);

  useEffect(() => { fetchData(query); }, [query, fetchData]);
  useEffect(() => { fetchInvitations(); }, [fetchInvitations]);

  const handleQueryChange = useCallback((update: DataTableQuery) => {
    setQuery((prev) => {
      const next = { ...prev, ...update };
      if (update.filters) next.filters = { ...prev.filters, ...update.filters };
      return next;
    });
  }, []);

  const onSubmitInvite = async (formData: InvitationFormData) => {
    const result = await createStaffInvitation(gymId, formData.email, formData.role);
    if (result.success && result.data) {
      setInvitations((prev) => [result.data as StaffInvitation, ...prev]);
      toast.success('Invitation sent successfully');
      reset();
      setIsModalOpen(false);
    } else {
      toast.error(result.error || 'Failed to send invitation');
    }
  };

  const handleCancelInvitation = async (id: string) => {
    if (!(await confirmAction({
      title: 'Cancel Invitation',
      message: 'Are you sure you want to cancel this invitation?',
      confirmLabel: 'Cancel Invitation',
      variant: 'warning',
    }))) return;
    setCancellingId(id);
    const result = await cancelInvitation(id, gymId);
    setCancellingId(null);
    if (result.success) {
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      toast.success('Invitation cancelled');
    } else {
      toast.error(result.error || 'Failed to cancel');
    }
  };

  const handleResend = async (inv: StaffInvitation) => {
    setResendingId(inv.id);
    const result = await resendStaffInvitationEmail(inv.id, gymId);
    setResendingId(null);
    if (result.success) {
      setInvitations((prev) =>
        prev.map((i) =>
          i.id === inv.id
            ? { ...i, email_delivery_status: 'pending' as const, resend_count: (i.resend_count ?? 0) + 1, email_failure_reason: null }
            : i,
        ),
      );
      toast.success('Invitation email queued for resend');
    } else {
      toast.error(result.error || 'Resend failed');
    }
  };

  const handleCopyLink = async (inv: StaffInvitation) => {
    if (!inv.token) {
      toast.error('No invite token available');
      return;
    }
    try {
      const url = await getInviteAcceptUrl(inv.token);
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const canResend = (inv: StaffInvitation) =>
    (inv.status === 'pending' || inv.status === 'expired') &&
    (inv.email_delivery_status === 'pending' || inv.email_delivery_status === 'failed') &&
    (inv.resend_count ?? 0) < 5;

  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');
  const acceptedInvitations = invitations.filter((inv) => inv.status === 'accepted');
  const failedInvitations = invitations.filter((inv) => inv.status === 'expired' || inv.status === 'cancelled');
  // Accepted invitations that DON'T appear in the staff list (profile not yet updated)
  const orphanedAccepted = acceptedInvitations.filter(
    (inv) => !data.items.some((s) => s.email?.toLowerCase() === inv.email?.toLowerCase()),
  );
  const sortedInvitations = [...pendingInvitations, ...orphanedAccepted, ...failedInvitations];

  return (
    <div className="space-y-6">
      {/* Invite button */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium hover:bg-[#00E5FF]/90 transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite Staff
        </button>
      </div>

      {/* Current Staff — DataTable with card rows */}
      <DataTable<StaffRow>
        data={data.items}
        columns={COLUMNS}
        total={data.total}
        page={data.page}
        limit={data.limit}
        totalPages={data.totalPages}
        loading={loading}
        searchPlaceholder="Search staff by name or email…"
        sortBy={query.sortBy}
        sortDir={query.sortDir}
        emptyIcon={<UserCog className="w-10 h-10" />}
        emptyTitle="No staff yet"
        emptyDescription="Invite an admin or receptionist to help manage your gym."
        emptyCTA={
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-2 px-4 py-2 bg-[#00E5FF] text-black rounded-lg text-sm font-medium"
          >
            + Invite Staff
          </button>
        }
        onQueryChange={handleQueryChange}
        rowKey={(r) => r.id}
        cardRows
      />

      {/* Invitations */}
      {(sortedInvitations.length > 0 || invLoading) && (
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold text-white">
                Invitations
                {pendingInvitations.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400 min-w-[18px] text-center">
                    {pendingInvitations.length}
                  </span>
                )}
              </h3>
            </div>
          </div>

          {invLoading ? (
            <div className="px-4 py-8 text-center">
              <div className="w-5 h-5 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-600 text-sm">
              No invitations sent yet.
            </div>
          ) : (
            <div className="divide-y divide-[#1A1A1A]/60">
              {sortedInvitations.map((inv) => {
                const status = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
                const StatusIcon = status.icon;
                const roleBadge = ROLE_BADGE[inv.role] || ROLE_BADGE.receptionist;
                const delivery = DELIVERY_CONFIG[inv.email_delivery_status ?? 'pending'] || DELIVERY_CONFIG.pending;
                const isExpanded = expandedInvId === inv.id;

                return (
                  <div key={inv.id}>
                    {/* Row */}
                    <div
                      className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-zinc-900/30 transition-colors ${
                        inv.status === 'pending' ? 'bg-zinc-900/20' : ''
                      }`}
                      onClick={() => setExpandedInvId(isExpanded ? null : inv.id)}
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{inv.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${roleBadge.cls}`}>
                            {roleBadge.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${delivery.cls}`}>
                            {inv.email_delivery_status === 'sent' && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {inv.email_delivery_status === 'failed' && <AlertCircle className="w-2.5 h-2.5" />}
                            {(inv.email_delivery_status ?? 'pending') === 'pending' && <Clock className="w-2.5 h-2.5" />}
                            Email: {delivery.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.cls}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-2 bg-[#080808] border-t border-[#1A1A1A]/40">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
                          <TimelineField label="Created" value={formatDateTime(inv.created_at)} />
                          <TimelineField label="Email sent" value={formatDateTime(inv.email_sent_at)} />
                          <TimelineField label="Accepted" value={formatDateTime(inv.accepted_at)} />
                          <TimelineField label="Expires" value={formatDateTime(inv.expires_at)} />
                        </div>

                        {inv.email_failure_reason && (
                          <div className="flex items-start gap-2 px-3 py-2 bg-red-500/5 border border-red-500/10 rounded-lg mb-3">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-red-400">{inv.email_failure_reason}</p>
                          </div>
                        )}

                        {(inv.resend_count ?? 0) > 0 && (
                          <p className="text-[10px] text-zinc-600 mb-3">
                            Resent {inv.resend_count} time{(inv.resend_count ?? 0) > 1 ? 's' : ''}
                            {(inv.resend_count ?? 0) >= 5 && ' (limit reached)'}
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          {canResend(inv) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResend(inv); }}
                              disabled={resendingId === inv.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#00E5FF] bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-lg hover:bg-[#00E5FF]/20 transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${resendingId === inv.id ? 'animate-spin' : ''}`} />
                              Resend Email
                            </button>
                          )}

                          {inv.token && (inv.status === 'pending' || inv.status === 'expired') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyLink(inv); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-800/50 border border-zinc-700/30 rounded-lg hover:bg-zinc-800 transition-colors"
                            >
                              <Copy className="w-3 h-3" />
                              Copy Link
                            </button>
                          )}

                          {inv.status === 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelInvitation(inv.id); }}
                              disabled={cancellingId === inv.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/5 border border-red-500/10 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A]">
              <h2 className="text-lg font-bold text-white">Invite Staff Member</h2>
              <button
                onClick={() => { setIsModalOpen(false); reset(); }}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmitInvite)} className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Email Address
                </label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full px-3.5 py-2.5 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder:text-zinc-600 focus:border-[#00E5FF]/50 focus:outline-none transition-colors"
                  placeholder="staff@example.com"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Role
                </label>
                <select
                  {...register('role')}
                  className="w-full px-3.5 py-2.5 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF]/50 focus:outline-none transition-colors"
                >
                  {isGymOwner && (
                    <option value="gym_admin">Gym Admin — Full access to this gym</option>
                  )}
                  <option value="receptionist">Receptionist — Desk only</option>
                </select>
                {errors.role && (
                  <p className="mt-1 text-xs text-red-400">{errors.role.message}</p>
                )}
                <p className="mt-1.5 text-[10px] text-zinc-600">
                  {isGymOwner
                    ? 'Admins can manage everything except ownership. Receptionists handle the desk only.'
                    : 'Receptionists can only access the desk terminal.'}
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-[#00E5FF] text-black rounded-lg text-sm font-medium hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Sending…' : 'Send Invitation'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); reset(); }}
                  className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
      <p className={`text-xs mt-0.5 ${value ? 'text-zinc-300' : 'text-zinc-700'}`}>
        {value ?? '—'}
      </p>
    </div>
  );
}
