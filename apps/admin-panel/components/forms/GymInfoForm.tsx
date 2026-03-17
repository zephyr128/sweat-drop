'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { updateGym } from '@/lib/actions/gym-actions';
import { Save, Loader2 } from 'lucide-react';

interface GymInfoFormProps {
  gymId: string;
  initialData: {
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
  };
}

export function GymInfoForm({ gymId, initialData }: GymInfoFormProps) {
  const [name, setName] = useState(initialData.name);
  const [address, setAddress] = useState(initialData.address || '');
  const [city, setCity] = useState(initialData.city || '');
  const [country, setCountry] = useState(initialData.country || '');
  const [saving, setSaving] = useState(false);

  const hasChanges =
    name !== initialData.name ||
    address !== (initialData.address || '') ||
    city !== (initialData.city || '') ||
    country !== (initialData.country || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Gym name is required');
      return;
    }

    setSaving(true);
    try {
      const result = await updateGym(gymId, {
        name: trimmed,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
      });

      if (result.success) {
        toast.success('Gym info updated');
      } else {
        toast.error(result.error || 'Failed to update gym info');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-[#1A1A1A] border border-[#333] rounded-lg text-white placeholder-[#555] focus:border-[#00E5FF] focus:outline-none transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Gym Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="e.g. Iron Paradise"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1.5">
          Address
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
          placeholder="e.g. 123 Main Street"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            City
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={inputClass}
            placeholder="e.g. Belgrade"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-1.5">
            Country
          </label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputClass}
            placeholder="e.g. Serbia"
          />
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
