'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function RewardsPage() {
  const [session, setSession] = useState<any>(null);
  const [gymStaff, setGymStaff] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReward, setEditingReward] = useState<any>(null);
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    reward_type: 'coffee',
    price_drops: '',
    stock: '',
    is_active: true,
  });

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (gymStaff?.gym_id) {
      loadRewards();
    }
  }, [gymStaff]);

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    setSession(session);

    const { data: staffData } = await supabase
      .from('gym_staff')
      .select('*, gym:gym_id(*)')
      .eq('user_id', session.user.id)
      .single();

    if (staffData) {
      setGymStaff(staffData);
    } else {
      router.push('/login');
    }

    setLoading(false);
  };

  const loadRewards = async () => {
    if (!gymStaff?.gym_id) return;

    const { data } = await supabase
      .from('rewards')
      .select('*')
      .eq('gym_id', gymStaff.gym_id)
      .order('created_at', { ascending: false });

    if (data) {
      setRewards(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!gymStaff?.gym_id) return;

    const rewardData = {
      gym_id: gymStaff.gym_id,
      name: formData.name,
      description: formData.description || null,
      reward_type: formData.reward_type,
      price_drops: parseInt(formData.price_drops),
      stock: formData.stock ? parseInt(formData.stock) : null,
      is_active: formData.is_active,
    };

    if (editingReward) {
      const { error } = await supabase
        .from('rewards')
        .update(rewardData)
        .eq('id', editingReward.id);

      if (error) {
        alert(error.message);
      } else {
        setShowForm(false);
        setEditingReward(null);
        resetForm();
        loadRewards();
      }
    } else {
      const { error } = await supabase.from('rewards').insert(rewardData);

      if (error) {
        alert(error.message);
      } else {
        setShowForm(false);
        resetForm();
        loadRewards();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      reward_type: 'coffee',
      price_drops: '',
      stock: '',
      is_active: true,
    });
  };

  const handleEdit = (reward: any) => {
    setEditingReward(reward);
    setFormData({
      name: reward.name,
      description: reward.description || '',
      reward_type: reward.reward_type,
      price_drops: reward.price_drops.toString(),
      stock: reward.stock?.toString() || '',
      is_active: reward.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reward?')) return;

    const { error } = await supabase.from('rewards').delete().eq('id', id);

    if (error) {
      alert(error.message);
    } else {
      loadRewards();
    }
  };

  const getRewardTypeLabel = (type: string) => {
    switch (type) {
      case 'coffee':
        return 'Coffee';
      case 'protein':
        return 'Protein';
      case 'discount':
        return 'Discount';
      case 'merch':
        return 'Merchandise';
      default:
        return type;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              ← Back to Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Rewards Manager</h1>
            <div></div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => {
              setShowForm(true);
              setEditingReward(null);
              resetForm();
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            Add Reward
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingReward ? 'Edit Reward' : 'Add Reward'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  value={formData.reward_type}
                  onChange={(e) =>
                    setFormData({ ...formData, reward_type: e.target.value })
                  }
                >
                  <option value="coffee">Coffee</option>
                  <option value="protein">Protein</option>
                  <option value="discount">Discount</option>
                  <option value="merch">Merchandise</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Price (Drops)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  value={formData.price_drops}
                  onChange={(e) =>
                    setFormData({ ...formData, price_drops: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Stock (optional, leave empty for unlimited)
                </label>
                <input
                  type="number"
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.checked })
                  }
                />
                <label className="ml-2 text-sm text-gray-700">Active</label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                >
                  {editingReward ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingReward(null);
                    resetForm();
                  }}
                  className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rewards.map((reward) => (
                <tr key={reward.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{reward.name}</div>
                    {reward.description && (
                      <div className="text-sm text-gray-500">{reward.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getRewardTypeLabel(reward.reward_type)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    💧 {reward.price_drops}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {reward.stock !== null ? reward.stock : 'Unlimited'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        reward.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {reward.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(reward)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(reward.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
