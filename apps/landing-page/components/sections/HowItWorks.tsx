'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Wrench, Users, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const icons = [Wrench, Users, BarChart3];

export const HowItWorks = memo(function HowItWorks() {
  const { t } = useLanguage();
  const steps = t.howItWorks.steps.map((step, index) => ({
    ...step,
    icon: icons[index],
  }));
  return (
    <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 relative">
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
                  <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                    <span className="font-display text-3xl text-primary">{step.number}</span>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Icon */}
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="font-display text-2xl sm:text-3xl text-text mb-4">
                  {step.title}
                </h3>
                <p className="text-text-secondary leading-relaxed">
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
