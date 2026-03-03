'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';

export const FinalCTA = memo(function FinalCTA() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(at 50% 50%, rgba(0,229,204,0.15) 0px, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto max-w-4xl relative z-10 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-text mb-4"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {t.finalCTA.title}
        </motion.h2>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="display text-3xl sm:text-4xl md:text-5xl text-text-2 mb-8"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {t.finalCTA.subtitle}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-lg text-text-2 mb-12 max-w-2xl mx-auto"
        >
          {t.finalCTA.description.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < t.finalCTA.description.split('\n').length - 1 && <br />}
            </span>
          ))}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => openModal('apply-pilot')}
            className="font-sans text-[17px] font-semibold bg-accent text-[#001a18] px-8 py-4 rounded-lg hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all flex items-center gap-2 mx-auto"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.finalCTA.button}
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    </section>
  );
});
