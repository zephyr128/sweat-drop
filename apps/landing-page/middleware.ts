import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// www → apex redirect with carve-outs for mobile deep linking
// ─────────────────────────────────────────────────────────────────────────────
// Why this exists:
//   Android App Links (Digital Asset Links / autoVerify) and iOS Universal
//   Links REQUIRE that `/.well-known/assetlinks.json` and
//   `/.well-known/apple-app-site-association` return HTTP 200 DIRECTLY on
//   every host the app declares as an associated domain (in our case both
//   `sweat-drop.com` AND `www.sweat-drop.com` — see
//   apps/mobile-app/app.config.js `associatedDomains` and
//   apps/mobile-app/android/app/src/main/AndroidManifest.xml intent filters).
//
//   Any 3xx redirect (even a permanent 301/308) silently fails Android
//   autoVerify and iOS AASA fetching. When that happens, the reset email
//   link opens in the browser instead of the mobile app.
//
//   The reset email CTA also targets the www host (`.SiteURL` in the
//   Supabase recovery template resolves to `https://www.sweat-drop.com/...`).
//   If we blanket-redirect www → apex, Supabase's link is no longer an App
//   Link match on www — it becomes an ordinary web URL that Android may not
//   hand off to the app even if autoVerify had succeeded.
//
//   So we carve out:
//     - /.well-known/*  — serve AS-IS on www so App Link verification works
//     - /auth/*         — the paths the app intent-filters match; must match
//                         the host declared in the filter exactly
//   Everything else on www is permanently redirected to the apex, keeping
//   SEO canonical behaviour intact.
//
// PRECONDITION (infra):
//   Vercel project domain settings MUST NOT have a built-in "Redirect" from
//   www → apex, because that redirect fires at the Vercel edge BEFORE
//   middleware runs. Both `sweat-drop.com` and `www.sweat-drop.com` must be
//   added as regular production domains pointing at this deployment.
//   Verify with:
//     curl -sI https://www.sweat-drop.com/.well-known/assetlinks.json
//   — it must return HTTP 200 (NOT 307 from `server: Vercel`).
// ─────────────────────────────────────────────────────────────────────────────

const PRESERVE_ON_WWW_PREFIXES = ['/.well-known/', '/auth/'];
const WWW_HOST = 'www.sweat-drop.com';
const APEX_HOST = 'sweat-drop.com';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (host !== WWW_HOST) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  // Keep deep-link / association endpoints on www (the installed mobile app
  // expects to see them there — redirecting would break App Links).
  for (const prefix of PRESERVE_ON_WWW_PREFIXES) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // Redirect everything else to the apex. 308 preserves method/body (safer
  // than 301 for POST-able endpoints) and instructs both browsers and search
  // engines that apex is canonical.
  const redirectUrl = new URL(`${pathname}${search}`, `https://${APEX_HOST}`);
  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  // Run middleware on every request except Next.js internals and static
  // assets — note that `/.well-known/*` IS routed through middleware on
  // purpose so we can pass it through untouched (the logic above handles
  // that). Keep the matcher cheap.
  matcher: ['/((?!_next/|_vercel/|favicon.ico|robots.txt|sitemap.xml).*)'],
};
