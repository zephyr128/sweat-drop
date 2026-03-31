'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Clock, Save } from 'lucide-react';
import { updateGymWorkingHours, type GymWorkingHours, type DayHours } from '@/lib/actions/gym-actions';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

type DayKey = (typeof DAYS)[number]['key'];

interface DayState {
  closed: boolean;
  open: string;
  close: string;
}

function parseInitial(wh: GymWorkingHours | null): Record<DayKey, DayState> {
  const result = {} as Record<DayKey, DayState>;
  for (const d of DAYS) {
    const val = wh?.[d.key];
    if (val && val.open && val.close) {
      result[d.key] = { closed: false, open: val.open, close: val.close };
    } else {
      result[d.key] = { closed: true, open: '06:00', close: '22:00' };
    }
  }
  return result;
}

function toPayload(state: Record<DayKey, DayState>): GymWorkingHours {
  const payload: GymWorkingHours = {};
  for (const d of DAYS) {
    const s = state[d.key];
    if (s.closed) {
      payload[d.key] = null;
    } else {
      payload[d.key] = { open: s.open, close: s.close };
    }
  }
  return payload;
}

interface WorkingHoursFormProps {
  gymId: string;
  initialData: GymWorkingHours | null;
}

export function WorkingHoursForm({ gymId, initialData }: WorkingHoursFormProps) {
  const [days, setDays] = useState(() => parseInitial(initialData));
  const [saving, setSaving] = useState(false);

  const updateDay = useCallback((key: DayKey, patch: Partial<DayState>) => {
    setDays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const handleSave = async () => {
    for (const d of DAYS) {
      const s = days[d.key];
      if (!s.closed && s.open >= s.close) {
        toast.error(`${d.label}: open time must be before close time`);
        return;
      }
    }

    setSaving(true);
    const result = await updateGymWorkingHours(gymId, toPayload(days));
    setSaving(false);

    if (result.success) {
      toast.success('Working hours saved');
    } else {
      toast.error(result.error || 'Failed to save');
    }
  };

  const allClosed = DAYS.every((d) => days[d.key].closed);
  const hasHours = !allClosed;

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#00E5FF]" />
            Working Hours
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Set opening times visible to members in the mobile app.
          </p>
        </div>
        {hasHours && (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
            {DAYS.filter((d) => !days[d.key].closed).length} days open
          </span>
        )}
      </div>

      <div className="px-5 pb-5 space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[120px_1fr_1fr_80px] gap-3 text-[10px] text-zinc-500 uppercase tracking-wider font-medium pb-1 border-b border-[#1A1A1A]">
          <span>Day</span>
          <span>Opens</span>
          <span>Closes</span>
          <span className="text-right">Closed</span>
        </div>

        {DAYS.map((d) => {
          const s = days[d.key];
          return (
            <div
              key={d.key}
              className={`grid grid-cols-[120px_1fr_1fr_80px] gap-3 items-center py-2 rounded-lg transition-colors ${
                s.closed ? 'opacity-40' : ''
              }`}
            >
              <span className="text-sm text-zinc-300 font-medium">{d.label}</span>

              <input
                type="time"
                value={s.open}
                disabled={s.closed}
                onChange={(e) => updateDay(d.key, { open: e.target.value })}
                className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white disabled:opacity-30 disabled:cursor-not-allowed [color-scheme:dark]"
              />

              <input
                type="time"
                value={s.close}
                disabled={s.closed}
                onChange={(e) => updateDay(d.key, { close: e.target.value })}
                className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-white disabled:opacity-30 disabled:cursor-not-allowed [color-scheme:dark]"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => updateDay(d.key, { closed: !s.closed })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    s.closed ? 'bg-zinc-700' : 'bg-[#00E5FF]'
                  }`}
                  aria-label={`${d.label} ${s.closed ? 'closed' : 'open'}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      s.closed ? 'translate-x-1' : 'translate-x-[18px]'
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}

        <div className="pt-3 border-t border-[#1A1A1A] flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00E5FF] text-black text-sm font-bold rounded-lg hover:bg-[#00B8CC] disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Hours'}
          </button>
        </div>
      </div>
    </div>
  );
}
