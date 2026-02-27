'use client';

import { memo } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { TrendingUp, DollarSign, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

export const WhyItMatters = memo(function WhyItMatters() {
  const { t } = useLanguage();
  
  const benefits = [
    {
      icon: TrendingUp,
      title: t.whyItMatters.moreVisits.title,
      description: t.whyItMatters.moreVisits.description,
    },
    {
      icon: DollarSign,
      title: t.whyItMatters.moreRevenue.title,
      description: t.whyItMatters.moreRevenue.description,
    },
    {
      icon: BarChart3,
      title: t.whyItMatters.moreInsight.title,
      description: t.whyItMatters.moreInsight.description,
    },
  ];

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="why-it-matters">
      <div className="container mx-auto max-w-6xl">
        <ScrollReveal>
          <h2
            id="why-it-matters"
            className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-16 text-center text-white"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {t.whyItMatters.title}
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <ScrollReveal key={benefit.title} delay={0.1 * index}>
                <div className="p-8 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10">
                  <Icon className="w-10 h-10 text-primary mb-4" />
                  <h3 className="text-2xl font-bold text-white mb-3">{benefit.title}</h3>
                  <p className="text-white/70 leading-relaxed">{benefit.description}</p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
});
