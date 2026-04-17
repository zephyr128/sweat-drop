import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { PrivacyContent } from '@/components/legal/PrivacyContent';
import { LegalLangSync } from '@/components/legal/LegalLangSync';

type SearchParams = Promise<{ lang?: string; standalone?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const lang = params.lang === 'sr' ? 'sr' : 'en';
  const title = lang === 'sr' ? 'Politika privatnosti' : 'Privacy Policy';
  const description = lang === 'sr'
    ? 'Politika privatnosti SweatDrop — koje podatke prikupljamo, zašto i kako ih koristimo. Zaštita podataka o ličnosti.'
    : 'SweatDrop privacy policy — what data we collect, why and how we use it. Personal data protection.';
  return {
    title,
    description,
    openGraph: { title: `${title} | SweatDrop`, description },
  };
}

export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const lang = params.lang === 'sr' ? 'sr' : 'en';
  const standalone = params.standalone === 'true';

  return (
    <>
      {!standalone && <Navigation />}
      <Suspense fallback={null}>
        <LegalLangSync urlLang={lang} />
      </Suspense>
      <main className="min-h-screen">
        <PrivacyContent lang={lang} />
      </main>
      {!standalone && <Footer />}
    </>
  );
}
