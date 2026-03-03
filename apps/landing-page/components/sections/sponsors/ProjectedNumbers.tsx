'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';

export const ProjectedNumbers = memo(function ProjectedNumbers() {
  const { t } = useLanguage();
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.projectedNumbers.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {t.projectedNumbers.projections.map((projection, index) => (
            <motion.div
              key={projection.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="card p-6 text-center"
            >
              <div className="display text-4xl text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {projection.value}
              </div>
              <div className="h-px bg-border my-3" />
              <div className="mono text-xs text-text-3 mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {projection.label}
              </div>
              {projection.unit && (
                <div className="mono text-[10px] text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
                  {projection.unit}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <p className="mono text-[10px] text-text-3 max-w-2xl mx-auto" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.projectedNumbers.note.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.projectedNumbers.note.split('\n').length - 1 && ' '}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
});
