'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { QrCode } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const CheckInSection = memo(function CheckInSection() {
  const { t } = useLanguage();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-surface">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="w-full"
        >
          <GlassCard variant="default" className="p-8 md:p-12 w-full">
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-text text-center mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              {t.checkIn.title}
            </h2>
            <p className="text-text-2 text-center text-lg mb-10 max-w-2xl mx-auto whitespace-pre-line">
              {t.checkIn.subtitle}
            </p>
            <div className="flex flex-col md:flex-row md:items-start gap-8">
              <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <QrCode className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-grow">
                <h3 className="font-display text-2xl text-primary mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  {t.checkIn.cardTitle}
                </h3>
                <p className="text-text-secondary leading-relaxed whitespace-pre-line">
                  {t.checkIn.cardBody}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
});
