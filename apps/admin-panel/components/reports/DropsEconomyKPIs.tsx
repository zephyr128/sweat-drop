'use client';

import { Droplets, ShoppingCart, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface DropsEconomyKPIsProps {
  dropsEarned: number;
  dropsSpent: number;
}

function KPICard({ label, value, icon: Icon, sub, accent }: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent || 'text-white'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

export function DropsEconomyKPIs({ dropsEarned, dropsSpent }: DropsEconomyKPIsProps) {
  const circulationPct = dropsEarned > 0
    ? Math.round((dropsSpent / dropsEarned) * 100)
    : 0;

  return (
    <section>
      <h3 className="text-xs text-zinc-500 tracking-wider font-medium uppercase mb-3">Drops Economy</h3>
      <div className="border-t border-zinc-800 pt-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            label="Drops Earned"
            value={dropsEarned}
            icon={Droplets}
            accent="text-[#00E5FF]"
          />
          <KPICard
            label="Drops Spent"
            value={dropsSpent}
            icon={ShoppingCart}
            sub="confirmed redemptions"
          />
          <KPICard
            label="Circulation"
            value={`${circulationPct}%`}
            icon={RefreshCw}
            sub="spent / earned ratio"
          />
        </div>
      </div>
    </section>
  );
}
