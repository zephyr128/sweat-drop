'use client';

import Link from 'next/link';
import {
  Users,
  QrCode,
  ShoppingBag,
  HeartPulse,
  Droplet,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';
import type { DashboardOverview } from '@/lib/actions/dashboard-types';

interface DashboardKPIGridProps {
  kpis: DashboardOverview['kpis'];
  basePath: string;
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  href: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  badge?: { label: string; color: string } | null;
  trend?: { label: string; positive: boolean } | null;
}

function KPICard({ title, value, subtitle, icon, href, accent, accentBg, accentBorder, badge, trend }: KPICardProps) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-xl bg-[#0A0A0A] border border-[#1A1A1A] ${accentBorder} border-t-2 p-4 transition-all duration-200 hover:border-zinc-700/60 hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${accentBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        {badge && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="mt-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white leading-none">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {trend && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${trend.positive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trend.label}
            </span>
          )}
        </div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1 font-medium">{title}</p>
        <p className="text-xs text-zinc-600 mt-0.5">{subtitle}</p>
      </div>

      <div className={`absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity ${accent}`}>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

export function DashboardKPIGrid({ kpis, basePath }: DashboardKPIGridProps) {
  const { members, checkins, storeDesk, economy, dropsIssued7d, risk } = kpis;

  // Drops trend: use deltaPct if available, otherwise use deltaAbsolute
  let dropsTrend: KPICardProps['trend'] = null;
  if (dropsIssued7d.deltaPct !== null) {
    dropsTrend = {
      label: `${Math.abs(dropsIssued7d.deltaPct)}%`,
      positive: dropsIssued7d.deltaPct >= 0,
    };
  } else if (dropsIssued7d.deltaAbsolute > 0) {
    dropsTrend = {
      label: `+${dropsIssued7d.deltaAbsolute.toLocaleString()}`,
      positive: true,
    };
  }

  const dropsSubtitle = dropsIssued7d.prev7d > 50
    ? `vs ${dropsIssued7d.prev7d.toLocaleString()} prev`
    : dropsIssued7d.total > 0 ? 'First week tracking' : 'No drops yet';

  // Economy: handle 'gray' state
  const isEconomyGray = economy.health === 'gray';
  const economyValue = isEconomyGray ? '—' : `${(economy.burnMintRatio * 100).toFixed(0)}%`;
  const economySubtitle = isEconomyGray
    ? 'No data yet'
    : economy.totalMembers <= 3
      ? `${economy.healthLabel} · burn/mint`
      : `Top1 ${economy.top1SharePct.toFixed(0)}% · ${economy.healthLabel}`;

  const economyBadge = isEconomyGray
    ? { label: 'No data', color: 'bg-zinc-800 text-zinc-500 border border-zinc-700/50' }
    : {
        label: economy.health === 'green' ? 'Healthy' : economy.health === 'yellow' ? 'Watch' : 'Alert',
        color: economy.health === 'green'
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : economy.health === 'yellow'
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
      };

  const economyBorder = isEconomyGray ? 'border-t-zinc-700/60'
    : economy.health === 'green' ? 'border-t-emerald-500/60'
    : economy.health === 'yellow' ? 'border-t-amber-500/60'
    : 'border-t-rose-500/60';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <KPICard
        title="Members"
        value={members.total}
        subtitle={`${Math.min(100, members.activeRatePct)}% active (7d)`}
        icon={<Users className="w-4 h-4 text-cyan-400" />}
        href={`${basePath}/members`}
        accent="text-cyan-400"
        accentBg="bg-cyan-500/10"
        accentBorder="border-t-cyan-500/60"
      />

      <KPICard
        title="Check-ins Today"
        value={checkins.today}
        subtitle={`${checkins.week.toLocaleString()} this week`}
        icon={<QrCode className="w-4 h-4 text-emerald-400" />}
        href={`${basePath}/checkin`}
        accent="text-emerald-400"
        accentBg="bg-emerald-500/10"
        accentBorder="border-t-emerald-500/60"
      />

      <KPICard
        title="Store Desk"
        value={storeDesk.pendingPickups}
        subtitle={storeDesk.confirmedToday > 0 ? `${storeDesk.confirmedToday} confirmed today` : 'No confirmations today'}
        icon={<ShoppingBag className="w-4 h-4 text-amber-400" />}
        href={`${basePath}/store?tab=redemptions`}
        accent="text-amber-400"
        accentBg="bg-amber-500/10"
        accentBorder="border-t-amber-500/60"
        badge={storeDesk.pendingPickups > 0 ? { label: `${storeDesk.pendingPickups} pending`, color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' } : null}
      />

      <KPICard
        title="Economy"
        value={economyValue}
        subtitle={economySubtitle}
        icon={<HeartPulse className={`w-4 h-4 ${isEconomyGray ? 'text-zinc-500' : 'text-cyan-300'}`} />}
        href={`${basePath}/economy`}
        accent={isEconomyGray ? 'text-zinc-500' : 'text-cyan-300'}
        accentBg={isEconomyGray ? 'bg-zinc-800' : 'bg-cyan-500/10'}
        accentBorder={economyBorder}
        badge={economyBadge}
      />

      <KPICard
        title="Drops (7d)"
        value={dropsIssued7d.total.toLocaleString()}
        subtitle={dropsSubtitle}
        icon={<Droplet className="w-4 h-4 text-blue-400" />}
        href={`${basePath}/leaderboard-history`}
        accent="text-blue-400"
        accentBg="bg-blue-500/10"
        accentBorder="border-t-blue-500/60"
        trend={dropsTrend}
      />

      <KPICard
        title="Risk Alerts"
        value={risk.unresolved}
        subtitle={risk.unresolved === 0 ? 'All clear' : risk.critical > 0 ? `${risk.critical} critical` : 'No critical events'}
        icon={<ShieldAlert className={`w-4 h-4 ${risk.unresolved > 0 ? 'text-rose-400' : 'text-emerald-400'}`} />}
        href={`${basePath}/risk`}
        accent={risk.unresolved > 0 ? 'text-rose-400' : 'text-emerald-400'}
        accentBg={risk.unresolved > 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10'}
        accentBorder={risk.unresolved > 0 ? 'border-t-rose-500/60' : 'border-t-emerald-500/60'}
        badge={risk.critical > 0 ? { label: 'Critical', color: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' } : null}
      />
    </div>
  );
}
