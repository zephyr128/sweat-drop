'use client';

import { useState, useMemo } from 'react';

interface HeatmapCell {
  dow: number;
  hour: number;
  sessions: number;
  drops: number;
  avg_min: number;
}

interface HeatmapGridProps {
  data: HeatmapCell[];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_START = 6;
const HOUR_END = 22;

const HEAT_COLORS = [
  '#1A1A1A',
  '#0D3B4F',
  '#0E7490',
  '#00B8CC',
  '#00E5FF',
  '#ECFEFF',
];

function dowToColumn(dow: number): number {
  // DB: 0=Sun, 1=Mon ... 6=Sat → Grid: 0=Mon ... 6=Sun
  return dow === 0 ? 6 : dow - 1;
}

export function HeatmapGrid({ data }: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    cell: HeatmapCell & { dayLabel: string };
  } | null>(null);

  const { grid, maxSessions } = useMemo(() => {
    const g: Record<string, HeatmapCell> = {};
    let max = 0;
    for (const cell of data) {
      const key = `${cell.dow}-${cell.hour}`;
      g[key] = cell;
      if (cell.sessions > max) max = cell.sessions;
    }
    return { grid: g, maxSessions: max };
  }, [data]);

  function getColor(sessions: number): string {
    if (sessions === 0 || maxSessions === 0) return HEAT_COLORS[0];
    const ratio = sessions / maxSessions;
    if (ratio <= 0.25) return HEAT_COLORS[1];
    if (ratio <= 0.5) return HEAT_COLORS[2];
    if (ratio <= 0.75) return HEAT_COLORS[3];
    if (ratio <= 0.95) return HEAT_COLORS[4];
    return HEAT_COLORS[5];
  }

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  // dow values 0-6 where 0=Sun
  const dows = [1, 2, 3, 4, 5, 6, 0]; // Mon=1 .. Sun=0

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6 relative">
      <h3 className="text-sm font-semibold text-white mb-5 uppercase tracking-wider">
        Usage Heatmap
      </h3>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-[400px]">
          {/* Column headers */}
          <div className="flex items-center mb-1">
            <div className="w-10 shrink-0" />
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="flex-1 text-center text-[10px] font-medium text-[#808080] uppercase tracking-wider"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {hours.map((hour) => (
            <div key={hour} className="flex items-center gap-[2px] mb-[2px]">
              <div className="w-10 shrink-0 text-right pr-2 text-[10px] text-[#808080] font-mono tabular-nums">
                {hour.toString().padStart(2, '0')}
              </div>
              {dows.map((dow, colIdx) => {
                const key = `${dow}-${hour}`;
                const cell = grid[key];
                const sessions = cell?.sessions || 0;
                const color = getColor(sessions);

                return (
                  <div
                    key={key}
                    className="flex-1 h-7 rounded-[3px] cursor-pointer transition-all duration-150 hover:ring-1 hover:ring-white/30 hover:scale-105"
                    style={{ backgroundColor: color }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        cell: {
                          dow,
                          hour,
                          sessions,
                          drops: cell?.drops || 0,
                          avg_min: cell?.avg_min || 0,
                          dayLabel: DAY_LABELS[colIdx],
                        },
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#2A2A2A]">
        <span className="text-[10px] text-[#808080]">Less</span>
        {HEAT_COLORS.map((color, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="text-[10px] text-[#808080]">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-[#0A0A0A] border border-[#333] rounded-lg px-3 py-2 shadow-xl">
            <p className="text-xs font-medium text-white whitespace-nowrap">
              {tooltip.cell.dayLabel}, {tooltip.cell.hour.toString().padStart(2, '0')}:00
            </p>
            <p className="text-[10px] text-[#808080] whitespace-nowrap mt-0.5">
              {tooltip.cell.sessions} sessions &bull; {tooltip.cell.avg_min} avg min &bull; {tooltip.cell.drops} drops
            </p>
          </div>
          <div className="w-2 h-2 bg-[#0A0A0A] border-r border-b border-[#333] rotate-45 mx-auto -mt-[5px]" />
        </div>
      )}
    </div>
  );
}
