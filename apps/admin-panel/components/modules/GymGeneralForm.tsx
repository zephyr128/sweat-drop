'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import { updateGym } from '@/lib/actions/gym-actions';

interface GymGeneralFormProps {
  gymId: string;
  initialData: {
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
  };
}

export function GymGeneralForm({ gymId, initialData }: GymGeneralFormProps) {
  const [name, setName] = useState(initialData.name || '');
  const [address, setAddress] = useState(initialData.address || '');
  const [city, setCity] = useState(initialData.city || '');
  const [country, setCountry] = useState(initialData.country || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Gym name is required');
      return;
    }
    setSaving(true);
    const result = await updateGym(gymId, {
      name: name.trim(),
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      country: country.trim() || undefined,
    });
    setSaving(false);
    if (result.success) {
      toast.success('Gym info saved');
    } else {
      toast.error(result.error || 'Failed to save');
    }
  };

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#00E5FF]" />
          General Information
        </h3>
        <p className="text-[10px] text-zinc-600 mt-0.5">Gym identity visible to members and in the app.</p>
      </div>

      <div className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Gym Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SweatDrop Fitness"
              className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main Street"
              className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Belgrade"
              className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. Serbia"
              className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[#1A1A1A] px-5 py-3 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-[#00E5FF] text-black text-sm font-semibold rounded-lg hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
