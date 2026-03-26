'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Save, Shield, ShieldAlert } from 'lucide-react';
import {
  updateEconomyConfig,
  type BandEnforcementMode,
  type EconomyConfig,
  type EconomyRewardGuardrail,
  type EconomySummary,
} from '@/lib/actions/economy-actions';
import { DropCalculatorPreview } from './DropCalculatorPreview';
import { InfoTip } from '@/components/ui/InfoTip';

interface EconomySettingsPanelProps {
  gymId: string;
  config: EconomyConfig;
  summary: EconomySummary;
  defaults: EconomyConfig;
  draftExists: boolean;
  guardrails: EconomyRewardGuardrail[];
}

const LIMITS = {
  maxDropsPerSession: { min: 1, max: 500, rec: '80–160' },
  maxDropsPerDay: { min: 20, max: 3000, rec: '200–500' },
  maxDropsPerWeek: { min: 100, max: 10000, rec: '1200–2500' },
  maxRewardedSessionsPerDay: { min: 1, max: 12, rec: '3–6' },
  maxCheckinDropsPerDay: { min: 0, max: 20, rec: '0–5' },
};

const TOOLTIPS: Record<string, string> = {
  maxDropsPerSession: 'Maximum drops a member can earn in a single workout. Prevents abuse from extremely long sessions.',
  maxDropsPerDay: 'Total drops a member can earn across all workouts in one day.',
  maxDropsPerWeek: 'Total drops a member can earn across the entire week. Limits excessive farming.',
  maxRewardedSessionsPerDay: 'How many workouts per day actually earn drops. Extra sessions beyond this are free but earn nothing.',
  maxCheckinDropsPerDay: 'Bonus drops a member gets just for checking in at the gym (scanning QR at reception). Set to 0 to disable.',
  dropsEarned: 'Total drops earned by all members in the last 30 days.',
  dropsSpent: 'Total drops spent on rewards in the last 30 days.',
};

const COMPLIANCE_REASON_LABELS: Record<string, { label: string; tooltip: string }> = {
  no_band_defined:                      { label: 'No band',       tooltip: 'No pricing band configured for this reward type.' },
  in_band:                              { label: 'OK',            tooltip: 'Price is within the recommended band.' },
  in_band_discount_normalized:          { label: 'OK (discount)', tooltip: 'Discount-normalized base price is within the recommended band.' },
  below_band_min:                       { label: 'Below band',    tooltip: 'Price is below the minimum of the recommended band.' },
  below_band_min_discount_normalized:   { label: 'Below band',    tooltip: 'Discount-normalized base price is below the minimum of the recommended band.' },
  above_band_max:                       { label: 'Above band',    tooltip: 'Price exceeds the maximum of the recommended band.' },
  above_band_max_discount_normalized:   { label: 'Above band',    tooltip: 'Discount-normalized base price exceeds the maximum of the recommended band.' },
};

function complianceLabel(reason: string): { label: string; tooltip: string } {
  return COMPLIANCE_REASON_LABELS[reason] || { label: reason, tooltip: reason };
}

const PRICE_BAND_DEFAULTS: Record<string, { min: number; max: number; label: string; tip: string }> = {
  coffee: { min: 120, max: 220, label: 'Coffee / Drink', tip: 'Small beverage reward at the bar or vending machine.' },
  protein_snack: { min: 180, max: 320, label: 'Protein Snack / Bar', tip: 'Protein bar, shake, or healthy snack.' },
  day_pass: { min: 500, max: 900, label: 'Day / Guest Pass', tip: 'One-day gym pass a member can gift to a friend.' },
  pt_intro: { min: 1200, max: 2200, label: 'PT Intro Session', tip: 'Introductory session with a personal trainer.' },
  merch_small: { min: 700, max: 1500, label: 'Merch Small', tip: 'Small gym merchandise: towel, shaker, wristband.' },
  merch_premium: { min: 1800, max: 4000, label: 'Merch Premium', tip: 'Premium merchandise: hoodie, bag, premium bottle.' },
  membership: { min: 3000, max: 10000, label: 'Membership', tip: 'Monthly or multi-visit gym membership discount. High value reward requiring many workouts to earn.' },
  physical: { min: 1, max: 100000, label: 'Physical (other)', tip: 'Catch-all for any physical reward not in other categories.' },
};

function validateForm(config: EconomyConfig) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(config.maxDropsPerSession) || config.maxDropsPerSession <= 0)
    errors.push('Max drops/session must be a positive number.');
  if (!Number.isFinite(config.maxDropsPerDay) || config.maxDropsPerDay <= 0)
    errors.push('Max drops/day must be a positive number.');
  if (!Number.isFinite(config.maxDropsPerWeek) || config.maxDropsPerWeek <= 0)
    errors.push('Max drops/week must be a positive number.');
  if (!Number.isFinite(config.maxRewardedSessionsPerDay) || config.maxRewardedSessionsPerDay <= 0)
    errors.push('Max rewarded sessions/day must be a positive number.');
  if (config.maxDropsPerSession > config.maxDropsPerDay)
    errors.push('Max drops/session cannot exceed max drops/day.');
  if (config.maxDropsPerDay > config.maxDropsPerWeek)
    errors.push('Max drops/day cannot exceed max drops/week.');
  if (config.maxDropsPerSession < 80 || config.maxDropsPerSession > 160)
    warnings.push('Max drops/session is outside recommended range (80–160).');
  if (config.maxDropsPerDay < 200 || config.maxDropsPerDay > 500)
    warnings.push('Max drops/day is outside recommended range (200–500).');
  for (const [cat, band] of Object.entries(config.priceBandJson || {})) {
    const lo = Number(band.min);
    const hi = Number(band.max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      errors.push(`Price band "${cat}": min and max must be numbers.`);
    } else if (lo < 0 || hi < 0) {
      errors.push(`Price band "${cat}": values cannot be negative.`);
    } else if (lo > hi) {
      errors.push(`Price band "${cat}": min must be ≤ max.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function fmtRsd(drops: number, rate: number): string {
  if (rate <= 0) return '—';
  const rsd = drops / rate;
  return rsd < 1 ? `${rsd.toFixed(2)} RSD` : `${Math.round(rsd).toLocaleString()} RSD`;
}

export function EconomySettingsPanel({ gymId, config, summary, guardrails }: EconomySettingsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<EconomyConfig>(config);
  const dropsPerRsd = form.dropsPerRsd;
  const setDropsPerRsd = (v: number) => setForm((prev) => ({ ...prev, dropsPerRsd: v }));

  const validation = useMemo(() => validateForm(form), [form]);
  const outOfBand = useMemo(() => guardrails.filter((g) => !g.inBand), [guardrails]);

  const setNum = (field: keyof EconomyConfig, v: number) =>
    setForm((prev) => ({ ...prev, [field]: Number.isFinite(v) ? v : 0 }));

  const setBand = (key: string, side: 'min' | 'max', v: number) =>
    setForm((prev) => ({
      ...prev,
      priceBandJson: {
        ...prev.priceBandJson,
        [key]: {
          min: side === 'min' ? Math.max(0, v || 0) : Number(prev.priceBandJson[key]?.min ?? PRICE_BAND_DEFAULTS[key]?.min ?? 0),
          max: side === 'max' ? Math.max(0, v || 0) : Number(prev.priceBandJson[key]?.max ?? PRICE_BAND_DEFAULTS[key]?.max ?? 0),
        },
      },
    }));

  const handleSave = () => {
    const s = Math.max(1, Math.round(form.maxDropsPerSession));
    const d = Math.max(s, Math.round(form.maxDropsPerDay));
    const w = Math.max(d, Math.round(form.maxDropsPerWeek || d));
    const r = Math.max(1, Math.round(form.maxRewardedSessionsPerDay || 1));
    const c = Math.max(0, Math.round(form.maxCheckinDropsPerDay));
    const rate = Number(form.dropsPerRsd);
    const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 2.0;
    const payload = {
      maxDropsPerSession: s, maxDropsPerDay: d, maxDropsPerWeek: w, maxRewardedSessionsPerDay: r, maxCheckinDropsPerDay: c,
      priceBandJson: form.priceBandJson,
      dropsPerRsd: safeRate,
      currencyCode: form.currencyCode || 'RSD',
      calibrationMeta: form.calibrationMeta,
      bandEnforcementMode: form.bandEnforcementMode,
    };
    const check = validateForm({ ...form, ...payload });
    if (!check.valid) { toast.error(check.errors[0]); return; }
    setForm((prev) => ({ ...prev, ...payload }));
    startTransition(async () => {
      const res = await updateEconomyConfig(gymId, payload, 'publish');
      if (!res.success) { toast.error(res.error || 'Failed to save'); return; }
      toast.success('Economy settings saved');
    });
  };

  return (
    <div className="space-y-8">
      {/* ── Overview ── */}
      <section>
        <SectionTitle title="Overview" subtitle="How your gym economy is performing right now." />
        <div className="mt-4 space-y-4">
          <HealthCard risk={summary.risk} riskLabel={summary.riskLabel} summary={summary} config={form} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Drops Earned (30d)" tooltip={TOOLTIPS.dropsEarned} value={summary.minted30d.toLocaleString()} subvalue={fmtRsd(summary.minted30d, dropsPerRsd)} />
            <StatCard label="Drops Spent (30d)" tooltip={TOOLTIPS.dropsSpent} value={summary.burned30d.toLocaleString()} subvalue={fmtRsd(summary.burned30d, dropsPerRsd)} />
          </div>
        </div>
      </section>

      {/* ── Earning Limits ── */}
      <section>
        <SectionTitle title="Earning Limits" subtitle="Control how many drops members can earn per workout, per day and per week." />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-4">
          <SliderField label="Per session" tooltip={TOOLTIPS.maxDropsPerSession} value={form.maxDropsPerSession} onChange={(v) => setNum('maxDropsPerSession', v)} min={LIMITS.maxDropsPerSession.min} max={LIMITS.maxDropsPerSession.max} rec={LIMITS.maxDropsPerSession.rec} rsdHint={fmtRsd(form.maxDropsPerSession, dropsPerRsd)} />
          <SliderField label="Per day" tooltip={TOOLTIPS.maxDropsPerDay} value={form.maxDropsPerDay} onChange={(v) => setNum('maxDropsPerDay', v)} min={LIMITS.maxDropsPerDay.min} max={LIMITS.maxDropsPerDay.max} rec={LIMITS.maxDropsPerDay.rec} rsdHint={fmtRsd(form.maxDropsPerDay, dropsPerRsd)} />
          <SliderField label="Per week" tooltip={TOOLTIPS.maxDropsPerWeek} value={form.maxDropsPerWeek} onChange={(v) => setNum('maxDropsPerWeek', v)} min={LIMITS.maxDropsPerWeek.min} max={LIMITS.maxDropsPerWeek.max} rec={LIMITS.maxDropsPerWeek.rec} rsdHint={fmtRsd(form.maxDropsPerWeek, dropsPerRsd)} />
          <SliderField label="Rewarded sessions / day" tooltip={TOOLTIPS.maxRewardedSessionsPerDay} value={form.maxRewardedSessionsPerDay} onChange={(v) => setNum('maxRewardedSessionsPerDay', v)} min={LIMITS.maxRewardedSessionsPerDay.min} max={LIMITS.maxRewardedSessionsPerDay.max} rec={LIMITS.maxRewardedSessionsPerDay.rec} />
          <SliderField label="Check-in bonus / day" tooltip={TOOLTIPS.maxCheckinDropsPerDay} value={form.maxCheckinDropsPerDay} onChange={(v) => setNum('maxCheckinDropsPerDay', v)} min={LIMITS.maxCheckinDropsPerDay.min} max={LIMITS.maxCheckinDropsPerDay.max} rec={LIMITS.maxCheckinDropsPerDay.rec} rsdHint={fmtRsd(form.maxCheckinDropsPerDay, dropsPerRsd)} />
        </div>
      </section>

      {/* ── Drop Calculator ── */}
      <section>
        <SectionTitle title="Drop Calculator" subtitle="Test how many drops a member would earn for a specific workout with your current limits." />
        <div className="mt-4">
          <DropCalculatorPreview gymId={gymId} config={form} />
        </div>
      </section>

      {/* ── Calibration Wizard ── */}
      <section>
        <SectionTitle title="Calibration Wizard" subtitle="Set your drops ↔ RSD rate by anchoring to a real-world price." />
        <CalibrationWizard
          dropsPerRsd={dropsPerRsd}
          avgDropsPerWorkout={summary.minted30d > 0 && summary.capHitRate7d >= 0
            ? Math.round(form.maxDropsPerSession * 2 / 3)
            : 100}
          priceBandJson={form.priceBandJson}
          onApply={(suggested) => {
            setDropsPerRsd(suggested.dropsPerRsd);
            if (suggested.bands) {
              setForm((prev) => ({
                ...prev,
                priceBandJson: { ...prev.priceBandJson, ...suggested.bands },
              }));
            }
            toast.success('Suggestions applied — review and save when ready');
          }}
        />
      </section>

      {/* ── Store Pricing ── */}
      <section>
        <SectionTitle title="Store Pricing Bands" subtitle="Set min/max drop price per reward category. Items outside these bands are flagged below." />
        <div className="mt-4 space-y-3">
          <div className="hidden md:grid grid-cols-[240px_1fr_1fr] gap-3 px-1">
            <span className="text-[11px] text-zinc-600 uppercase tracking-wide">Category</span>
            <span className="text-[11px] text-zinc-600 uppercase tracking-wide">Min (drops)</span>
            <span className="text-[11px] text-zinc-600 uppercase tracking-wide">Max (drops)</span>
          </div>
          {Object.entries(PRICE_BAND_DEFAULTS).map(([key, def]) => {
            const lo = Number(form.priceBandJson[key]?.min ?? def.min);
            const hi = Number(form.priceBandJson[key]?.max ?? def.max);
            const bad = lo > hi;
            return (
              <div key={key} className="grid grid-cols-1 md:grid-cols-[240px_1fr_1fr] gap-3 items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-zinc-200">{def.label}</span>
                  <InfoTip text={def.tip} />
                </div>
                <div>
                  <input type="number" min={0} value={lo} onChange={(e) => setBand(key, 'min', Number(e.target.value))} className={`w-full px-3 py-2 bg-[#1A1A1A] border rounded-lg text-white text-sm ${bad ? 'border-rose-500/60' : 'border-[#2A2A2A]'}`} placeholder="Min" />
                  <p className="text-[10px] text-zinc-600 mt-0.5 pl-1">≈ {fmtRsd(lo, dropsPerRsd)}</p>
                </div>
                <div>
                  <input type="number" min={0} value={hi} onChange={(e) => setBand(key, 'max', Number(e.target.value))} className={`w-full px-3 py-2 bg-[#1A1A1A] border rounded-lg text-white text-sm ${bad ? 'border-rose-500/60' : 'border-[#2A2A2A]'}`} placeholder="Max" />
                  <p className="text-[10px] text-zinc-600 mt-0.5 pl-1">≈ {fmtRsd(hi, dropsPerRsd)}</p>
                  {bad && <p className="text-[10px] text-rose-400 mt-0.5 pl-1">Min must be ≤ Max</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Reward Band Policy ── */}
      <section>
        <SectionTitle
          title="Reward Band Policy"
          subtitle="Choose whether out-of-band rewards show a warning or block member redemption."
        />
        <div className="mt-4 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <PolicyModeButton
              active={form.bandEnforcementMode !== 'enforce'}
              icon={<Shield className="w-4 h-4" />}
              label="Warn only"
              tag="Recommended"
              description="Members can still redeem out-of-band rewards. You see warnings in the compliance table."
              onClick={() => setForm((prev) => ({ ...prev, bandEnforcementMode: 'warn' as BandEnforcementMode }))}
            />
            <PolicyModeButton
              active={form.bandEnforcementMode === 'enforce'}
              icon={<ShieldAlert className="w-4 h-4" />}
              label="Enforce strict band"
              description="Out-of-band rewards are blocked from redemption until you fix their price or adjust the band."
              onClick={() => setForm((prev) => ({ ...prev, bandEnforcementMode: 'enforce' as BandEnforcementMode }))}
            />
          </div>
        </div>
      </section>

      {/* ── Compliance ── */}
      <section>
        <SectionTitle
          title="Store Compliance"
          subtitle={form.bandEnforcementMode === 'enforce'
            ? 'Out-of-band rewards are currently blocked from redemption.'
            : 'Active rewards checked against recommended pricing bands. Discounted rewards are compared using their base-equivalent price.'}
          badge={outOfBand.length > 0 ? `${outOfBand.length} out of band` : undefined}
          badgeColor={outOfBand.length > 0 ? 'amber' : 'emerald'}
        />
        <div className="mt-4 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="compliance-table">
              <thead className="bg-[#111]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Reward</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Final Drops</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">
                    <span className="flex items-center gap-1">Discount %</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">
                    <span className="flex items-center gap-1">
                      Normalized
                      <InfoTip text="The base-equivalent price used for band comparison. For discounted rewards this reverses the discount to show what the full price would be. Manual rewards show the actual price." />
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Band</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs text-zinc-400 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {guardrails.length === 0 ? (
                  <tr><td className="px-4 py-8 text-zinc-500" colSpan={8}>No active rewards found.</td></tr>
                ) : guardrails.map((g) => {
                  const isDiscount = g.priceCalcMode === 'discount_from_rsd';
                  const showNormalized = isDiscount && g.discountPercent != null && g.discountPercent > 0;
                  const isEnforce = form.bandEnforcementMode === 'enforce';
                  const statusBadge = g.inBand
                    ? { css: 'bg-emerald-500/15 text-emerald-300', text: complianceLabel(g.complianceReason).label }
                    : isEnforce
                      ? { css: 'bg-rose-500/15 text-rose-300', text: 'Blocked' }
                      : { css: 'bg-amber-500/15 text-amber-300', text: complianceLabel(g.complianceReason).label + ' (warning)' };

                  return (
                    <tr key={g.id} className="hover:bg-[#111]">
                      <td className="px-4 py-3 text-white">{g.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{g.rewardType}</td>
                      <td className="px-4 py-3">
                        <span className="text-cyan-300 tabular-nums">{g.priceDrops}</span>
                        <span className="text-[10px] text-zinc-600 ml-1.5">≈ {fmtRsd(g.priceDrops, dropsPerRsd)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {isDiscount && g.discountPercent != null
                          ? <span className="text-violet-300 text-xs tabular-nums">−{g.discountPercent}%</span>
                          : <span className="text-zinc-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`tabular-nums ${showNormalized ? 'text-white' : 'text-zinc-400'}`}>
                          {g.normalizedDrops}
                        </span>
                        {showNormalized && <span className="text-[10px] text-zinc-600 ml-1.5">≈ {fmtRsd(g.normalizedDrops, dropsPerRsd)}</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{g.minRecommended == null ? 'No band' : `${g.minRecommended}–${g.maxRecommended}`}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded ${statusBadge.css}`} data-testid="compliance-status">
                          {statusBadge.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-zinc-500" title={complianceLabel(g.complianceReason).tooltip}>
                          {g.complianceReason.includes('discount_normalized')
                            ? <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />discount-normalized</span>
                            : g.complianceReason === 'no_band_defined' ? 'no band' : 'direct'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Validation ── */}
      {validation.errors.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
          <p className="text-sm text-rose-300 font-medium">Fix before saving</p>
          <ul className="mt-2 space-y-1">{validation.errors.map((e) => <li key={e} className="text-xs text-rose-200">• {e}</li>)}</ul>
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-sm text-amber-300 font-medium">Recommendations</p>
          <ul className="mt-2 space-y-1">{validation.warnings.map((w) => <li key={w} className="text-xs text-amber-200">• {w}</li>)}</ul>
        </div>
      )}

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button disabled={isPending} onClick={handleSave} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#00E5FF] text-black font-semibold hover:bg-[#00cde3] disabled:opacity-50 transition-colors">
          <Save className="w-4 h-4" />
          Save Economy Settings
        </button>
      </div>
    </div>
  );
}

/* ─── Shared UI Primitives ─── */

function SectionTitle({ title, subtitle, badge, badgeColor }: { title: string; subtitle: string; badge?: string; badgeColor?: 'amber' | 'emerald' }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      {badge && (
        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium ${badgeColor === 'amber' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>{badge}</span>
      )}
    </div>
  );
}

function PolicyModeButton({ active, icon, label, tag, description, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; tag?: string; description: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`policy-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`flex-1 text-left rounded-xl border px-4 py-3.5 transition-colors ${active
        ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5'
        : 'border-[#2A2A2A] bg-[#111] hover:border-[#3A3A3A]'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={active ? 'text-[#00E5FF]' : 'text-zinc-500'}>{icon}</span>
        <span className={`text-sm font-medium ${active ? 'text-white' : 'text-zinc-400'}`}>{label}</span>
        {tag && <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 rounded">{tag}</span>}
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
    </button>
  );
}

function StatCard({ label, value, tooltip, subvalue }: { label: string; value: React.ReactNode; tooltip?: string; subvalue?: string }) {
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs text-zinc-400 uppercase tracking-wide">{label}</p>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {subvalue && <p className="text-xs text-zinc-600 mt-0.5">≈ {subvalue}</p>}
    </div>
  );
}


function SliderField({ label, tooltip, value, onChange, min, max, rec, rsdHint }: {
  label: string; tooltip: string; value: number; onChange: (v: number) => void; min: number; max: number; rec: string; rsdHint?: string;
}) {
  const safe = Number.isFinite(value) ? value : min;
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-zinc-300">{label}</span>
          <InfoTip text={tooltip} />
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-white tabular-nums">{safe}</span>
          {rsdHint && <span className="text-[10px] text-zinc-600 ml-1.5">≈ {rsdHint}</span>}
        </div>
      </div>
      <input type="range" aria-label={`${label} slider`} min={min} max={max} value={safe} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan-400" />
      <div className="flex items-center justify-between mt-1.5">
        <input type="number" aria-label={label} min={min} max={max} value={safe} onChange={(e) => onChange(Number(e.target.value))} className="w-20 px-2 py-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded text-white text-xs tabular-nums" />
        <span className="text-[11px] text-zinc-600">Recommended {rec}</span>
      </div>
    </div>
  );
}

function HealthCard({ risk, riskLabel, summary, config }: { risk: EconomySummary['risk']; riskLabel: string; summary: EconomySummary; config: EconomyConfig }) {
  const burnPct = Math.round(summary.burnMintRatio * 100);
  const diagnoses = diagnoseHealth(summary, config);

  const palette = risk === 'green'
    ? { bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', text: 'text-emerald-300', icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" /> }
    : risk === 'yellow'
      ? { bg: 'bg-amber-500/5', border: 'border-amber-500/20', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', text: 'text-amber-300', icon: <AlertTriangle className="w-5 h-5 text-amber-400" /> }
      : { bg: 'bg-rose-500/5', border: 'border-rose-500/20', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30', text: 'text-rose-300', icon: <ShieldAlert className="w-5 h-5 text-rose-400" /> };

  const isDeflationary = burnPct > 80;
  const isInflationary = burnPct < 20;
  const headline = risk === 'green'
    ? 'Your economy is healthy. Members earn and spend drops at a balanced rate.'
    : risk === 'yellow'
      ? isDeflationary
        ? 'Your economy needs attention. Members are spending drops faster than usual — monitor reward pricing.'
        : isInflationary
          ? 'Your economy needs attention. Drops are accumulating — consider adding more rewards to encourage spending.'
          : 'Your economy needs attention. Some metrics are outside the ideal range.'
      : isDeflationary
        ? 'Your economy needs action. Members are spending drops much faster than they earn — they may run out and lose motivation.'
        : isInflationary
          ? 'Your economy needs action. Drops are building up quickly — members aren\'t finding enough reasons to spend them.'
          : 'Your economy needs action. Check the issues below and adjust your settings.';

  return (
    <div className={`${palette.bg} border ${palette.border} rounded-xl p-5`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{palette.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h4 className="text-sm font-semibold text-white">Economy Health</h4>
            <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${palette.badge}`}>{riskLabel}</span>
            <span className="text-xs text-zinc-500">
              Spend/Earn: {burnPct}%
              {burnPct > 100 ? ' (deflationary)' : burnPct < 20 ? ' (inflationary)' : ''}
            </span>
          </div>
          <p className={`text-sm mt-1.5 ${risk === 'green' ? 'text-zinc-400' : palette.text}`}>{headline}</p>

          {diagnoses.length > 0 && (
            <div className="mt-3 space-y-2">
              {diagnoses.map((d) => (
                <div key={d.issue} className="flex items-start gap-2">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-current mt-1.5 opacity-60" />
                  <div>
                    <p className="text-sm text-zinc-300">{d.issue}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{d.action}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type PriceBandMap = Record<string, { min: number; max: number }>;
interface CalibrationResult {
  dropsPerRsd: number;
  bands?: PriceBandMap;
}

function CalibrationWizard({ dropsPerRsd, avgDropsPerWorkout, priceBandJson, onApply }: {
  dropsPerRsd: number;
  avgDropsPerWorkout: number;
  priceBandJson: PriceBandMap;
  onApply: (result: CalibrationResult) => void;
}) {
  const [coffeeRsd, setCoffeeRsd] = useState(200);
  const [avgDrops, setAvgDrops] = useState(avgDropsPerWorkout);
  const [workoutsForCoffee, setWorkoutsForCoffee] = useState(() => {
    if (dropsPerRsd > 0 && avgDropsPerWorkout > 0) {
      const w = Math.round((200 * dropsPerRsd) / avgDropsPerWorkout);
      return Math.max(1, Math.min(30, w));
    }
    return 5;
  });

  const suggestedRate = useMemo(() => {
    if (coffeeRsd <= 0 || workoutsForCoffee <= 0 || avgDrops <= 0) return null;
    const totalDrops = workoutsForCoffee * avgDrops;
    return Math.round((totalDrops / coffeeRsd) * 10000) / 10000;
  }, [coffeeRsd, workoutsForCoffee, avgDrops]);

  const suggestedBands = useMemo(() => {
    if (!suggestedRate || suggestedRate <= 0) return null;
    return {
      coffee: { min: Math.round(180 * suggestedRate), max: Math.round(220 * suggestedRate) },
      protein_snack: { min: Math.round(250 * suggestedRate), max: Math.round(350 * suggestedRate) },
      day_pass: { min: Math.round(800 * suggestedRate), max: Math.round(1200 * suggestedRate) },
    };
  }, [suggestedRate]);

  return (
    <div className="mt-4 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Coffee target price (RSD)</label>
          <input type="number" min={1} value={coffeeRsd} onChange={(e) => setCoffeeRsd(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white text-sm" />
          <p className="text-[10px] text-zinc-600 mt-0.5">Typical: 180–220 RSD</p>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Workouts to earn coffee</label>
          <input type="number" min={1} max={30} value={workoutsForCoffee} onChange={(e) => setWorkoutsForCoffee(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white text-sm" />
          <p className="text-[10px] text-zinc-600 mt-0.5">Typical: 4–6 workouts</p>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Avg drops per workout</label>
          <input type="number" min={1} value={avgDrops} onChange={(e) => setAvgDrops(Math.max(1, Number(e.target.value)))}
            className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white text-sm" />
          <p className="text-[10px] text-zinc-600 mt-0.5">Estimated from your session cap</p>
        </div>
      </div>

      {suggestedRate && suggestedRate > 0 ? (
        <div className="bg-[#111] border border-[#1A1A1A] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">Suggested rate: <span className="text-cyan-300 tabular-nums">{suggestedRate.toFixed(2)}</span> drops/RSD</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Current: {dropsPerRsd} drops/RSD</p>
            </div>
            <button type="button" onClick={() => onApply({ dropsPerRsd: suggestedRate, bands: suggestedBands || undefined })}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-colors">
              Apply Suggestions
            </button>
          </div>

          {suggestedBands && (
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#1A1A1A]">
              {Object.entries(suggestedBands).map(([key, band]) => (
                <div key={key} className="text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">{key.replace('_', ' ')}</p>
                  <p className="text-xs text-zinc-300 tabular-nums">{band.min}–{band.max} drops</p>
                  <p className="text-[10px] text-zinc-600" title={`At suggested rate ${suggestedRate.toFixed(2)} drops/RSD`}>
                    ≈ {fmtRsd(band.min, suggestedRate!)}–{fmtRsd(band.max, suggestedRate!)}
                  </p>
                  {dropsPerRsd !== suggestedRate && (
                    <p className="text-[10px] text-zinc-700" title={`At current rate ${dropsPerRsd} drops/RSD`}>
                      current: {fmtRsd(band.min, dropsPerRsd)}–{fmtRsd(band.max, dropsPerRsd)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-zinc-600 italic">Drops are the operational currency. RSD estimates are business guidance only.</p>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Enter values above to see a suggested conversion rate.</p>
      )}
    </div>
  );
}

function diagnoseHealth(summary: EconomySummary, config: EconomyConfig): Array<{ issue: string; action: string }> {
  const results: Array<{ issue: string; action: string }> = [];
  const burnPct = summary.burnMintRatio * 100;

  if (burnPct > 120) {
    results.push({
      issue: `Members are spending ${burnPct.toFixed(0)}% of what they earn — drops are draining fast.`,
      action: 'Reward prices may be too low or earning limits too tight. Raise earning caps or increase reward prices so members don\'t run out of drops.',
    });
  } else if (burnPct > 80) {
    results.push({
      issue: `Spend rate is high (${burnPct.toFixed(0)}%). Members are spending almost everything they earn.`,
      action: 'Monitor reward redemptions. If members start running out of drops, raise session/day earning limits slightly.',
    });
  } else if (burnPct < 10) {
    results.push({
      issue: `Only ${burnPct.toFixed(0)}% of earned drops are being spent. Drops are accumulating and losing perceived value.`,
      action: 'Add more appealing rewards, run limited-time promotions, or lower reward prices to encourage spending.',
    });
  } else if (burnPct < 20) {
    results.push({
      issue: `Spend rate is low (${burnPct.toFixed(0)}%). Drops are accumulating faster than members redeem them.`,
      action: 'Consider adding popular reward items or promoting existing ones. Members need reasons to spend.',
    });
  }

  if (config.maxDropsPerDay > 700) {
    results.push({
      issue: `Daily earning limit is very high (${config.maxDropsPerDay} drops/day).`,
      action: 'Lower "Per day" to 200–500 in Earning Limits below. High daily limits cause rapid drop inflation.',
    });
  }
  if (config.maxDropsPerWeek > 4000) {
    results.push({
      issue: `Weekly earning limit is very high (${config.maxDropsPerWeek} drops/week).`,
      action: 'Lower "Per week" to 1200–2500 in Earning Limits. This prevents excessive drop farming.',
    });
  }
  if (config.maxDropsPerSession > 220) {
    results.push({
      issue: `Session earning limit is very high (${config.maxDropsPerSession} drops/session).`,
      action: 'Lower "Per session" to 80–160 in Earning Limits. Very high session caps let members earn too much in one workout.',
    });
  }

  if (summary.top1SharePct > 35) {
    results.push({
      issue: `Top 1% of members hold ${summary.top1SharePct.toFixed(0)}% of all drops.`,
      action: 'Your reward economy is too concentrated. Lower session/day caps to spread drops more evenly among all members.',
    });
  } else if (summary.top1SharePct > 20) {
    results.push({
      issue: `Top 1% of members hold ${summary.top1SharePct.toFixed(0)}% of drops — getting concentrated.`,
      action: 'Keep an eye on power users. Consider tightening daily or weekly limits to balance distribution.',
    });
  }

  return results;
}

