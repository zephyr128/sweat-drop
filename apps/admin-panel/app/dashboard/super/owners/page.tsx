'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createOwner, deleteOwner, getOwnersWithGyms, getPendingOwnerInvitations, resendOwnerInvitation } from '@/lib/actions/owner-actions';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase-client';
import { Trash2, Plus, X, Clock, Mail, Send } from 'lucide-react';

interface Owner {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  created_at: string;
  gyms: Array<{
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    status: string | null;
    subscription_type?: string;
    created_at?: string;
    owner_id?: string | null;
  }>;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  gym_id: string | null;
  gyms: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  } | null;
  inviter: {
    id: string;
    username: string;
    email: string;
  } | null;
}

export default function OwnersPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingOwnerId, setDeletingOwnerId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [resendingInvitationId, setResendingInvitationId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    full_name: '',
  });

  useEffect(() => {
    checkRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        router.push('/login');
        return;
      }

      if (profile.role !== 'superadmin') {
        // Redirect based on role
        if (profile.role === 'gym_owner') {
          const { data: ownedGym } = await supabase
            .from('gyms')
            .select('id')
            .eq('owner_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .single();
          if (ownedGym) {
            router.push(`/dashboard/gym/${ownedGym.id}/dashboard`);
          } else {
            router.push('/404');
          }
        } else if (profile.role === 'gym_admin' || profile.role === 'receptionist') {
          router.push('/404');
        } else {
          router.push('/404');
        }
        return;
      }

      setCheckingRole(false);
      loadOwners();
    } catch (error) {
      console.error('Error checking role:', error);
      router.push('/login');
    }
  };

  const loadOwners = async () => {
    setLoading(true);
    try {
      const [ownersResult, invitationsResult] = await Promise.all([
        getOwnersWithGyms(),
        getPendingOwnerInvitations(),
      ]);
      
      if (ownersResult.success) {
        setOwners(ownersResult.data);
      } else {
        toast.error(ownersResult.error || 'Failed to load owners');
      }
      
      if (invitationsResult.success) {
        setPendingInvitations(invitationsResult.data);
      } else {
        console.error('Failed to load pending invitations:', invitationsResult.error);
      }
    } catch (error) {
      console.error('Error loading owners:', error);
      toast.error('Failed to load owners');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.username) {
      toast.error('Email and username are required');
      return;
    }

    setCreating(true);
    const result = await createOwner({
      email: formData.email,
      username: formData.username,
      full_name: formData.full_name || undefined,
    }) as { success: boolean; data?: any; invitationUrl?: string; error?: string };

    if (result.success) {
      // Show invitation URL in console and toast
      if (result.invitationUrl) {
        console.log('\n========================================');
        console.log('🚀 OWNER INVITATION LINK 🚀');
        console.log('========================================');
        console.log('Email:', formData.email);
        console.log('Verification Link:', result.invitationUrl);
        console.log('========================================\n');
        
        toast.success(
          `Owner invitation created! Check browser console for the verification link.`,
          {
            duration: 10000,
            description: `Link: ${result.invitationUrl}`,
          }
        );
      } else {
        toast.success('Owner invitation sent successfully');
      }
      setShowCreateForm(false);
      setFormData({
        email: '',
        username: '',
        full_name: '',
      });
      loadOwners();
    } else {
      toast.error(result.error || 'Failed to create owner invitation');
    }
    setCreating(false);
  };

  const handleDeleteClick = (ownerId: string) => {
    setShowDeleteConfirm(ownerId);
  };

  const handleDeleteConfirm = async (ownerId: string) => {
    setDeletingOwnerId(ownerId);
    const result = await deleteOwner(ownerId);
    
    if (result.success) {
      toast.success('Owner removed successfully');
      setShowDeleteConfirm(null);
      loadOwners();
    } else {
      toast.error(result.error || 'Failed to delete owner');
    }
    setDeletingOwnerId(null);
  };

  const handleResendInvitation = async (invitationId: string) => {
    setResendingInvitationId(invitationId);
    const result = await resendOwnerInvitation(invitationId);
    
    if (result.success) {
      toast.success('Invitation email sent successfully');
    } else {
      toast.error(result.error || 'Failed to resend invitation');
    }
    setResendingInvitationId(null);
  };

  if (checkingRole || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF]"></div>
          <p className="mt-4 text-[#808080]">
            {checkingRole ? 'Verifying access...' : 'Loading owners...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Gym Owners</h1>
          <p className="text-[#808080]">Manage all gym owners and their locations</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Owner
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-8 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Create New Owner</h2>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setFormData({ email: '', username: '', full_name: '' });
              }}
              className="text-[#808080] hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleCreateOwner} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#808080] mb-2">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[#808080] mb-2">Username *</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[#808080] mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
              >
                {creating ? 'Sending Invitation...' : 'Send Invitation'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({ email: '', username: '', full_name: '' });
                }}
                className="px-6 py-2 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <div className="mb-8 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="p-6 border-b border-[#1A1A1A]">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-[#FF9100]" />
              <h2 className="text-xl font-bold text-white">Pending Owner Invitations</h2>
            </div>
            <p className="text-sm text-[#808080]">
              {pendingInvitations.length} invitation{pendingInvitations.length !== 1 ? 's' : ''} waiting for acceptance
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="p-4 bg-[#1A1A1A] rounded-lg border border-[#2A2A2A]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-[#808080]" />
                        <p className="text-white font-medium">{invitation.email}</p>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-[#FF9100]/20 text-[#FF9100]">
                          Pending
                        </span>
                      </div>
                      {invitation.gyms && (
                        <p className="text-sm text-[#808080] mb-1">
                          For gym: <span className="text-white">{invitation.gyms.name}</span>
                          {invitation.gyms.city && (
                            <span className="text-[#808080]"> - {invitation.gyms.city}</span>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-[#808080]">
                        Invited {new Date(invitation.created_at).toLocaleDateString()} • 
                        Expires {new Date(invitation.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleResendInvitation(invitation.id)}
                      disabled={resendingInvitationId === invitation.id}
                      className="ml-4 px-4 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg font-medium hover:bg-[#00E5FF]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-[#00E5FF]/30"
                      title="Resend invitation email"
                    >
                      <Send className="w-4 h-4" />
                      {resendingInvitationId === invitation.id ? 'Sending...' : 'Resend'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        {!owners || owners.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#808080]">No gym owners found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1A1A1A]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Owner</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Gyms</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Created</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {owners.map((owner) => {
                  const gyms = owner.gyms || [];
                  const activeGyms = gyms.filter((g: any) => g.status === 'active' || g.status === null).length;
                  const suspendedGyms = gyms.filter((g: any) => g.status === 'suspended').length;
                  
                  return (
                    <tr key={owner.id} className="hover:bg-[#1A1A1A]/50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-white">{owner.full_name || owner.username}</div>
                          <div className="text-sm text-[#808080]">@{owner.username}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white">{owner.email}</td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-white font-medium">{gyms.length} total</div>
                          <div className="text-sm text-[#808080]">
                            {activeGyms} active, {suspendedGyms} suspended
                          </div>
                          {gyms.length > 0 && (
                            <div className="text-xs text-[#808080] mt-2">
                              {gyms.slice(0, 2).map((gym: any) => (
                                <div key={gym.id}>
                                  {gym.name} {gym.city && `(${gym.city})`}
                                </div>
                              ))}
                              {gyms.length > 2 && (
                                <div>+{gyms.length - 2} more</div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            activeGyms > 0
                              ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                              : 'bg-[#808080]/20 text-[#808080]'
                          }`}
                        >
                          {activeGyms > 0 ? 'Active' : 'No Active Gyms'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#808080] text-sm">
                        {new Date(owner.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDeleteClick(owner.id)}
                          disabled={deletingOwnerId === owner.id}
                          className="px-4 py-2 bg-[#FF5252]/10 text-[#FF5252] rounded-lg text-sm font-medium hover:bg-[#FF5252]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deletingOwnerId === owner.id ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">Remove Owner</h3>
            <p className="text-[#808080] mb-4">
              Are you sure you want to remove this owner? This will:
            </p>
            <ul className="list-disc list-inside text-[#808080] mb-6 space-y-1 text-sm">
              <li>Change their role from &apos;gym_owner&apos; to &apos;user&apos;</li>
              <li>Unassign all their gyms (gyms will have no owner)</li>
              <li>They will lose access to the admin panel</li>
            </ul>
            <p className="text-yellow-500 text-sm mb-6">
              Note: The auth user account will remain, but they will no longer be a gym owner.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteConfirm(showDeleteConfirm)}
                disabled={deletingOwnerId === showDeleteConfirm}
                className="flex-1 px-4 py-2 bg-[#FF5252] text-white rounded-lg font-medium hover:bg-[#FF5252]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingOwnerId === showDeleteConfirm ? 'Removing...' : 'Yes, Remove'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                disabled={deletingOwnerId === showDeleteConfirm}
                className="flex-1 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
