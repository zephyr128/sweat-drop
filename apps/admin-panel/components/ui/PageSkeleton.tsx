/**
 * Generic page-level loading skeleton.
 * Used by every loading.tsx boundary in the dashboard.
 * Renders a title bar + a few content panels with pulse animation.
 */
export function PageSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <div className="md:p-6 animate-pulse space-y-6">
      {/* Page header */}
      <div className="space-y-2">
        <div className="h-7 w-52 bg-zinc-800 rounded-lg" />
        <div className="h-4 w-80 bg-zinc-800/50 rounded" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 h-24" />
        ))}
      </div>

      {/* Content panels */}
      {Array.from({ length: panels }).map((_, i) => (
        <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-64" />
      ))}
    </div>
  );
}
