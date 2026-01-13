'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createGym, createGymAdmin } from '@/lib/actions/gym-actions';

export default function NewGymPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    city: '',
    country: '',
    address: '',
    admin_email: '',
    admin_password: '',
    admin_username: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // 1. Create gym
      const gymResult = await createGym({
        name: formData.name,
        city: formData.city || undefined,
        country: formData.country || undefined,
        address: formData.address || undefined,
      });

      if (!gymResult.success || !gymResult.data) {
        throw new Error(gymResult.error || 'Failed to create gym');
      }

      const gym = gymResult.data;

      // 2. If admin credentials provided, create gym admin
      if (formData.admin_email && formData.admin_password && formData.admin_username) {
        const adminResult = await createGymAdmin({
          email: formData.admin_email,
          password: formData.admin_password,
          username: formData.admin_username,
          gymId: gym.id,
        });

        if (!adminResult.success) {
          // Gym created but admin creation failed
          setError(`Gym created but admin creation failed: ${adminResult.error}`);
          setLoading(false);
          return;
        } else {
          setSuccess(true);
        }
      } else {
        setSuccess(true);
      }

      // Redirect after short delay
      setTimeout(() => {
        router.push('/dashboard/gyms');
      }, 1500);
    } catch (err: any) {
      console.error('Error in handleSubmit:', err);
      setError(err.message || 'Failed to create gym');
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Link 
            href="/dashboard/gyms"
            className="text-[#00E5FF] hover:text-[#00B8CC] mb-2 inline-block"
          >
            ← Back to Gyms
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Create New Gym</h1>
          <p className="text-[#808080]">Add a new gym to the system</p>
        </div>
      </div>

      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Gym Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="Fitness Center Belgrade"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                placeholder="Belgrade"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                placeholder="Serbia"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="123 Main Street"
            />
          </div>

          <div className="border-t border-[#1A1A1A] pt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Create Gym Admin (Optional)</h3>
            <p className="text-sm text-[#808080] mb-4">
              Create a new admin user for this gym. Leave empty to assign later.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Admin Email *
                </label>
                <input
                  type="email"
                  value={formData.admin_email}
                  onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                  className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                  placeholder="admin@gym.com"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={formData.admin_username}
                    onChange={(e) => setFormData({ ...formData, admin_username: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="admin_username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
                    placeholder="Min 6 characters"
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-[#FF5252]/10 border border-[#FF5252]/30 p-4">
              <p className="text-sm text-[#FF5252]">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-[#00E5FF]/10 border border-[#00E5FF]/30 p-4">
              <p className="text-sm text-[#00E5FF]">Gym created successfully! Redirecting...</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Gym'}
            </button>
            <Link
              href="/dashboard/gyms"
              className="px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
