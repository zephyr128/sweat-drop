'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getGymsWithOwnerInfo, suspendGym, activateGym, createGym, getPotentialGymOwners, deleteGym } from '@/lib/actions/gym-actions';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase-client';

interface GymWithOwner {
  gym_id: string;
  gym_name: string;
  city: string | null;
  country: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  is_suspended: boolean;
  subscription_type: string;
  active_machines: number;
}

interface PotentialOwner {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: string;
}

export default function SuperAdminControlTower() {
  const router = useRouter();
  const [gyms, setGyms] = useState<GymWithOwner[]>([]);
  const [potentialOwners, setPotentialOwners] = useState<PotentialOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingGymId, setDeletingGymId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    country: '',
    address: '',
    owner_id: '',
    subscription_type: 'Basic',
    createNewOwner: false,
    owner_email: '',
    owner_username: '',
    owner_full_name: '',
  });

  useEffect(() => {
    checkRole();
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
          // This should be handled by middleware, but double-check
          router.push('/404');
        } else {
          router.push('/404');
        }
        return;
      }

      setCheckingRole(false);
      loadData();
    } catch (error) {
      console.error('Error checking role:', error);
      router.push('/login');
    }
  };

  const loadData = async () => {
    setLoading(true);
    const [gymsResult, ownersResult] = await Promise.all([
      getGymsWithOwnerInfo(),
      getPotentialGymOwners(),
    ]);

    if (gymsResult.success) {
      setGyms(gymsResult.data);
    }
    if (ownersResult.success) {
      setPotentialOwners(ownersResult.data);
    }
    setLoading(false);
  };

  const handleSuspend = async (gymId: string) => {
    const result = await suspendGym(gymId);
    if (result.success) {
      toast.success('Gym suspended successfully');
      loadData();
    } else {
      toast.error(result.error || 'Failed to suspend gym');
    }
  };

  const handleActivate = async (gymId: string) => {
    const result = await activateGym(gymId);
    if (result.success) {
      toast.success('Gym activated successfully');
      loadData();
    } else {
      toast.error(result.error || 'Failed to activate gym');
    }
  };

  const handleDeleteClick = (gymId: string, gymName: string) => {
    setShowDeleteConfirm(gymId);
  };

  const handleDeleteConfirm = async (gymId: string) => {
    setDeletingGymId(gymId);
    const result = await deleteGym(gymId);
    if (result.success) {
      toast.success('Gym deleted successfully');
      setShowDeleteConfirm(null);
      loadData();
    } else {
      toast.error(result.error || 'Failed to delete gym');
    }
    setDeletingGymId(null);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(null);
  };

  const handleCreateGym = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate owner assignment
    if (!formData.createNewOwner && !formData.owner_id) {
      toast.error('Please select an existing owner or create a new one');
      return;
    }

    if (formData.createNewOwner) {
      if (!formData.owner_email || !formData.owner_username) {
        toast.error('Owner email and username are required');
        return;
      }
    }

    setCreating(true);

    const result = await createGym({
      name: formData.name,
      city: formData.city || undefined,
      country: formData.country || undefined,
      address: formData.address || undefined,
      owner_id: formData.createNewOwner ? undefined : formData.owner_id || undefined,
      subscription_type: formData.subscription_type,
      owner_email: formData.createNewOwner ? formData.owner_email : undefined,
      owner_username: formData.createNewOwner ? formData.owner_username : undefined,
      owner_full_name: formData.createNewOwner ? formData.owner_full_name : undefined,
    });

    if (result.success) {
      toast.success('Gym created successfully');
      setShowCreateForm(false);
      setFormData({
        name: '',
        city: '',
        country: '',
        address: '',
        owner_id: '',
        subscription_type: 'Basic',
        createNewOwner: false,
        owner_email: '',
        owner_username: '',
        owner_full_name: '',
      });
      loadData();
    } else {
      toast.error(result.error || 'Failed to create gym');
    }
    setCreating(false);
  };

  if (checkingRole || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF]"></div>
          <p className="mt-4 text-[#808080]">
            {checkingRole ? 'Verifying access...' : 'Loading control tower...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Control Tower</h1>
          <p className="text-[#808080]">Manage gyms, owners, and licensing</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          + Create New Gym
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-8 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Create New Gym</h2>
          <form onSubmit={handleCreateGym} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#808080] mb-2">Gym Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[#808080] mb-2">Subscription Type</label>
                <select
                  value={formData.subscription_type}
                  onChange={(e) => setFormData({ ...formData, subscription_type: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="Basic">Basic</option>
                  <option value="Premium">Premium</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#808080] mb-2">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-[#808080] mb-2">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-[#808080] mb-2">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-[#808080] mb-2">Owner Assignment *</label>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="radio"
                        checked={!formData.createNewOwner}
                        onChange={() => setFormData({ ...formData, createNewOwner: false })}
                        className="w-4 h-4"
                      />
                      <span>Use Existing Owner</span>
                    </label>
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="radio"
                        checked={formData.createNewOwner}
                        onChange={() => setFormData({ ...formData, createNewOwner: true })}
                        className="w-4 h-4"
                      />
                      <span>Create New Owner</span>
                    </label>
                  </div>

                  {!formData.createNewOwner ? (
                    <select
                      required
                      value={formData.owner_id}
                      onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                      className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                    >
                      <option value="">Select an owner...</option>
                      {potentialOwners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.username} ({owner.email})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-[#808080] mb-2">Email *</label>
                        <input
                          type="email"
                          required
                          value={formData.owner_email}
                          onChange={(e) => setFormData({ ...formData, owner_email: e.target.value })}
                          className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-[#808080] mb-2">Username *</label>
                        <input
                          type="text"
                          required
                          value={formData.owner_username}
                          onChange={(e) => setFormData({ ...formData, owner_username: e.target.value })}
                          className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-[#808080] mb-2">Full Name</label>
                        <input
                          type="text"
                          value={formData.owner_full_name}
                          onChange={(e) => setFormData({ ...formData, owner_full_name: e.target.value })}
                          className="w-full px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Gym'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-6 py-2 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1A1A]">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Gym</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Owner</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Subscription</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Machines</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {gyms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#808080]">
                    No gyms found
                  </td>
                </tr>
              ) : (
                gyms.map((gym) => (
                  <tr key={gym.gym_id} className="hover:bg-[#1A1A1A]/50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{gym.gym_name}</div>
                        <div className="text-sm text-[#808080]">
                          {gym.city && `${gym.city}`}
                          {gym.city && gym.country && ', '}
                          {gym.country}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {gym.owner_name ? (
                        <div>
                          <div className="text-white">{gym.owner_name}</div>
                          <div className="text-sm text-[#808080]">{gym.owner_email}</div>
                        </div>
                      ) : (
                        <span className="text-[#808080]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-[#1A1A1A] text-white rounded-full text-sm">
                        {gym.subscription_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white">{gym.active_machines}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          gym.is_suspended
                            ? 'bg-[#FF5252]/20 text-[#FF5252]'
                            : 'bg-[#00E5FF]/20 text-[#00E5FF]'
                        }`}
                      >
                        {gym.is_suspended ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            gym.is_suspended ? handleActivate(gym.gym_id) : handleSuspend(gym.gym_id)
                          }
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            gym.is_suspended
                              ? 'bg-[#00E5FF]/10 text-[#00E5FF] hover:bg-[#00E5FF]/20'
                              : 'bg-[#FF5252]/10 text-[#FF5252] hover:bg-[#FF5252]/20'
                          }`}
                        >
                          {gym.is_suspended ? 'Activate' : 'Suspend'}
                        </button>
                        <a
                          href={`/dashboard/gym/${gym.gym_id}/dashboard`}
                          className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#2A2A2A] transition-colors"
                        >
                          View
                        </a>
                        <button
                          onClick={() => handleDeleteClick(gym.gym_id, gym.gym_name)}
                          disabled={deletingGymId === gym.gym_id}
                          className="px-4 py-2 bg-[#FF5252]/10 text-[#FF5252] rounded-lg text-sm font-medium hover:bg-[#FF5252]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingGymId === gym.gym_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">Delete Gym</h3>
            <p className="text-[#808080] mb-4">
              Are you sure you want to delete this gym? This action cannot be undone and will permanently delete:
            </p>
            <ul className="list-disc list-inside text-[#808080] mb-6 space-y-1 text-sm">
              <li>All sessions and workout data</li>
              <li>All challenges and progress</li>
              <li>All rewards and redemptions</li>
              <li>All machines and equipment</li>
              <li>All member data for this gym</li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteConfirm(showDeleteConfirm)}
                disabled={deletingGymId === showDeleteConfirm}
                className="flex-1 px-4 py-2 bg-[#FF5252] text-white rounded-lg font-medium hover:bg-[#FF5252]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingGymId === showDeleteConfirm ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={handleDeleteCancel}
                disabled={deletingGymId === showDeleteConfirm}
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
