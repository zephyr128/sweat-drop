'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { smoothScrollTo } from '@/lib/smooth-scroll';

export const SweatArenasHero = memo(function SweatArenasHero() {
  const { t } = useLanguage();
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16" style={{ paddingTop: '64px' }}>
      {/* Background with orange glow */}
      <div className="absolute inset-0 bg-bg" aria-hidden="true" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(at 80% 0%, rgba(255,85,0,0.06) 0px, transparent 50%)`,
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24">
        <div className="max-w-5xl mx-auto text-center">
          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mono text-[10px] uppercase tracking-[3px] text-orange mb-6"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t.sweatArenasHero.badge}
          </motion.p>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-text mb-6 leading-[0.95]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t.sweatArenasHero.title}
            <br />
            {t.sweatArenasHero.titleLine2}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-text-2 mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            {t.sweatArenasHero.subtitle.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.sweatArenasHero.subtitle.split('\n').length - 1 && <br />}
              </span>
            ))}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <button
              onClick={() => smoothScrollTo('gym-owners')}
              className="flex items-center gap-2 font-sans text-[15px] font-medium bg-[rgba(255,255,255,0.06)] text-text border border-[rgba(255,255,255,0.10)] backdrop-blur-[10px] px-6 py-3 rounded-lg hover:bg-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)] transition-all"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.sweatArenasHero.imAGymOwner}
              <ChevronDown className="w-5 h-5" />
            </button>
            <button
              onClick={() => smoothScrollTo('sponsors')}
              className="flex items-center gap-2 font-sans text-[15px] font-medium bg-[rgba(255,255,255,0.06)] text-orange border border-[rgba(255,85,0,0.20)] backdrop-blur-[10px] px-6 py-3 rounded-lg hover:bg-[rgba(255,85,0,0.08)] hover:border-[rgba(255,85,0,0.30)] transition-all"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.sweatArenasHero.imABrand}
              <ChevronDown className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </div>
    </section>
  );
});
