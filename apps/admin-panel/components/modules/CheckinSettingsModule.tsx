'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MapPin, Printer, Navigation, ChevronDown, Droplet } from 'lucide-react';
import { updateGymCheckinSettings } from '@/lib/actions/gym-actions';

interface CheckinSettingsModuleProps {
  gymId: string;
  initialData: {
    checkin_drops: number;
    lat: number | null;
    lng: number | null;
    gps_radius_m: number;
    address: string | null;
    city: string | null;
  };
}

const RADIUS_PRESETS = [
  { label: '100m', value: 100 },
  { label: '200m', value: 200 },
  { label: '500m', value: 500 },
];

export function CheckinSettingsModule({ gymId, initialData }: CheckinSettingsModuleProps) {
  const [checkinDrops, setCheckinDrops] = useState(initialData.checkin_drops);
  const [lat, setLat] = useState<number | null>(initialData.lat);
  const [lng, setLng] = useState<number | null>(initialData.lng);
  const [gpsRadius, setGpsRadius] = useState(initialData.gps_radius_m);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);

  const hasCoords = lat !== null && lng !== null;

  const handleSave = async () => {
    setSaving(true);
    const result = await updateGymCheckinSettings(gymId, {
      checkin_drops: checkinDrops,
      lat,
      lng,
      gps_radius_m: gpsRadius,
    });
    setSaving(false);
    if (result.success) {
      toast.success('Check-in settings saved');
    } else {
      toast.error(result.error || 'Failed to save');
    }
  };

  const handleGeocode = async () => {
    if (!initialData.address || !initialData.city) {
      toast.error('Gym address and city are required for geocoding');
      return;
    }
    setGeocoding(true);
    try {
      const query = encodeURIComponent(`${initialData.address}, ${initialData.city}, Serbia`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        { headers: { 'User-Agent': 'SweatDrop/1.0' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setLat(newLat);
        setLng(newLng);
        toast.success(`Coordinates: ${newLat.toFixed(4)}, ${newLng.toFixed(4)}`);
      } else {
        toast.error('Address not found. Enter coordinates manually.');
      }
    } catch {
      toast.error('Geocoding error');
    } finally {
      setGeocoding(false);
    }
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`sweatdrop://checkin/${gymId}`)}`;

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#1A1A1A]">
        {/* Left: QR + Drops */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Droplet className="w-4 h-4 text-[#00E5FF]" />
            <h3 className="text-sm font-semibold text-white">Reception Check-in</h3>
          </div>

          <div className="flex items-start gap-4">
            {checkinDrops > 0 && (
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="QR" className="w-24 h-24 rounded-lg border border-[#1A1A1A]" />
              </div>
            )}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Drops per check-in</label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={checkinDrops}
                  onChange={(e) => setCheckinDrops(Math.max(0, Math.min(500, parseInt(e.target.value) || 0)))}
                  className="w-24 px-3 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-sm focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
              {checkinDrops > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(`/print-qr?gymId=${gymId}&gymName=${encodeURIComponent(initialData.city || 'Gym')}&type=checkin`, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    <Printer className="w-3 h-3" />
                    Print QR
                  </button>
                  <span className="text-[10px] text-zinc-600">
                    Members scan for +{checkinDrops} drops/day
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: GPS */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Navigation className="w-4 h-4 text-[#00E5FF]" />
            <h3 className="text-sm font-semibold text-white">GPS Validation</h3>
            {hasCoords ? (
              <span className="ml-auto text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
              </span>
            ) : (
              <span className="ml-auto text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Not set
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleGeocode}
                disabled={geocoding || !initialData.address}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <MapPin className="w-3 h-3" />
                {geocoding ? 'Looking up…' : 'From address'}
              </button>
              <button
                onClick={() => setShowManualCoords(!showManualCoords)}
                className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showManualCoords ? 'rotate-180' : ''}`} />
                Manual
              </button>
            </div>

            {showManualCoords && (
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0000001"
                  placeholder="Lat"
                  value={lat ?? ''}
                  onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none"
                />
                <input
                  type="number"
                  step="0.0000001"
                  placeholder="Lng"
                  value={lng ?? ''}
                  onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none"
                />
              </div>
            )}

            {hasCoords && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Radius</label>
                <div className="flex items-center gap-2">
                  {RADIUS_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setGpsRadius(p.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        gpsRadius === p.value
                          ? 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30'
                          : 'bg-[#1A1A1A] text-zinc-500 border-[#333] hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={gpsRadius}
                    onChange={(e) => setGpsRadius(Math.max(50, Math.min(1000, parseInt(e.target.value) || 200)))}
                    className="w-16 px-2 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-white text-xs focus:border-[#00E5FF] focus:outline-none text-center"
                  />
                  <span className="text-[10px] text-zinc-600">m</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="border-t border-[#1A1A1A] px-5 py-3 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-[#00E5FF] text-black text-sm font-semibold rounded-lg hover:bg-[#00B8CC] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
