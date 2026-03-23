'use client';

import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { REPORT_PERIODS, type ReportPeriod } from '@/lib/utils/report-periods';

interface ReportPeriodSelectorProps {
  activePeriod: ReportPeriod | 'custom';
  onPeriodChange: (period: ReportPeriod) => void;
  onCustomChange: (start: Date, end: Date) => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  exporting?: boolean;
}

export function ReportPeriodSelector({
  activePeriod,
  onPeriodChange,
  onCustomChange,
  onExportPDF,
  onExportCSV,
  exporting,
}: ReportPeriodSelectorProps) {
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(activePeriod === 'custom');

  const pillBase = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors';
  const pillActive = 'bg-[#00E5FF] text-black font-bold';
  const pillInactive = 'bg-[#1A1A1A] text-[#808080] border border-[#333] hover:border-[#555]';

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(REPORT_PERIODS) as ReportPeriod[]).map((key) => (
          <button
            key={key}
            onClick={() => {
              setShowCustom(false);
              onPeriodChange(key);
            }}
            className={`${pillBase} ${activePeriod === key && !showCustom ? pillActive : pillInactive}`}
          >
            {REPORT_PERIODS[key].label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={`${pillBase} ${showCustom ? pillActive : pillInactive}`}
        >
          Custom
        </button>

        {showCustom && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                if (e.target.value && customEnd) {
                  onCustomChange(new Date(e.target.value), new Date(customEnd));
                }
              }}
              className="bg-[#1A1A1A] border border-[#333] text-white rounded-lg px-3 py-1.5 text-sm"
              style={{ colorScheme: 'dark' }}
            />
            <span className="text-zinc-500 text-sm">—</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                if (customStart && e.target.value) {
                  onCustomChange(new Date(customStart), new Date(e.target.value));
                }
              }}
              className="bg-[#1A1A1A] border border-[#333] text-white rounded-lg px-3 py-1.5 text-sm"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onExportPDF}
          disabled={exporting}
          className="bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00E5FF]/50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          PDF
        </button>
        <button
          onClick={onExportCSV}
          disabled={exporting}
          className="bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00E5FF]/50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          CSV
        </button>
      </div>
    </div>
  );
}
