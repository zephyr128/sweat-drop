'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ReportPeriodSelector } from './ReportPeriodSelector';
import { EngagementKPIs, type EngagementData, type TopMember } from './EngagementKPIs';
import { DropsEconomyKPIs } from './DropsEconomyKPIs';
import { SessionsTrendChart, type TrendWeek } from './SessionsTrendChart';
import { StoreReportTable, type StoreReportRow } from './StoreReportTable';
import { ArenaReportTable, type ArenaReportRow } from './ArenaReportTable';
import { ChallengeReportTable, type ChallengeReportRow } from './ChallengeReportTable';
import { MembersReportSection } from './MembersReportSection';
import { exportGymReportCSV } from './ReportExportCSV';
import {
  getGymEngagementReport,
  getGymStoreReport,
  getGymArenaReport,
  getGymSessionsTrend,
  getGymChallengeReport,
} from '@/lib/actions/report-actions';
import { getGymExpiryPressure, type GymExpiryPressure } from '@/lib/actions/member-detail-actions';
import { getPeriodDates, getCustomPeriodDates, REPORT_PERIODS, type ReportPeriod } from '@/lib/utils/report-periods';

interface GymReportDashboardProps {
  gymId: string;
  gymName: string;
}

interface ReportData {
  engagement: EngagementData | null;
  store: StoreReportRow[];
  arenas: ArenaReportRow[];
  trend: TrendWeek[];
  challenges: ChallengeReportRow[];
  expiryPressure: GymExpiryPressure | null;
}

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
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-72" />
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-48" />
    </div>
  );
}

export function GymReportDashboard({ gymId, gymName }: GymReportDashboardProps) {
  const [period, setPeriod] = useState<ReportPeriod | 'custom'>('pilot');
  const [dates, setDates] = useState(() => getPeriodDates('pilot'));
  const [data, setData] = useState<ReportData>({
    engagement: null,
    store: [],
    arenas: [],
    trend: [],
    challenges: [],
    expiryPressure: null,
  });
  const [loading, setLoading] = useState(true);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setSectionErrors({});

    const results = await Promise.allSettled([
      getGymEngagementReport(gymId, start, end),
      getGymStoreReport(gymId, start, end),
      getGymArenaReport(gymId, start, end),
      getGymSessionsTrend(gymId, 12),
      getGymChallengeReport(gymId, start, end),
      getGymExpiryPressure(gymId),
    ]);

    const errors: Record<string, string> = {};
    const sections = ['engagement', 'store', 'arenas', 'trend', 'challenges', 'expiryPressure'] as const;

    const newData: ReportData = { engagement: null, store: [], arenas: [], trend: [], challenges: [], expiryPressure: null };

    results.forEach((result, i) => {
      const key = sections[i];
      if (result.status === 'fulfilled' && result.value.success) {
        const val = result.value.data;
        if (key === 'engagement') newData.engagement = val as EngagementData;
        else if (key === 'store') newData.store = (val || []) as StoreReportRow[];
        else if (key === 'arenas') newData.arenas = (val || []) as ArenaReportRow[];
        else if (key === 'trend') newData.trend = (val || []) as TrendWeek[];
        else if (key === 'challenges') newData.challenges = (val || []) as ChallengeReportRow[];
        else if (key === 'expiryPressure') newData.expiryPressure = val as GymExpiryPressure;
      } else {
        const errMsg = result.status === 'fulfilled'
          ? result.value.error || 'Unknown error'
          : 'Network error';
        errors[key] = errMsg;
      }
    });

    setData(newData);
    setSectionErrors(errors);
    setLoading(false);
  }, [gymId]);

  useEffect(() => {
    fetchData(dates.start, dates.end);
  }, [dates, fetchData]);

  const handlePeriodChange = (p: ReportPeriod) => {
    setPeriod(p);
    setDates(getPeriodDates(p));
  };

  const handleCustomChange = (start: Date, end: Date) => {
    setPeriod('custom');
    setDates(getCustomPeriodDates(start, end));
  };

  const periodLabel = period === 'custom'
    ? `${new Date(dates.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(dates.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : REPORT_PERIODS[period].label;

  const handleExportPDF = () => {
    const params = new URLSearchParams({
      start: dates.start,
      end: dates.end,
      period: periodLabel,
    });
    window.open(`/print/gym-report/${gymId}?${params.toString()}`, '_blank');
  };

  const handleExportCSV = () => {
    if (!data.engagement) {
      toast.error('No data to export');
      return;
    }
    setExporting(true);
    try {
      exportGymReportCSV({
        gymName,
        engagement: data.engagement,
        storeItems: data.store,
        arenas: data.arenas,
        challenges: data.challenges,
      });
      toast.success('CSV files exported');
    } catch {
      toast.error('CSV export failed');
    }
    setExporting(false);
  };

  function SectionError({ section }: { section: string }) {
    const err = sectionErrors[section];
    if (!err) return null;
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
        Failed to load {section}: {err}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ReportPeriodSelector
        activePeriod={period}
        onPeriodChange={handlePeriodChange}
        onCustomChange={handleCustomChange}
        onExportPDF={handleExportPDF}
        onExportCSV={handleExportCSV}
        exporting={exporting}
      />

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-8">
          <SectionError section="engagement" />
          {data.engagement && (
            <>
              <EngagementKPIs data={data.engagement} />
              <DropsEconomyKPIs
                dropsEarned={data.engagement.total_drops_earned}
                dropsSpent={data.engagement.total_drops_spent}
                dropsExpiring30d={data.expiryPressure?.dropsExpiring30d}
                membersAffectedByExpiry={data.expiryPressure?.membersAffected}
              />
              <MembersReportSection
                registered={data.engagement.total_registered_members}
                active={data.engagement.total_active_members}
                inactive14d={data.engagement.inactive_14d}
                avgStreak={data.engagement.avg_streak_days}
                topMembers={data.engagement.top_members || []}
              />
            </>
          )}

          <SectionError section="trend" />
          <SessionsTrendChart data={data.trend} />

          <SectionError section="challenges" />
          <ChallengeReportTable data={data.challenges} />

          <SectionError section="store" />
          <StoreReportTable data={data.store} />

          <SectionError section="arenas" />
          <ArenaReportTable data={data.arenas} />
        </div>
      )}
    </div>
  );
}

export default GymReportDashboard;
