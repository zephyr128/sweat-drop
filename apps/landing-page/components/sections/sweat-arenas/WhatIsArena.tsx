'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Tag, Users, BarChart3, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const icons = [Tag, Users, BarChart3];

export const WhatIsArena = memo(function WhatIsArena() {
  const { t } = useLanguage();
  const panels = useMemo(() => t.whatIsArena.panels.map((panel, index) => ({
    ...panel,
    icon: icons[index],
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {panels.map((panel, index) => {
            const Icon = panel.icon;
            return (
              <motion.div
                key={panel.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="relative"
              >
                {/* Icon */}
                <div className="w-16 h-16 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
                  <Icon className="w-8 h-8 text-accent" />
                </div>

                {/* Title */}
                <h3 className="display text-2xl sm:text-3xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  {panel.title}
                </h3>

                {/* Description */}
                <p className="text-text-2 leading-relaxed mb-6">
                  {panel.description}
                </p>

                {/* Arrow (not on last) */}
                {index < panels.length - 1 && (
                  <div className="hidden md:block absolute top-8 -right-6 text-accent/20">
                    <ArrowRight className="w-8 h-8" />
              </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
