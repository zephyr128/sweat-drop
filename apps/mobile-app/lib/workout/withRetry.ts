import { log } from '@/lib/logger';

/**
 * Retry an async function with exponential backoff.
 *
 * Delays between attempts: baseDelayMs, baseDelayMs*2, baseDelayMs*4, ...
 * The final attempt throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    attempts = 3,
    baseDelayMs = 1000,
    label = 'withRetry',
  }: { attempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      // Errors tagged _noRetry are business-logic rejections — re-throw immediately
      if (e?._noRetry) throw e;
      if (i < attempts - 1) {
        const delay = baseDelayMs * 2 ** i;
        log.warn(`[${label}] Attempt ${i + 1}/${attempts} failed, retrying in ${delay}ms`, e);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
