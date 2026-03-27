'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  createStaffInvitation,
  cancelInvitation,
  resendStaffInvitationEmail,
  getInviteAcceptUrl,
  StaffInvitation,
} from '@/lib/actions/staff-actions';
import {
  X,
  Mail,
  UserPlus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  Send,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';

const invitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['gym_admin', 'receptionist']),
});

type InvitationFormData = z.infer<typeof invitationSchema>;

interface StaffMember {
  id: string;
  username: string;
  email: string;
  role: 'gym_admin' | 'receptionist';
  created_at: string;
}

interface TeamManagerProps {
  gymId: string;
  initialInvitations: StaffInvitation[];
  initialStaff: StaffMember[];
  isGymOwner?: boolean;
}

function DeliveryBadge({ status }: { status: StaffInvitation['email_delivery_status'] }) {
  const config = {
    pending: { label: 'Pending', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    sent: { label: 'Sent', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    failed: { label: 'Failed', bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${c.bg}`}>
      {status === 'sent' && <CheckCircle className="w-2.5 h-2.5" />}
      {status === 'failed' && <AlertCircle className="w-2.5 h-2.5" />}
      {status === 'pending' && <Clock className="w-2.5 h-2.5" />}
      {c.label}
    </span>
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TeamManager({ gymId, initialInvitations, initialStaff, isGymOwner = false }: TeamManagerProps) {
  const [invitations, setInvitations] = useState<StaffInvitation[]>(initialInvitations);
  const [staff, _setStaff] = useState<StaffMember[]>(initialStaff);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitationFormData>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { role: 'receptionist' },
  });

  const onSubmit = async (data: InvitationFormData) => {
    try {
      const result = await createStaffInvitation(gymId, data.email, data.role);
      if (result.success && result.data) {
        setInvitations([result.data as StaffInvitation, ...invitations]);
        toast.success('Invitation sent successfully');
        reset();
        setIsModalOpen(false);
      } else {
        toast.error(`Failed to send invitation: ${result.error}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!(await confirmAction({ title: 'Cancel Invitation', message: 'Are you sure you want to cancel this invitation?', confirmLabel: 'Cancel Invitation', variant: 'warning' }))) return;

    setCancellingId(invitationId);
    try {
      const result = await cancelInvitation(invitationId, gymId);
      if (result.success) {
        setInvitations(invitations.filter((inv) => inv.id !== invitationId));
        toast.success('Invitation cancelled');
      } else {
        toast.error(`Failed to cancel: ${result.error}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCancellingId(null);
    }
  };

  const handleResend = async (invitation: StaffInvitation) => {
    setResendingId(invitation.id);
    try {
      const result = await resendStaffInvitationEmail(invitation.id, gymId);
      if (result.success) {
        setInvitations((prev) =>
          prev.map((inv) =>
            inv.id === invitation.id
              ? { ...inv, email_delivery_status: 'pending' as const, resend_count: inv.resend_count + 1, email_failure_reason: null }
              : inv,
          ),
        );
        toast.success('Invitation email queued for resend');
      } else {
        toast.error(`Resend failed: ${result.error}`);
      }
    } catch (error: unknown) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setResendingId(null);
    }
  };

  const handleCopyLink = async (invitation: StaffInvitation) => {
    if (!invitation.token) {
      toast.error('No invite token available');
      return;
    }
    try {
      const url = await getInviteAcceptUrl(invitation.token);
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-[#00E5FF]" />;
      case 'expired':
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-zinc-500" />;
      default:
        return <Clock className="w-4 h-4 text-amber-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'accepted': return 'Accepted';
      case 'expired': return 'Expired';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const canResend = (inv: StaffInvitation) =>
    (inv.status === 'pending' || inv.status === 'expired') &&
    (inv.email_delivery_status === 'pending' || inv.email_delivery_status === 'failed') &&
    inv.resend_count < 5;

  return (
    <div className="space-y-6">
      {/* Invite button */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold text-sm hover:bg-[#00B8CC] transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite Staff Member
        </button>
      </div>

      {/* Current Staff */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-semibold text-white">Current Staff</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Active team members</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#111]">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Role</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-zinc-400">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-zinc-600 text-sm">
                    No staff members yet. Invite someone to get started.
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} className="hover:bg-[#111]/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-sm text-white font-medium">{member.username}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-sm text-zinc-500">{member.email}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          member.role === 'gym_admin'
                            ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}
                      >
                        {member.role === 'gym_admin' ? 'Admin' : 'Receptionist'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-zinc-600">{formatDate(member.created_at)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invitations */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1A1A1A]">
          <h2 className="text-sm font-semibold text-white">Invitations</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Sent, pending, and past invitations</p>
        </div>

        {invitations.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">
            No invitations yet
          </div>
        ) : (
          <div className="divide-y divide-[#1A1A1A]">
            {invitations.map((inv) => {
              const isExpanded = expandedId === inv.id;
              return (
                <div key={inv.id}>
                  {/* Main row */}
                  <div
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[#111]/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  >
                    <Mail className="w-4 h-4 text-zinc-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">{inv.email}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            inv.role === 'gym_admin'
                              ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {inv.role === 'gym_admin' ? 'Admin' : 'Receptionist'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <DeliveryBadge status={inv.email_delivery_status ?? 'pending'} />
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(inv.status)}
                        <span className="text-xs text-zinc-500">{getStatusLabel(inv.status)}</span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-0 border-t border-[#1A1A1A]/50 bg-[#080808]">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3">
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

                      {inv.resend_count > 0 && (
                        <p className="text-[10px] text-zinc-600 mb-3">
                          Resent {inv.resend_count} time{inv.resend_count > 1 ? 's' : ''}
                          {inv.resend_count >= 5 && ' (limit reached)'}
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

                        {inv.token && inv.status === 'pending' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopyLink(inv); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-800/50 border border-zinc-700/30 rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Invite Link
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

      {/* Invite Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Invite Staff Member</h2>
              <button
                onClick={() => { setIsModalOpen(false); reset(); }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Email Address
                </label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full px-3.5 py-2.5 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white placeholder-zinc-600 focus:border-[#00E5FF] focus:outline-none transition-colors"
                  placeholder="staff@example.com"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Role</label>
                <select
                  {...register('role')}
                  className="w-full px-3.5 py-2.5 bg-[#111] border border-[#1A1A1A] rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none transition-colors"
                >
                  {isGymOwner ? (
                    <>
                      <option value="gym_admin">Gym Admin (Full access)</option>
                      <option value="receptionist">Receptionist (Desk only)</option>
                    </>
                  ) : (
                    <option value="receptionist">Receptionist (Desk only)</option>
                  )}
                </select>
                {errors.role && (
                  <p className="mt-1 text-xs text-red-400">{errors.role.message}</p>
                )}
                <p className="mt-1.5 text-[10px] text-zinc-600">
                  {isGymOwner
                    ? 'Gym Admins have full access. Receptionists can only handle the desk.'
                    : 'Receptionists can only access the desk terminal.'}
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold text-sm hover:bg-[#00B8CC] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Sending…' : 'Send Invitation'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); reset(); }}
                  className="px-4 py-2.5 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#222] transition-colors"
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
