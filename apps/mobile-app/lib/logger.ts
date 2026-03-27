/**
 * Centralized logger for SWEATDROP mobile app.
 *
 * In production builds (__DEV__ === false) only warn/error are emitted.
 * In development builds all levels are active.
 *
 * Usage:
 *   import { log } from '@/lib/logger';
 *   log.debug('[BLE]', 'packet received', data);
 *   log.info('[Workout]', 'session started');
 *   log.warn('[Auth]', 'token refresh failed', err);
 *   log.error('[Notifications]', 'registration error', err);
 */

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

function createLogger() {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

  return {
    /** Verbose traces — stripped in production. */
    debug: isDev ? console.log.bind(console) : noop,
    /** General operational info — stripped in production. */
    info: isDev ? console.log.bind(console) : noop,
    /** Warnings — always emitted. */
    warn: console.warn.bind(console),
    /** Errors — always emitted. */
    error: console.error.bind(console),
  };
}

export const log = createLogger();
