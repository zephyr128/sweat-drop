'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';

export const ProblemComparison = memo(function ProblemComparison() {
  const { t } = useLanguage();
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card p-6"
          >
            <h3 className="display text-2xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.problemComparison.traditional.title}
            </h3>
            <ul className="space-y-3 text-text-2">
              {t.problemComparison.traditional.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="card card-accent p-6 border-orange/30"
          >
            <h3 className="display text-2xl text-orange mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.problemComparison.sweatArena.title}
            </h3>
            <ul className="space-y-3 text-text">
              {t.problemComparison.sweatArena.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
});
