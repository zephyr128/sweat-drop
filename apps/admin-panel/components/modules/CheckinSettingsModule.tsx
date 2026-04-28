'use client';

import { useState } from 'react';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';
import Link from 'next/link';
import { toast } from 'sonner';
import { MapPin, Printer, Navigation, ChevronDown, Droplet, Info, AlertTriangle } from 'lucide-react';
import { updateGymCheckinSettings, type CheckinVerificationMode } from '@/lib/actions/gym-actions';
import { checkinQrUrl } from '@/lib/qr-urls';

interface CheckinSettingsModuleProps {
  gymId: string;
  /** Human-readable gym name (e.g. "Vortex") — used on the printed check-in QR. */
  gymName: string;
  initialData: {
    checkin_drops: number;
    lat: number | null;
    lng: number | null;
    gps_radius_m: number;
    address: string | null;
    city: string | null;
    checkin_verification_mode: CheckinVerificationMode;
    /** Tokenomics published cap (same field Economy calls "Check-in bonus / day") */
    economyMaxCheckinDropsPerDay: number | null;
    /** Raw gyms.checkin_drops; used to detect drift vs tokenomics */
    gymRowCheckinDrops: number | null;
  };
}

const RADIUS_PRESETS = [
  { label: '100m', value: 100 },
  { label: '200m', value: 200 },
  { label: '500m', value: 500 },
];

export function CheckinSettingsModule({ gymId, gymName, initialData }: CheckinSettingsModuleProps) {
  const [checkinDrops, setCheckinDrops] = useState(initialData.checkin_drops);
  const [verificationMode, setVerificationMode] = useState<CheckinVerificationMode>(
    initialData.checkin_verification_mode === 'strict' ? 'strict' : 'lenient',
  );
  const [lat, setLat] = useState<number | null>(initialData.lat);
  const [lng, setLng] = useState<number | null>(initialData.lng);
  const [gpsRadius, setGpsRadius] = useState(initialData.gps_radius_m);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [showManualCoords, setShowManualCoords] = useState(false);

  const hasCoords = lat !== null && lng !== null;

  const economyVal = initialData.economyMaxCheckinDropsPerDay;
  const gymRowVal = initialData.gymRowCheckinDrops;
  const tokenomicsDrift =
    economyVal != null &&
    gymRowVal != null &&
    Math.round(Number(economyVal)) !== Math.round(Number(gymRowVal));

  const handleSave = async () => {
    setSaving(true);
    const result = await updateGymCheckinSettings(gymId, {
      checkin_drops: checkinDrops,
      lat,
      lng,
      gps_radius_m: gpsRadius,
      checkin_verification_mode: verificationMode,
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

  const checkinQrValue = checkinQrUrl(gymId);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] p-4">
        <Info className="w-4 h-4 text-[#00E5FF] shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-400 leading-relaxed space-y-2">
          <p>
            <span className="text-zinc-300 font-medium">Linked with Economy:</span>{' '}
            Drops per check-in is the same value as{' '}
            <Link href={`/dashboard/gym/${gymId}/economy`} className="text-[#00E5FF] hover:underline">
              Economy → Earning limits → Check-in bonus / day
            </Link>
            . Saving here updates tokenomics; saving Economy updates this screen.
          </p>
          {economyVal != null && (
            <p className="text-[11px] text-zinc-500">
              Published tokenomics check-in cap:{' '}
              <span className="text-zinc-400 tabular-nums">{Math.round(Number(economyVal))}</span> drops
              {tokenomicsDrift && gymRowVal != null ? (
                <span className="text-amber-400/90"> — gym row shows {Math.round(Number(gymRowVal))}; save to align.</span>
              ) : null}
            </p>
          )}
        </div>
      </div>

      {tokenomicsDrift && (
        <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Check-in drops on the gym record and in Economy are out of sync. Click Save below (or publish Economy) to
            align them.
          </span>
        </div>
      )}

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
              <div className="shrink-0 bg-white p-1 rounded-lg border border-[#1A1A1A]">
                <BrandedQRCode value={checkinQrValue} size={88} />
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
                <p className="text-[10px] text-zinc-600 mt-1.5 leading-relaxed">
                  Maximum drops awarded for one successful check-in that counts for the day. Actual awards still follow
                  GPS mode below and the member app (e.g. duplicate same-day check-ins are rejected).
                </p>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-2">GPS verification mode</label>
                <div className="flex rounded-lg border border-[#333] bg-[#111] p-0.5 w-fit">
                  {(['lenient', 'strict'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setVerificationMode(m)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        verificationMode === m
                          ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30'
                          : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                      }`}
                    >
                      {m === 'lenient' ? 'Lenient' : 'Strict'}
                    </button>
                  ))}
                </div>
                <div className="mt-2 space-y-1.5 text-[10px] text-zinc-500 leading-relaxed">
                  <p>
                    <span className="text-zinc-400">Lenient:</span> Members can check in without a GPS fix inside the
                    radius. They still receive the full drops configured above; the row is marked GPS unverified so you
                    can audit reception vs remote scans.
                  </p>
                  <p>
                    <span className="text-zinc-400">Strict:</span> Check-in requires location inside the radius below.
                    If GPS is missing, wrong, or outside the radius, the app rejects the check-in — nothing is written to
                    this list and no drops are minted.
                  </p>
                </div>
              </div>

              {checkinDrops > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        type: 'checkin',
                        gymId,
                        gymName: gymName || 'Gym',
                      });
                      window.open(`/print-qr?${params.toString()}`, '_blank');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#333] rounded-lg text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    <Printer className="w-3 h-3" />
                    Print QR
                  </button>
                  <span className="text-[10px] text-zinc-600">
                    Up to +{checkinDrops} drops when a check-in succeeds (once per member per day)
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

            <p className="text-[10px] text-zinc-600 leading-relaxed">
              Used for distance shown on check-ins and for strict mode. Lenient mode still records distance when the
              member shares location.
            </p>

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
    </div>
  );
}
