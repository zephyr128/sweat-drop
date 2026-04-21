import { headers } from 'next/headers';
import { logger } from './logger';

const ADMIN_HOST_ALLOWLIST = new Set<string>([
  'admin.sweat-drop.com',
  'admin.dev.sweat-drop.com',
  'localhost:3000',
  'localhost:3001',
  '127.0.0.1:3000',
]);

function hostToOrigin(host: string): string {
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return `${isLocal ? 'http' : 'https'}://${host}`;
}

export async function resolveAdminAppUrl(): Promise<
  | { ok: true; appUrl: string; source: 'request' | 'env' }
  | { ok: false; reason: string }
> {
  try {
    const h = await headers();
    const rawHost = h.get('host')?.trim().toLowerCase() ?? '';
    if (rawHost && ADMIN_HOST_ALLOWLIST.has(rawHost)) {
      return { ok: true, appUrl: hostToOrigin(rawHost), source: 'request' };
    }
    if (rawHost) {
      logger.warn('[admin-app-url] request host not allowlisted, falling back to env', {
        rawHost,
      });
    }
  } catch (err) {
    logger.warn('[admin-app-url] headers() unavailable; falling back to env', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!envUrl) {
    return { ok: false, reason: 'no host in request and NEXT_PUBLIC_APP_URL is empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(envUrl);
  } catch {
    return { ok: false, reason: `NEXT_PUBLIC_APP_URL is not a valid URL: ${envUrl}` };
  }

  const envHost = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`.toLowerCase();
  if (!ADMIN_HOST_ALLOWLIST.has(envHost)) {
    return { ok: false, reason: `NEXT_PUBLIC_APP_URL host not allowlisted: ${envHost}` };
  }

  return {
    ok: true,
    appUrl: `${parsed.protocol}//${envHost}`,
    source: 'env',
  };
}
