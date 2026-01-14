'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { createStaffInvitation, cancelInvitation, StaffInvitation } from '@/lib/actions/staff-actions';
import { X, Mail, UserPlus, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react';

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

export function TeamManager({ gymId, initialInvitations, initialStaff, isGymOwner = false }: TeamManagerProps) {
  const [invitations, setInvitations] = useState<StaffInvitation[]>(initialInvitations);
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitationFormData>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      role: 'receptionist',
    },
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
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;

    setCancellingId(invitationId);
    try {
      const result = await cancelInvitation(invitationId, gymId);
      if (result.success) {
        setInvitations(invitations.filter((inv) => inv.id !== invitationId));
        toast.success('Invitation cancelled');
      } else {
        toast.error(`Failed to cancel: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-[#00E5FF]" />;
      case 'expired':
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-[#808080]" />;
      default:
        return <Clock className="w-4 h-4 text-[#FF9100]" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'expired':
        return 'Expired';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-8">
      {/* Invite Staff Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Invite Staff Member
        </button>
      </div>

      {/* Current Staff */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#1A1A1A]">
          <h2 className="text-xl font-bold text-white">Current Staff</h2>
          <p className="text-sm text-[#808080] mt-1">Active staff members</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1A1A]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Name</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Email</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Role</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-[#808080]">
                    No staff members yet. Invite someone to get started!
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id} className="hover:bg-[#1A1A1A]/50">
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">{member.username}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[#808080]">{member.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          member.role === 'gym_admin'
                            ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                            : 'bg-[#FF9100]/10 text-[#FF9100]'
                        }`}
                      >
                        {member.role === 'gym_admin' ? 'Gym Admin' : 'Receptionist'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[#808080] text-sm">{formatDate(member.created_at)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#1A1A1A]">
          <h2 className="text-xl font-bold text-white">Pending Invitations</h2>
          <p className="text-sm text-[#808080] mt-1">Invitations awaiting response</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1A1A]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Email</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Role</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Expires</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#808080]">
                    No invitations yet
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => (
                  <tr key={invitation.id} className="hover:bg-[#1A1A1A]/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#808080]" />
                        <div className="text-white">{invitation.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          invitation.role === 'gym_admin'
                            ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                            : 'bg-[#FF9100]/10 text-[#FF9100]'
                        }`}
                      >
                        {invitation.role === 'gym_admin' ? 'Gym Admin' : 'Receptionist'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(invitation.status)}
                        <span className="text-[#808080] text-sm">{getStatusLabel(invitation.status)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[#808080] text-sm">{formatDate(invitation.expires_at)}</div>
                    </td>
                    <td className="px-6 py-4">
                      {invitation.status === 'pending' && (
                        <button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          disabled={cancellingId === invitation.id}
                          className="p-2 text-[#808080] hover:text-[#FF5252] transition-colors disabled:opacity-50"
                          title="Cancel invitation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Invite Staff Member</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  reset();
                }}
                className="text-[#808080] hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Email Address *
                </label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="staff@example.com"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Role *
                </label>
                <select
                  {...register('role')}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  {isGymOwner ? (
                    <>
                      <option value="gym_admin">Gym Admin (Full access to this gym)</option>
                      <option value="receptionist">Receptionist (Redemptions only)</option>
                    </>
                  ) : (
                    <option value="receptionist">Receptionist (Redemptions only)</option>
                  )}
                </select>
                {errors.role && (
                  <p className="mt-1 text-sm text-[#FF5252]">{errors.role.message}</p>
                )}
                <p className="mt-2 text-xs text-[#808080]">
                  {isGymOwner 
                    ? 'Gym Owners can assign Gym Admins and Receptionists. Gym Admins can only assign Receptionists.'
                    : 'Receptionists can only access the Redemptions terminal.'}
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Sending...' : 'Send Invitation'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    reset();
                  }}
                  className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
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
