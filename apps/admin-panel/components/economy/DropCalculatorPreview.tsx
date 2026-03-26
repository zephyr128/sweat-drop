'use client';

import { useMemo, useState, useTransition } from 'react';
import { Activity, Loader2, Zap } from 'lucide-react';
import { previewDropCalculation, type DropPreviewInput, type EconomyConfig } from '@/lib/actions/economy-actions';
import { InfoTip } from '@/components/ui/InfoTip';

interface DropCalculatorPreviewProps {
  gymId: string;
  config: EconomyConfig;
}

const MACHINES: Array<{ value: DropPreviewInput['machineType']; label: string }> = [
  { value: 'treadmill', label: 'Treadmill' },
  { value: 'bike', label: 'Bike' },
  { value: 'elliptical', label: 'Elliptical' },
  { value: 'stepper', label: 'Stepper' },
];

const MACHINE_TIPS: Record<string, string> = {
  bike: 'Uses average RPM from the bike sensor.',
  treadmill: 'Uses speed (km/h) and incline (%).',
  elliptical: 'Uses cadence / steps per minute.',
  stepper: 'Uses cadence / steps per minute.',
};

export function DropCalculatorPreview({ gymId, config }: DropCalculatorPreviewProps) {
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState<DropPreviewInput>({
    machineType: 'bike',
    durationMin: 35,
    avgRpm: 82,
    avgSpeedKmh: 9,
    inclinePct: 3,
    cadencePerMin: 102,
    simulateSpikes: false,
  });
  const [preview, setPreview] = useState<{
    expectedRawDrops: number;
    adjustedDrops: number;
    reducedByDiminishing: number;
    appliedCap: 'none' | 'session_cap';
    finalDrops: number;
    explanation: string[];
    source: 'rpc' | 'mock';
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!preview) return null;
    const adjusted = Number.isFinite(preview.adjustedDrops) ? preview.adjustedDrops : 0;
    const capped = Math.min(adjusted, config.maxDropsPerSession);
    const hitCap = capped < adjusted;
    const lines = preview.explanation.filter((l) => l !== 'Session hit per-session cap');
    return {
      ...preview,
      appliedCap: hitCap ? ('session_cap' as const) : ('none' as const),
      finalDrops: capped,
      explanation: hitCap ? Array.from(new Set([...lines, 'Session hit per-session cap'])) : lines,
    };
  }, [config.maxDropsPerSession, preview]);

  const set = <K extends keyof DropPreviewInput>(key: K, value: DropPreviewInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const run = () => {
    startTransition(async () => {
      const res = await previewDropCalculation(gymId, input);
      if (!res.success || !res.data) { setNote(res.error || 'Preview unavailable'); return; }
      setPreview(res.data);
      setNote(res.backendDependency || null);
    });
  };

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* ── Left: Inputs ── */}
        <div className="p-5 space-y-4 border-b lg:border-b-0 lg:border-r border-[#1A1A1A]">
          {/* Machine selector */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-xs text-zinc-400">Machine</label>
              <InfoTip text={MACHINE_TIPS[input.machineType]} />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MACHINES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => set('machineType', m.value)}
                  className={`px-2 py-2 text-xs rounded-lg border font-medium transition-colors ${
                    input.machineType === m.value
                      ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-300'
                      : 'bg-[#111] border-[#1F1F1F] text-zinc-400 hover:border-[#2A2A2A] hover:text-zinc-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <Field label="Duration" unit="min" tooltip="How long the workout lasts.">
            <input type="number" min={1} max={240} value={input.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} className="field-input" />
          </Field>

          {/* Machine-specific inputs */}
          {input.machineType === 'bike' && (
            <Field label="Avg RPM" tooltip="Average pedal revolutions per minute from the bike sensor.">
              <input type="number" min={0} max={180} value={input.avgRpm || 0} onChange={(e) => set('avgRpm', Number(e.target.value))} className="field-input" />
            </Field>
          )}

          {input.machineType === 'treadmill' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Speed" unit="km/h" tooltip="Average running/walking speed.">
                <input type="number" min={0} max={25} step={0.1} value={input.avgSpeedKmh || 0} onChange={(e) => set('avgSpeedKmh', Number(e.target.value))} className="field-input" />
              </Field>
              <Field label="Incline" unit="%" tooltip="Average treadmill incline percentage.">
                <input type="number" min={0} max={25} step={0.1} value={input.inclinePct || 0} onChange={(e) => set('inclinePct', Number(e.target.value))} className="field-input" />
              </Field>
            </div>
          )}

          {(input.machineType === 'elliptical' || input.machineType === 'stepper') && (
            <Field label="Cadence" unit="steps/min" tooltip="Steps or strides per minute from the machine.">
              <input type="number" min={0} max={220} value={input.cadencePerMin || 0} onChange={(e) => set('cadencePerMin', Number(e.target.value))} className="field-input" />
            </Field>
          )}

          {/* Simulate spikes */}
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer group">
            <input type="checkbox" checked={Boolean(input.simulateSpikes)} onChange={(e) => set('simulateSpikes', e.target.checked)} className="accent-cyan-400 w-4 h-4" />
            <span className="group-hover:text-zinc-300 transition-colors">Simulate spike detection</span>
            <span className="ml-auto"><InfoTip text="Simulates what happens when sudden intensity spikes are detected (anti-abuse)." /></span>
          </label>

          {/* Run button */}
          <button onClick={run} disabled={isPending} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-300 font-semibold text-sm hover:bg-cyan-400/20 disabled:opacity-50 transition-colors">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Calculate Drops
          </button>
        </div>

        {/* ── Right: Results ── */}
        <div className="p-5 flex flex-col">
          {result ? (
            <>
              {/* Final drops — hero number */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-white tabular-nums">{result.finalDrops}</p>
                  <p className="text-xs text-zinc-500">drops earned</p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-2.5 flex-1">
                <ResultRow label="Raw drops" value={result.expectedRawDrops} tip="Base drops before any multipliers or caps." />
                <ResultRow label="After multipliers" value={result.adjustedDrops} tip="Drops after intensity multipliers are applied." />
                <ResultRow label="Diminishing returns" value={result.reducedByDiminishing > 0 ? `-${result.reducedByDiminishing}` : '0'} tip="Drops removed due to diminishing returns from extended sessions." />
                <ResultRow
                  label="Session cap"
                  value={result.appliedCap === 'session_cap' ? `Applied (${config.maxDropsPerSession})` : 'Not hit'}
                  tip={`Your current per-session limit is ${config.maxDropsPerSession} drops.`}
                  highlight={result.appliedCap === 'session_cap'}
                />
              </div>

              {/* Explanation */}
              {result.explanation.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#1A1A1A]">
                  <ul className="space-y-1">
                    {result.explanation.map((line) => (
                      <li key={line} className="text-xs text-zinc-500">• {line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.source === 'mock' && (
                <p className="text-[10px] text-zinc-600 mt-2">Estimated preview — results may vary slightly in production.</p>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-[#111] border border-[#1F1F1F] flex items-center justify-center mb-3">
                <Activity className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-400">No simulation yet</p>
              <p className="text-xs text-zinc-600 mt-1">Choose a machine and hit Calculate to see results.</p>
            </div>
          )}

          {note && (
            <div className="mt-3 text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-700/30 rounded-lg px-3 py-2">
              {note}
            </div>
          )}
        </div>
      </div>

      {/* Shared input styles via global class — keeps JSX clean */}
      <style>{`.field-input { width: 100%; padding: 0.5rem 0.75rem; background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.5rem; color: white; font-size: 0.875rem; }`}</style>
    </div>
  );
}

/* ─── Subcomponents ─── */

function Field({ label, unit, tooltip, children }: { label: string; unit?: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs text-zinc-400">
          {label}{unit && <span className="text-zinc-600 ml-1">({unit})</span>}
        </label>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      {children}
    </div>
  );
}

function ResultRow({ label, value, tip, highlight }: { label: string; value: string | number; tip?: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-zinc-500">{label}</span>
        {tip && <InfoTip text={tip} />}
      </div>
      <span className={`text-sm tabular-nums ${highlight ? 'text-amber-300 font-medium' : 'text-white'}`}>{value}</span>
    </div>
  );
}
