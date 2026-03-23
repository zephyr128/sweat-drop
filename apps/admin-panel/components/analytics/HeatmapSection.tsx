'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, CalendarDays } from 'lucide-react';
import { HeatmapGrid } from './HeatmapGrid';
import { CalendarHeatmap } from './CalendarHeatmap';
import { getDailyCalendarData } from '@/lib/actions/machine-analytics-actions';
import type { DailyCalendarCell } from '@/lib/actions/machine-analytics-actions';

type HeatmapView = 'dow' | 'calendar';

interface HeatmapCell {
  dow: number;
  hour: number;
  sessions: number;
  drops: number;
  avg_min: number;
}

interface HeatmapSectionProps {
  dowData: HeatmapCell[];
  gymId: string;
  days: number;
}

export function HeatmapSection({ dowData, gymId, days }: HeatmapSectionProps) {
  const [view, setView] = useState<HeatmapView>('dow');
  const [calendarData, setCalendarData] = useState<DailyCalendarCell[] | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    const result = await getDailyCalendarData(gymId, days);
    if (result.success && result.data) {
      setCalendarData(result.data);
    }
    setCalendarLoading(false);
  }, [gymId, days]);

  useEffect(() => {
    if (view === 'calendar' && !calendarData) {
      fetchCalendar();
    }
  }, [view, calendarData, fetchCalendar]);

  useEffect(() => {
    setCalendarData(null);
  }, [days]);

  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6 relative">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Usage Heatmap
        </h3>

        <div className="flex items-center bg-[#0A0A0A] border border-[#2A2A2A] rounded-lg p-0.5">
          <button
            onClick={() => setView('dow')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              view === 'dow'
                ? 'bg-[#2A2A2A] text-white'
                : 'text-[#808080] hover:text-white'
            }`}
          >
            <Clock className="w-3 h-3" />
            Day of Week
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
              view === 'calendar'
                ? 'bg-[#2A2A2A] text-white'
                : 'text-[#808080] hover:text-white'
            }`}
          >
            <CalendarDays className="w-3 h-3" />
            Calendar
          </button>
        </div>
      </div>

      {view === 'dow' && <HeatmapGrid data={dowData} days={days} embedded />}

      {view === 'calendar' && (
        calendarLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[#00E5FF]" />
          </div>
        ) : calendarData ? (
          <CalendarHeatmap data={calendarData} days={days} />
        ) : (
          <div className="flex items-center justify-center h-48 text-[#808080] text-sm">
            No calendar data available
          </div>
        )
      )}
    </div>
  );
}
