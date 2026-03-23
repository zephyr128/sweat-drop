'use client';

interface TypeStat {
  type: string;
  machine_count: number;
  sessions: number;
  total_drops: number;
  avg_duration_min: number;
}

interface ZoneStat {
  zone: string;
  machine_count: number;
  sessions: number;
  total_drops: number;
  avg_duration_min: number;
}

interface TypeZoneBreakdownProps {
  typeStats: TypeStat[];
  zoneStats: ZoneStat[];
}

const TYPE_COLORS: Record<string, string> = {
  treadmill: '#00E5FF',
  bike: '#FF9100',
  elliptical: '#A78BFA',
  weight: '#FACC15',
  rower: '#34D399',
  stepper: '#F472B6',
};

const TYPE_ICONS: Record<string, string> = {
  treadmill: '🏃',
  bike: '🚴',
  elliptical: '⭕',
  weight: '🏋️',
  rower: '🚣',
  stepper: '🪜',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || '#808080';
}

function getTypeIcon(type: string): string {
  return TYPE_ICONS[type.toLowerCase()] || '⚙️';
}

export function TypeZoneBreakdown({ typeStats, zoneStats }: TypeZoneBreakdownProps) {
  const totalTypeSessions = typeStats.reduce((sum, t) => sum + t.sessions, 0);
  const totalZoneSessions = zoneStats.reduce((sum, z) => sum + z.sessions, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Type Breakdown */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
          By Type
        </h3>

        {/* Stacked bar */}
        {totalTypeSessions > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden mb-4">
            {typeStats.map((t) => {
              const pct = (t.sessions / totalTypeSessions) * 100;
              if (pct < 1) return null;
              return (
                <div
                  key={t.type}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: getTypeColor(t.type),
                  }}
                />
              );
            })}
          </div>
        )}

        <div className="space-y-3">
          {typeStats.length === 0 ? (
            <p className="text-sm text-[#808080]">No type data</p>
          ) : (
            typeStats.map((t) => {
              const pct = totalTypeSessions > 0
                ? Math.round((t.sessions / totalTypeSessions) * 100)
                : 0;
              return (
                <div key={t.type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getTypeIcon(t.type)}</span>
                    <span className="text-sm text-white capitalize">{t.type}</span>
                    <span className="text-xs text-[#808080]">({t.machine_count})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#808080] tabular-nums">
                      {t.sessions} sess
                    </span>
                    <span
                      className="text-xs font-bold tabular-nums min-w-[36px] text-right"
                      style={{ color: getTypeColor(t.type) }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Zone Breakdown */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
          By Zone
        </h3>
        <div className="space-y-3">
          {zoneStats.length === 0 ? (
            <p className="text-sm text-[#808080]">No zone data</p>
          ) : (
            zoneStats.map((z) => {
              const pct = totalZoneSessions > 0
                ? Math.round((z.sessions / totalZoneSessions) * 100)
                : 0;
              return (
                <div key={z.zone}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white">{z.zone === 'Unassigned' ? 'Cardio Zone' : z.zone}</span>
                      <span className="text-xs text-[#808080]">
                        {z.machine_count} machine{z.machine_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-[#808080] tabular-nums">
                      {z.sessions} sess &bull; {pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#0A0A0A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00E5FF] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
