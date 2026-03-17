'use client';

import Link from 'next/link';
import { 
  Users, 
  Trophy, 
  ShoppingBag, 
  Droplet, 
  Building2,
  Target,
  DollarSign,
  CheckCircle2,
  Pause,
  Dumbbell,
  BarChart3,
  QrCode,
  Ticket,
  ArrowRight,
  LucideIcon,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  href?: string;
  accent?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue' | 'purple';
  priority?: 'primary' | 'secondary';
}

const iconMap: Record<string, LucideIcon> = {
  Users,
  Trophy,
  ShoppingBag,
  Droplet,
  Building2,
  Target,
  DollarSign,
  CheckCircle2,
  Pause,
  Dumbbell,
  BarChart3,
  QrCode,
  Ticket,
};

const accentColors = {
  cyan: {
    border: 'border-t-cyan-500',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-500',
    glow: 'hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]',
  },
  emerald: {
    border: 'border-t-emerald-500',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
  },
  amber: {
    border: 'border-t-amber-500',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]',
  },
  rose: {
    border: 'border-t-rose-500',
    iconBg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    glow: 'hover:shadow-[0_0_20px_rgba(244,63,94,0.3)]',
  },
  blue: {
    border: 'border-t-blue-500',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]',
  },
  purple: {
    border: 'border-t-purple-500',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    glow: 'hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]',
  },
};

export function StatsCard({ 
  title, 
  value, 
  icon, 
  trend,
  subtitle,
  href,
  accent = 'cyan',
  priority = 'secondary'
}: StatsCardProps) {
  const IconComponent = typeof icon === 'string' && iconMap[icon] ? iconMap[icon] : null;
  const colors = accentColors[accent];
  const isPrimary = priority === 'primary';

  const cardContent = (
    <>
      {IconComponent && (
        <div className={`absolute top-4 right-4 w-12 h-12 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
          <IconComponent className={`w-6 h-6 ${colors.iconColor}`} strokeWidth={1.5} />
        </div>
      )}

      <div className="relative z-10">
        <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
          {title}
        </p>
        
        <div className="flex items-baseline gap-3 mb-1">
          <p className={`${isPrimary ? 'text-3xl' : 'text-2xl'} font-bold text-white`}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          
          {trend && (
            <div className={`
              flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold
              ${trend.isPositive 
                ? 'bg-emerald-500/10 text-emerald-400' 
                : 'bg-rose-500/10 text-rose-400'
              }
            `}>
              {trend.isPositive ? (
                <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
              ) : (
                <TrendingDown className="w-3 h-3" strokeWidth={2.5} />
              )}
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>

        {subtitle && (
          <p className="text-xs text-zinc-500">{subtitle}</p>
        )}

        {href && (
          <div className="flex items-center gap-1 mt-3 text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
            <span>View details</span>
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-zinc-900/20 pointer-events-none" />
    </>
  );

  const className = `
    group relative overflow-hidden rounded-xl
    bg-gradient-to-br from-[#0A0A0A] to-[#111]
    border border-zinc-800/50 ${colors.border} border-t-2
    p-6
    transition-all duration-300 ease-out
    hover:-translate-y-1 hover:border-zinc-700/50
    ${colors.glow}
    ${isPrimary ? 'ring-1 ring-zinc-700/30' : ''}
    ${href ? 'cursor-pointer' : ''}
  `;

  if (href) {
    return (
      <Link href={href} className={className}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div className={className}>
      {cardContent}
    </div>
  );
}
