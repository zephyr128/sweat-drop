'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { PlatformKPIs, type PlatformData } from './PlatformKPIs';
import { GymComparisonTable } from './GymComparisonTable';
import { SessionsTrendChart, type TrendWeek } from './SessionsTrendChart';
import { getPlatformReport } from '@/lib/actions/report-actions';
import { getPeriodDates, REPORT_PERIODS, type ReportPeriod } from '@/lib/utils/report-periods';

interface PlatformReportDashboardProps {}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 h-24" />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 h-24" />
        ))}
      </div>
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-48" />
    </div>
  );
}

export function PlatformReportDashboard({}: PlatformReportDashboardProps) {
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [dates, setDates] = useState(() => getPeriodDates('month'));
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError(null);

    const result = await getPlatformReport(start, end);
    if (result.success && result.data) {
      setData(result.data as PlatformData);
    } else {
      setError(result.error || 'Failed to load platform report');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(dates.start, dates.end);
  }, [dates, fetchData]);

  const handlePeriodChange = (p: ReportPeriod) => {
    setPeriod(p);
    setDates(getPeriodDates(p));
  };

  const handleExportPDF = () => {
    const params = new URLSearchParams({
      start: dates.start,
      end: dates.end,
      period: REPORT_PERIODS[period].label,
    });
    window.open(`/print/platform-report?${params.toString()}`, '_blank');
  };

  const pillBase = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors';
  const pillActive = 'bg-[#00E5FF] text-black font-bold';
  const pillInactive = 'bg-[#1A1A1A] text-[#808080] border border-[#333] hover:border-[#555]';

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(Object.keys(REPORT_PERIODS) as ReportPeriod[]).map((key) => (
            <button
              key={key}
              onClick={() => handlePeriodChange(key)}
              className={`${pillBase} ${period === key ? pillActive : pillInactive}`}
            >
              {REPORT_PERIODS[key].label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportPDF}
          disabled={!data}
          className="bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00E5FF]/50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-400">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-8">
          <PlatformKPIs data={data} />
          <GymComparisonTable data={data.per_gym || []} />
        </div>
      ) : null}
    </div>
  );
}
