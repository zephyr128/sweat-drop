'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { smoothScrollTo } from '@/lib/smooth-scroll';

export const FindYourGym = memo(function FindYourGym() {
  const { t } = useLanguage();
  const { openModal } = useModal();
  // Since no gyms exist yet
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="display text-3xl sm:text-4xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
            {t.findYourGym.title}
          </h2>
          <p className="text-lg text-text-2 mb-8 leading-relaxed">
            {t.findYourGym.subtitle.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.findYourGym.subtitle.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>

        <div className="max-w-md mx-auto mb-8">
          <button
            onClick={() => openModal('waitlist', { source: 'members_page' })}
            className="w-full font-sans text-[15px] font-semibold bg-accent text-[#001a18] px-6 py-3 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.findYourGym.joinWaitlist}
          </button>
        </div>

        <div className="text-center">
          <p className="text-text-2 mb-2">{t.findYourGym.notListed}</p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/#pilot';
              }
            }}
            className="text-accent hover:text-accent/80 transition-colors underline"
          >
            {t.findYourGym.tellGym}
          </button>
        </div>
      </div>
    </section>
  );
});
