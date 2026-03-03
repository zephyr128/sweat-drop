'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Droplet, Trophy, Award } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const icons = [Droplet, Trophy, Award];
const emojis = ['💧', '🏆', '🏅'];
const accentColors = ['accent', 'lime', 'orange'] as const;

export const WhatYouEarn = memo(function WhatYouEarn() {
  const { t } = useLanguage();
  const earnings = useMemo(() => t.whatYouEarn.earnings.map((earning, index) => ({
    ...earning,
    icon: icons[index],
    emoji: emojis[index],
    accentColor: accentColors[index],
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-bg-card">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.whatYouEarn.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {earnings.map((earning, index) => {
            const Icon = earning.icon;
            const accentClass = `border-${earning.accentColor}/30`;
            const accentBgClass = `bg-${earning.accentColor}/10`;
            
            return (
              <motion.div
                key={earning.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`card card-accent p-6 ${accentClass}`}
              >
                <div className={`w-16 h-16 rounded-lg ${accentBgClass} border ${accentClass} flex items-center justify-center mb-4 text-3xl`}>
                  {earning.emoji}
                </div>
                <h3 className="display text-2xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                  {earning.title}
                </h3>
                <p className="mono text-xs text-text-3 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                  {earning.subtitle}
                </p>
                <p className="text-text-2 leading-relaxed flex-grow">
                  {earning.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
