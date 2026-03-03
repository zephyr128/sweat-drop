'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';

export const ArenaFinalCTA = memo(function ArenaFinalCTA() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-4xl">
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => openModal('apply-pilot')}
            className="font-sans text-[15px] font-semibold bg-accent text-[#001a18] px-6 py-3 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.arenaFinalCTA.gymButton}
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => openModal('sponsor-proposal')}
            className="font-sans text-[15px] font-semibold bg-orange text-white px-6 py-3 rounded-lg hover:bg-[#ff6620] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(255,85,0,0.25)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.arenaFinalCTA.brandButton}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
});
