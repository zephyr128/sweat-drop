'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';

export const MembersFinalCTA = memo(function MembersFinalCTA() {
  const { t } = useLanguage();
  const { openModal } = useModal();
  const isAppLive = false; // TODO: Update when app is live

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(at 50% 50%, rgba(200,255,0,0.15) 0px, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto max-w-4xl relative z-10 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="display text-4xl sm:text-5xl md:text-6xl text-text mb-8"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {isAppLive ? t.membersFinalCTA.readyToStart : t.membersFinalCTA.beFirst}
        </motion.h2>

        {isAppLive ? (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#"
              className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.membersFinalCTA.appStore}
            </a>
            <a
              href="#"
              className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.membersFinalCTA.googlePlay}
            </a>
          </div>
        ) : (
          <>
            <p className="text-lg text-text-2 mb-8">
              {t.membersFinalCTA.bonus.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.membersFinalCTA.bonus.split('\n').length - 1 && ' '}
                </span>
              ))}
            </p>
            <div className="max-w-md mx-auto">
              <button
                onClick={() => openModal('waitlist', { source: 'members_page' })}
                className="w-full font-sans text-[15px] font-semibold bg-accent text-[#001a18] px-6 py-3 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t.membersFinalCTA.joinWaitlist}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
});
