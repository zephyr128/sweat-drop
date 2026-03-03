'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Smartphone, Zap, Trophy } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const icons = [Smartphone, Zap, Trophy];

export const MembersHowItWorks = memo(function MembersHowItWorks() {
  const { t } = useLanguage();
  const steps = useMemo(() => t.membersHowItWorks.steps.map((step, index) => ({
    ...step,
    icon: icons[index],
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="relative"
              >
                {/* Number badge */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-lime/20 border-2 border-lime flex items-center justify-center">
                    <span className="display text-3xl text-lime">{step.number}</span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Icon */}
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-lg bg-lime/10 border border-lime/20 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-lime" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="display text-2xl sm:text-3xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  {step.title}
                </h3>
                <p className="text-text-2 leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
