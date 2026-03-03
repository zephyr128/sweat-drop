'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';

export const MembersHero = memo(function MembersHero() {
  const { t } = useLanguage();
  const { openModal } = useModal();
  const isAppLive = false; // TODO: Update when app is live

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16" style={{ paddingTop: '64px' }}>
      {/* Background with lime glow */}
      <div className="absolute inset-0 bg-bg" aria-hidden="true" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(at 50% 50%, rgba(200,255,0,0.03) 0px, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
          {/* Left Column: Text */}
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-text mb-6 leading-[0.95]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.membersHero.title}
              <br />
              {t.membersHero.titleLine2}
              <br />
              <span className="text-lime">{t.membersHero.titleHighlight}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-text-2 mb-8 leading-relaxed"
            >
              {t.membersHero.subtitle.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.membersHero.subtitle.split('\n').length - 1 && <br />}
                </span>
              ))}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              {isAppLive ? (
                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href="#"
                    className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all text-center"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {t.membersHero.downloadAppStore}
                  </a>
                  <a
                    href="#"
                    className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all text-center"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {t.membersHero.downloadGooglePlay}
                  </a>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => openModal('waitlist', { source: 'members_page' })}
                    className="font-sans text-[17px] font-semibold bg-lime text-[#0a1500] px-8 py-4 rounded-lg hover:bg-lime/90 hover:scale-[1.02] active:scale-[0.98] transition-all w-full sm:w-auto"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {t.membersHero.joinWaitlist}
                  </button>
                  <p className="text-sm text-text-2">
                    {t.membersHero.waitlistNote}
                  </p>
                </>
              )}
            </motion.div>
          </div>

          {/* Right Column: Phone Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative w-[280px]">
              {/* Phone mockup - Session end screen */}
              <motion.div
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="relative bg-bg-card border-[1.5px] border-lime/20 rounded-[44px] p-8 shadow-2xl"
              >
                <div className="bg-bg rounded-[2.5rem] p-8 text-center">
                  <div className="text-6xl mb-4">💧</div>
                  <div className="display text-6xl bg-gradient-to-r from-lime to-accent bg-clip-text text-transparent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    +225
                  </div>
                  <div className="text-text-2 text-sm mb-4">{t.membersHero.dropsEarned}</div>
                  <div className="mono text-xs text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.membersHero.sessionComplete}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
});
