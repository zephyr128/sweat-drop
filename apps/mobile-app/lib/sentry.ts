/**
 * Lazy Sentry wrapper — the native @sentry/react-native TurboModule is loaded
 * only when a DSN is configured. This prevents the native module from being
 * initialised at import time, which can throw NSExceptions that corrupt the
 * Hermes GC in release builds (see crash logs from Xcode Cloud / TestFlight).
 */

type SentryModule = typeof import('@sentry/react-native');

let _sentry: SentryModule | null = null;
let _initPromise: Promise<void> | null = null;

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

async function loadSentry(): Promise<SentryModule | null> {
  if (!SENTRY_DSN) return null;
  try {
    const mod = await import('@sentry/react-native');
    return mod;
  } catch (e) {
    if (__DEV__) console.warn('[Sentry] Failed to load module:', e);
    return null;
  }
}

export function initSentry(): void {
  if (!SENTRY_DSN) {
    if (__DEV__) console.log('[Sentry] No DSN configured, skipping init');
    return;
  }

  _initPromise = (async () => {
    try {
      _sentry = await loadSentry();
      if (!_sentry) return;
      _sentry.init({
        dsn: SENTRY_DSN,
        debug: __DEV__,
        enabled: !__DEV__,
        tracesSampleRate: 0.2,
        environment: __DEV__ ? 'development' : 'production',
      });
    } catch (e) {
      if (__DEV__) console.warn('[Sentry] init failed:', e);
      _sentry = null;
    }
  })();
}

export function captureException(error: Error, context?: Record<string, unknown>) {
  if (__DEV__) {
    console.error('[Sentry] Would capture:', error.message, context);
    return;
  }
  if (!_sentry) return;
  if (context) {
    _sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      _sentry!.captureException(error);
    });
  } else {
    _sentry.captureException(error);
  }
}

export function setUser(userId: string | null, email?: string) {
  if (!_sentry) return;
  if (userId) {
    _sentry.setUser({ id: userId, email });
  } else {
    _sentry.setUser(null);
  }
}

export { _sentry as Sentry };
