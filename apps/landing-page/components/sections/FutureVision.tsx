'use client';

import { memo } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { useLanguage } from '@/lib/use-language';

export const FutureVision = memo(function FutureVision() {
  const { t } = useLanguage();

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="future-vision">
      <div className="container mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="text-center">
            <h2
              id="future-vision"
              className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-8 text-white"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {t.futureVision.title}
            </h2>
            <ul className="space-y-3 text-lg text-white/70 max-w-2xl mx-auto">
              {t.futureVision.roadmap.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
});
