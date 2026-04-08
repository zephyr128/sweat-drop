import i18n from '@/lib/i18n';

/**
 * Returns the BCP-47 locale tag for the current app language.
 * Serbian uses 'sr-Latn-RS' (Latin script) so date strings (month names, weekdays)
 * are rendered in the same Latin alphabet as the rest of the app UI.
 * Using 'sr-Cyrl-RS' would produce Cyrillic month names (e.g. "јануар") which
 * are inconsistent when the rest of the copy is in Latin Serbian.
 */
function getLocale(): string {
  return i18n.language === 'sr' ? 'sr-Latn-RS' : 'en-US';
}

export function formatDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(getLocale(), options);
  } catch {
    return '—';
  }
}

export function formatTime(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString(getLocale(), options);
  } catch {
    return '—';
  }
}

/** Formats a date as "3. Mar" (day + short month), locale-aware. */
export function formatDayMonth(date: Date | string | null | undefined): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

/** Formats a date as "March 2025" (month + year), locale-aware. */
export function formatMonthYear(date: Date | string | null | undefined): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}
