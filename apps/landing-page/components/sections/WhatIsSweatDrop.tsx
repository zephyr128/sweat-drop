'use client';

import { memo } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { useLanguage } from '@/lib/use-language';

export const WhatIsSweatDrop = memo(function WhatIsSweatDrop() {
  const { t } = useLanguage();

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="what-is-sweatdrop">
      <div className="container mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="text-center">
            <h2
              id="what-is-sweatdrop"
              className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-8 text-white"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {t.whatIsSweatDrop.title}
            </h2>
            <p className="text-xl sm:text-2xl md:text-3xl text-white/70 leading-relaxed max-w-3xl mx-auto whitespace-pre-line">
              {t.whatIsSweatDrop.description}
            </p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
});
