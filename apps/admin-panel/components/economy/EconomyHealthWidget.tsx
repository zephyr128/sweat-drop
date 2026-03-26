import Link from 'next/link';
import { AlertTriangle, HeartPulse } from 'lucide-react';
import type { EconomySummary } from '@/lib/actions/risk-economy-actions';

interface EconomyHealthWidgetProps {
  gymId: string;
  summary: EconomySummary | null;
}

function styles(health: EconomySummary['health']) {
  if (health === 'green') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
  if (health === 'yellow') return 'text-amber-300 bg-amber-500/15 border-amber-500/30';
  return 'text-rose-300 bg-rose-500/15 border-rose-500/30';
}

export function EconomyHealthWidget({ gymId, summary }: EconomyHealthWidgetProps) {
  if (!summary) {
    return (
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <HeartPulse className="w-5 h-5 text-zinc-500" />
          <h3 className="text-white font-semibold">Economy Health</h3>
        </div>
        <p className="text-sm text-zinc-500">
          Economy snapshots are not available yet. Run tokenomics migration first.
        </p>
      </div>
    );
  }

  const ratioPct = (summary.burnMintRatio * 100).toFixed(1);

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <HeartPulse className="w-5 h-5 text-cyan-300" />
            <h3 className="text-white font-semibold">Economy Health</h3>
          </div>
          <p className="text-sm text-zinc-400">
            Burn/Mint: <span className="text-white">{ratioPct}%</span> · Top1 share:{' '}
            <span className="text-white">{summary.top1SharePct.toFixed(1)}%</span>
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1.5 rounded-full border ${styles(summary.health)}`}>
          {summary.healthLabel}
        </span>
      </div>

      {(summary.health === 'yellow' || summary.health === 'red') && (
        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Adjust caps or pricing guardrails to keep economy in target zone.
        </div>
      )}

      <div className="mt-4">
        <Link
          href={`/dashboard/gym/${gymId}/economy`}
          className="text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
        >
          Open Economy Settings
        </Link>
      </div>
    </div>
  );
}
