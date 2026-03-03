'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const PilotProgram = memo(function PilotProgram() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  const columns = [
    {
      title: t.pilotProgram.columns.weProvide.title,
      items: t.pilotProgram.columns.weProvide.items,
    },
    {
      title: t.pilotProgram.columns.youProvide.title,
      items: t.pilotProgram.columns.youProvide.items,
    },
    {
      title: t.pilotProgram.columns.youKeep.title,
      items: t.pilotProgram.columns.youKeep.items,
    },
  ];

  return (
    <section
      id="pilot"
      className="py-24 px-4 sm:px-6 lg:px-8 relative"
      style={{
        background: 'linear-gradient(135deg, #001a0f, #070709)',
      }}
    >
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="display text-5xl sm:text-6xl md:text-7xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.pilotProgram.title}
          </h2>
          <p className="text-lg text-text-2">{t.pilotProgram.subtitle}</p>
        </div>

        {/* Three Column Table */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {columns.map((column) => (
            <motion.div
              key={column.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <GlassCard variant="default" className="p-6">
              <h3 className="display text-xl text-text mb-6 pb-4 border-b border-border" style={{ fontFamily: 'var(--font-display)' }}>
                {column.title}
              </h3>
              <ul className="space-y-3 flex-grow">
                {column.items.map((item) => (
                  <li key={item} className="text-text-2 flex items-start gap-2">
                    <span className="text-accent mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* Bottom Note */}
        <div className="text-center mb-8">
          <p className="text-text-2">
            {t.pilotProgram.bottomNote.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.pilotProgram.bottomNote.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => openModal('apply-pilot')}
            className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all max-w-md w-full"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.pilotProgram.button}
          </button>
          <p className="mono text-[10px] text-orange" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.pilotProgram.availability}
          </p>
        </div>
      </div>
    </section>
  );
});
