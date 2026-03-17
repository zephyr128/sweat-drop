'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MapPin, Printer, Navigation, ChevronDown } from 'lucide-react';
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
  { label: '100m (strict)', value: 100 },
  { label: '200m (default)', value: 200 },
  { label: '500m (building/mall)', value: 500 },
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
        toast.success(`Coordinates set: ${newLat.toFixed(4)}, ${newLng.toFixed(4)}`);
      } else {
        toast.error('Address not found. Try entering coordinates manually.');
      }
    } catch {
      toast.error('Geocoding error');
    } finally {
      setGeocoding(false);
    }
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`sweatdrop://checkin/${gymId}`)}`;

  return (
    <div className="space-y-6">
      {/* Drops per check-in */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#00E5FF]" />
          Reception Check-in
        </h3>

        <div>
          <label className="block text-sm font-medium text-[#808080] mb-2">
            Drops per check-in
          </label>
          <input
            type="number"
            min={0}
            max={500}
            value={checkinDrops}
            onChange={(e) => setCheckinDrops(Math.max(0, Math.min(500, parseInt(e.target.value) || 0)))}
            className="w-32 px-4 py-3 bg-[#1A1A1A] border border-[#333] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none"
          />
          <p className="mt-1 text-xs text-[#555]">
            Set to 0 to disable check-in
          </p>
        </div>

        {checkinDrops > 0 && (
          <div className="flex items-start gap-6 pt-2">
            <div className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="Check-in QR code"
                className="w-36 h-36 rounded-lg border border-[#333]"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-[#808080]">
                Print this QR code and place it at the reception desk.
                Members scan it to earn <span className="text-white font-medium">+{checkinDrops} drops</span> daily.
              </p>
              <button
                onClick={() => window.open(`/print-qr?gymId=${gymId}&gymName=${encodeURIComponent(initialData.city || 'Gym')}&type=checkin`, '_blank')}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#333] rounded-lg text-sm text-[#808080] hover:text-white transition-all"
              >
                <Printer className="w-4 h-4" />
                Print Reception QR
              </button>
            </div>
          </div>
        )}
      </div>

      {/* GPS Coordinates */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Navigation className="w-5 h-5 text-[#00E5FF]" />
          GPS Location Validation
        </h3>

        {hasCoords ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <span>✅ GPS coordinates set · {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-yellow-400">
            <span>⚠️ GPS coordinates not set — check-in works without location validation</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleGeocode}
            disabled={geocoding || !initialData.address}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-sm text-[#808080] hover:text-white transition-all disabled:opacity-50"
          >
            <MapPin className="w-4 h-4" />
            {geocoding ? 'Looking up...' : 'Set coordinates from address'}
          </button>
          {!initialData.address && (
            <span className="text-xs text-[#555]">Enter gym address first</span>
          )}
        </div>

        {/* GPS Radius */}
        {hasCoords && (
          <div className="space-y-2 pt-2">
            <label className="block text-sm font-medium text-[#808080]">
              Allowed check-in radius
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={50}
                max={1000}
                value={gpsRadius}
                onChange={(e) => setGpsRadius(Math.max(50, Math.min(1000, parseInt(e.target.value) || 200)))}
                className="w-28 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none text-sm"
              />
              <span className="text-sm text-[#555]">meters</span>
            </div>
            <div className="flex gap-2 mt-1">
              {RADIUS_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setGpsRadius(p.value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    gpsRadius === p.value
                      ? 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30'
                      : 'bg-[#1A1A1A] text-[#808080] border-[#333] hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#555]">
              Increase if the gym has poor GPS signal (basement, shopping mall)
            </p>
          </div>
        )}

        {/* Manual coordinate override */}
        <div className="pt-2">
          <button
            onClick={() => setShowManualCoords(!showManualCoords)}
            className="flex items-center gap-1 text-sm text-[#555] hover:text-[#808080] transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showManualCoords ? 'rotate-180' : ''}`} />
            Enter coordinates manually
          </button>
          {showManualCoords && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-3">
                <input
                  type="number"
                  step="0.0000001"
                  placeholder="Latitude"
                  value={lat ?? ''}
                  onChange={(e) => setLat(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-48 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none text-sm"
                />
                <input
                  type="number"
                  step="0.0000001"
                  placeholder="Longitude"
                  value={lng ?? ''}
                  onChange={(e) => setLng(e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-48 px-4 py-2.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-white focus:border-[#00E5FF] focus:outline-none text-sm"
                />
              </div>
              <p className="text-xs text-[#555]">
                You can copy coordinates from Google Maps (right-click → &quot;What&apos;s here?&quot;)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-3 bg-[#00E5FF] text-black font-medium rounded-lg hover:bg-[#00C8E0] transition-all disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Check-in Settings'}
      </button>
    </div>
  );
}
