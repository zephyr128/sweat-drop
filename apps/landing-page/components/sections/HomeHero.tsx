'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { smoothScrollTo } from '@/lib/smooth-scroll';

export const HomeHero = memo(function HomeHero() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16" aria-label="Hero section" style={{ paddingTop: '64px' }}>
      {/* Background with radial gradients */}
      <div className="absolute inset-0 bg-bg" aria-hidden="true" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(at 80% 20%, rgba(0,229,204,0.07) 0px, transparent 50%),
            radial-gradient(at 20% 80%, rgba(200,255,0,0.04) 0px, transparent 50%)
          `,
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
          {/* Left Column: Text */}
          <div>
            {/* Eyebrow */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mono text-[10px] uppercase tracking-[3px] text-accent mb-6"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              ● {t.homeHero.eyebrow}
            </motion.p>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-text mb-6 leading-[0.95]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.homeHero.title}
              <br />
              {t.homeHero.titleLine2}
              <br />
              {t.homeHero.titleLine3}
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-text-2 mb-6 max-w-[480px] leading-relaxed"
            >
              {t.homeHero.subtitle.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.homeHero.subtitle.split('\n').length - 1 && <br />}
                </span>
              ))}
            </motion.p>

            {/* Scarcity line */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mono text-[11px] text-orange mb-8"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              ● {t.homeHero.scarcity}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <button
                onClick={() => openModal('apply-pilot')}
                className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t.homeHero.ctaPrimary}
              </button>
              <button
                onClick={() => smoothScrollTo('how-it-works')}
                className="flex items-center justify-center gap-2 font-sans text-[17px] font-medium bg-[rgba(255,255,255,0.06)] text-text border border-[rgba(255,255,255,0.10)] backdrop-blur-[10px] px-8 py-4 rounded-lg hover:bg-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)] transition-all"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t.homeHero.ctaSecondary}
                <ChevronDown className="w-5 h-5" />
              </button>
            </motion.div>
          </div>

          {/* Right Column: Phone Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative w-[280px]">
              {/* Ambient glow */}
              <div
                className="absolute inset-0 bg-accent/10 blur-3xl rounded-full"
                style={{ transform: 'scale(1.5)' }}
                aria-hidden="true"
              />
              
              {/* Phone mockup */}
              <motion.div
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="relative bg-bg-card border-[1.5px] border-accent/20 rounded-[44px] p-8 shadow-2xl"
                style={{ boxShadow: '0 0 80px rgba(0,229,204,0.06)' }}
              >
                {/* Drops balance card */}
                <div className="bg-lime rounded-2xl p-4 mb-3">
                  <div className="mono text-[9px] text-[#2a4a00] tracking-[2px] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                    💧 {t.homeHero.phoneMockup.availableDrops}
                  </div>
                  <div className="display text-5xl text-[#0a1500] leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    1,240
                  </div>
                </div>
                
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: '4', lbl: t.homeHero.phoneMockup.sessions },
                    { val: '#7', lbl: t.homeHero.phoneMockup.rank },
                    { val: '🔥5', lbl: t.homeHero.phoneMockup.streak },
                  ].map((stat) => (
                    <div key={stat.lbl} className="bg-bg-card2 rounded-xl p-2.5 text-center">
                      <div className="display text-xl text-accent mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                        {stat.val}
                      </div>
                      <div className="mono text-[8px] text-text-3 tracking-[1px]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {stat.lbl}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

    </section>
  );
});
