'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, Phone, Globe, Instagram, Mail, FileText, Save } from 'lucide-react';
import { updateGym } from '@/lib/actions/gym-actions';

export interface GymGeneralData {
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
}

interface GymGeneralFormProps {
  gymId: string;
  initialData: GymGeneralData;
}

const INPUT =
  'w-full px-3 py-2 bg-[#111] border border-[#222] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none';

export function GymGeneralForm({ gymId, initialData }: GymGeneralFormProps) {
  const [name, setName] = useState(initialData.name || '');
  const [address, setAddress] = useState(initialData.address || '');
  const [city, setCity] = useState(initialData.city || '');
  const [country, setCountry] = useState(initialData.country || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [phone, setPhone] = useState(initialData.phone || '');
  const [email, setEmail] = useState(initialData.email || '');
  const [website, setWebsite] = useState(initialData.website || '');
  const [instagram, setInstagram] = useState(initialData.instagram || '');
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
      description: description.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      website: website.trim() || undefined,
      instagram: instagram.trim() || undefined,
    });
    setSaving(false);
    if (result.success) {
      toast.success('Gym info saved');
    } else {
      toast.error(result.error || 'Failed to save');
    }
  };

  return (
    <div className="space-y-5">
      {/* Identity */}
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
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 123 Main Street"
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Belgrade"
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Serbia"
                className={INPUT}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              <FileText className="w-3 h-3 inline mr-1 -mt-0.5" />
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell members what makes your gym special…"
              rows={3}
              className={`${INPUT} resize-none`}
            />
            <p className="text-[10px] text-zinc-600 mt-0.5">Shown on your gym profile in the mobile app.</p>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Phone className="w-4 h-4 text-[#00E5FF]" />
            Contact & Social
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">How members can reach you. Displayed on the gym detail screen.</p>
        </div>

        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                <Phone className="w-3 h-3 inline mr-1 -mt-0.5" />
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +381 11 123 4567"
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                <Mail className="w-3 h-3 inline mr-1 -mt-0.5" />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. info@mygym.com"
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                <Globe className="w-3 h-3 inline mr-1 -mt-0.5" />
                Website
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="e.g. https://mygym.com"
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                <Instagram className="w-3 h-3 inline mr-1 -mt-0.5" />
                Instagram
              </label>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="e.g. @mygym"
                className={INPUT}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save footer */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00E5FF] text-black text-sm font-bold rounded-lg hover:bg-[#00B8CC] disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
