'use client';

export function LiveIndicator({ label = 'Live' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}
