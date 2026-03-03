'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';

export const WhatYouReceive = memo(function WhatYouReceive() {
  const { t } = useLanguage();
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-bg-card">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="display text-3xl sm:text-4xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.whatYouReceive.title}
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="card p-8"
        >
          <div className="mono text-sm text-text-3 mb-6" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.whatYouReceive.badge}
          </div>
          <div className="space-y-2 mb-6">
            {t.whatYouReceive.items.map((item, i) => (
              <div key={i} className="mono text-sm text-text-2" style={{ fontFamily: 'var(--font-mono)' }}>
                • {item}
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-border">
            <div className="mono text-xs text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.whatYouReceive.delivery.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.whatYouReceive.delivery.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
});
