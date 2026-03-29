/**
 * Mobile gym listing compatibility:
 * when filtering on `is_mobile_listed`, older DBs without the column return
 * PostgreSQL undefined_column (42703); fall back to unfiltered gym list.
 */
export const PG_UNDEFINED_COLUMN = '42703';

export function shouldRetryGymsWithoutColumnFilter(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === PG_UNDEFINED_COLUMN;
}
