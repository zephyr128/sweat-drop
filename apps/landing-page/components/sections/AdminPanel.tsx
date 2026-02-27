'use client';

import { memo } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { SmartPlaceholder } from '@/components/ui/SmartPlaceholder';
import { Monitor, Check } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

export const AdminPanel = memo(function AdminPanel() {
  const { t } = useLanguage();
  
  const features = [
    t.adminPanel.features.dashboard,
    t.adminPanel.features.analytics,
    t.adminPanel.features.rewards,
    t.adminPanel.features.challenges,
  ];

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="admin-panel">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <ScrollReveal>
            <div>
              <h2
                id="admin-panel"
                className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-8 text-white"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {t.adminPanel.title}
              </h2>
              <p className="text-xl text-white/70 mb-8">
                {t.adminPanel.subtitle}
              </p>
              <ul className="space-y-4">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-4 text-lg text-white/70">
                    <Check className="w-6 h-6 text-primary flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>

          {/* Dashboard Mockup */}
          <ScrollReveal delay={0.2}>
            <div className="relative w-full h-[500px] rounded-3xl overflow-hidden bg-white/5 backdrop-blur-lg border border-white/10">
              <SmartPlaceholder
                icon={Monitor}
                title="Dashboard Mockup"
                gradient="from-primary/20 via-primary/10 to-transparent"
                className="w-full h-full"
              />
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
});
