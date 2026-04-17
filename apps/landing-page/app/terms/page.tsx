import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { TermsContent } from '@/components/legal/TermsContent';
import { LegalLangSync } from '@/components/legal/LegalLangSync';

type SearchParams = Promise<{ lang?: string; standalone?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const lang = params.lang === 'sr' ? 'sr' : 'en';
  const title = lang === 'sr' ? 'Uslovi korišćenja' : 'Terms of Service';
  const description = lang === 'sr'
    ? 'Uslovi korišćenja SweatDrop platforme — gamifikacija teretana, drops sistem, pravila ponašanja.'
    : 'SweatDrop platform terms of service — gym gamification, drops system, code of conduct.';
  return {
    title,
    description,
    openGraph: { title: `${title} | SweatDrop`, description },
  };
}

export default async function TermsPage({ searchParams }: { searchParams: SearchParams }) {
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
        <TermsContent lang={lang} />
      </main>
      {!standalone && <Footer />}
    </>
  );
}
