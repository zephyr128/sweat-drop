export const REPORT_PERIODS = {
  pilot: { label: 'Pilot (90d)', days: 90 },
  month: { label: 'Last 30 days', days: 30 },
  twoMonths: { label: 'Last 60 days', days: 60 },
} as const;

export type ReportPeriod = keyof typeof REPORT_PERIODS;

export function getPeriodDates(period: ReportPeriod): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - REPORT_PERIODS[period].days);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getCustomPeriodDates(startDate: Date, endDate: Date): { start: string; end: string } {
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}
