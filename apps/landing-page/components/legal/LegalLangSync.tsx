'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/use-language';
import type { Language } from '@/lib/i18n';

/**
 * Two-way bridge between `?lang=` (server-rendered legal content) and the
 * `useLanguage()` context (navbar, footer, rest of site).
 *
 * - On first mount, the URL param wins (honours deep links like /privacy?lang=sr)
 *   and is pushed into the context / localStorage.
 * - After that, whenever the context language changes (e.g. footer toggle),
 *   the URL is replaced so the Server Component re-renders with new language.
 * - The `?standalone=true` query (mobile webview embedding) suppresses URL
 *   rewrites to avoid interfering with the host app's navigation.
 */
export function LegalLangSync({ urlLang }: { urlLang: Language }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { language, setLanguage } = useLanguage();

  // On mount: URL param is the source of truth (handles shared deep links).
  useEffect(() => {
    if (urlLang !== language) {
      setLanguage(urlLang);
    }
    // Run once on mount only — urlLang is stable for the lifetime of the server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On subsequent context changes: sync the URL so the Server Component
  // re-renders the legal content in the new language.
  useEffect(() => {
    if (language === urlLang) return;
    // Never rewrite the URL when embedded in a mobile webview.
    if (searchParams?.get('standalone') === 'true') return;

    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    sp.set('lang', language);
    // router.replace keeps the back-button pointing at the previous page,
    // not through every language toggle.
    router.replace(`${pathname}?${sp.toString()}`);
  }, [language, urlLang, pathname, router, searchParams]);

  return null;
}
