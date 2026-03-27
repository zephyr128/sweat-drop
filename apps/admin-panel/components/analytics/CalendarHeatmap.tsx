'use client';

import { useState, useMemo } from 'react';

interface CalendarCell {
  date: string;
  sessions: number;
  drops: number;
  unique_users: number;
}

interface CalendarHeatmapProps {
  data: CalendarCell[];
  days: number;
}

const HEAT_COLORS = [
  '#1A1A1A',
  '#0D3B4F',
  '#0E7490',
  '#00B8CC',
  '#00E5FF',
  '#ECFEFF',
];

const DOW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short' });
}

export function CalendarHeatmap({ data, days }: CalendarHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    cell: { date: string; sessions: number; drops: number; unique_users: number; formatted: string };
  } | null>(null);

  const { weeks, maxSessions, totalSessions, monthHeaders } = useMemo(() => {
    const lookup: Record<string, CalendarCell> = {};
    let max = 0;
    let total = 0;
    for (const cell of data) {
      lookup[cell.date] = cell;
      if (cell.sessions > max) max = cell.sessions;
      total += cell.sessions;
    }

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);

    // Rewind start to Monday so columns align
    while (start.getDay() !== 1) {
      start.setDate(start.getDate() - 1);
    }

    const allWeeks: Array<Array<{ date: string; sessions: number; drops: number; unique_users: number; inRange: boolean } | null>> = [];
    const months: Array<{ label: string; col: number }> = [];
    const current = new Date(start);
    let weekIdx = 0;
    let lastMonth = '';

    while (current <= end || current.getDay() !== 1) {
      const week: typeof allWeeks[0] = [];
      for (let dow = 0; dow < 7; dow++) {
        if (current > end && dow > 0) {
          week.push(null);
          current.setDate(current.getDate() + 1);
          continue;
        }
        const ds = current.toISOString().slice(0, 10);
        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - days + 1);
        const inRange = current >= rangeStart && current <= end;
        const cell = lookup[ds];

        const m = getMonthLabel(ds);
        if (m !== lastMonth && dow === 0) {
          months.push({ label: m, col: weekIdx });
          lastMonth = m;
        }

        week.push({
          date: ds,
          sessions: cell?.sessions || 0,
          drops: cell?.drops || 0,
          unique_users: cell?.unique_users || 0,
          inRange,
        });
        current.setDate(current.getDate() + 1);
      }
      allWeeks.push(week);
      weekIdx++;
      if (current > end && current.getDay() === 1) break;
    }

    return { weeks: allWeeks, maxSessions: max, totalSessions: total, monthHeaders: months };
  }, [data, days]);

  function getColor(sessions: number, inRange: boolean): string {
    if (!inRange) return '#111';
    if (sessions === 0 || maxSessions === 0) return HEAT_COLORS[0];
    const ratio = sessions / maxSessions;
    if (ratio <= 0.25) return HEAT_COLORS[1];
    if (ratio <= 0.5) return HEAT_COLORS[2];
    if (ratio <= 0.75) return HEAT_COLORS[3];
    if (ratio <= 0.95) return HEAT_COLORS[4];
    return HEAT_COLORS[5];
  }

  const cellSize = days <= 30 ? 18 : 14;
  const gap = 2;

  return (
    <div className="relative">
      <div className="flex items-center gap-3 mb-3 text-[10px] text-[#808080]">
        <span>{totalSessions} sessions in last {days} days</span>
        {maxSessions > 0 && <span>&bull; busiest day: {maxSessions} sessions</span>}
      </div>

      <div className="overflow-x-auto">
        <div style={{ display: 'inline-block' }}>
          {/* Month labels */}
          <div className="flex" style={{ marginLeft: 28 }}>
            {monthHeaders.map((m, i) => (
              <div
                key={`${m.label}-${i}`}
                className="text-[10px] text-[#808080] font-medium"
                style={{
                  position: 'absolute',
                  left: 28 + m.col * (cellSize + gap),
                }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div className="flex gap-[2px] mt-5">
            {/* Row labels */}
            <div className="flex flex-col" style={{ gap, width: 24 }}>
              {DOW_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="text-[10px] text-[#808080] font-medium flex items-center justify-end pr-1"
                  style={{ height: cellSize }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col" style={{ gap }}>
                {week.map((cell, dIdx) => {
                  if (!cell) {
                    return (
                      <div
                        key={dIdx}
                        style={{ width: cellSize, height: cellSize }}
                      />
                    );
                  }
                  return (
                    <div
                      key={cell.date}
                      className="rounded-[3px] cursor-pointer transition-all duration-150 hover:ring-1 hover:ring-white/40 hover:scale-110"
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: getColor(cell.sessions, cell.inRange),
                        opacity: cell.inRange ? 1 : 0.3,
                      }}
                      onMouseEnter={(e) => {
                        if (!cell.inRange) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          cell: {
                            date: cell.date,
                            sessions: cell.sessions,
                            drops: cell.drops,
                            unique_users: cell.unique_users,
                            formatted: formatDate(cell.date),
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
              {tooltip.cell.formatted}
            </p>
            <p className="text-[10px] text-[#808080] whitespace-nowrap mt-0.5">
              {tooltip.cell.sessions} sessions &bull; {tooltip.cell.unique_users} users &bull; {tooltip.cell.drops} drops
            </p>
          </div>
          <div className="w-2 h-2 bg-[#0A0A0A] border-r border-b border-[#333] rotate-45 mx-auto -mt-[5px]" />
        </div>
      )}
    </div>
  );
}
