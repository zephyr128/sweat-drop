'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const SponsorsHero = memo(function SponsorsHero() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16" style={{ paddingTop: '64px' }}>
      {/* Background with subtle orange glow */}
      <div className="absolute inset-0 bg-bg" aria-hidden="true" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(at 80% 0%, rgba(255,85,0,0.06) 0px, transparent 50%)`,
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-text mb-6 leading-[0.95]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t.sponsorsHero.title}
            <br />
            {t.sponsorsHero.titleLine2}
            <br />
            <span className="text-orange">{t.sponsorsHero.titleHighlight}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-text-2 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            {t.sponsorsHero.subtitle.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.sponsorsHero.subtitle.split('\n').length - 1 && <br />}
              </span>
            ))}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <button
              onClick={() => openModal('sponsor-proposal')}
              className="font-sans text-[17px] font-semibold bg-orange text-white px-8 py-4 rounded-lg hover:bg-[#ff6620] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(255,85,0,0.25)] active:scale-[0.98] transition-all"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.sponsorsHero.button}
            </button>
          </motion.div>

          {/* Visual: Arena mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-16 max-w-md mx-auto"
          >
            <GlassCard variant="orange" className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs text-orange" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.sponsorsHero.visual.sponsoredBy}
                  </span>
                </div>
                <div className="display text-2xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                  {t.sponsorsHero.visual.arenaName}
                </div>
                <div className="text-sm text-text-2">
                  {t.sponsorsHero.visual.membersCompeting}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
});
