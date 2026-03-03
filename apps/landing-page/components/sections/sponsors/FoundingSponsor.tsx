'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const FoundingSponsor = memo(function FoundingSponsor() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <GlassCard variant="orange" className="p-8 border-l-4 border-orange">
          <div className="mono text-xs text-orange mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.foundingSponsor.badge}
          </div>
          <h3 className="display text-3xl sm:text-4xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
            {t.foundingSponsor.title}
          </h3>
          <p className="text-text-2 mb-6 leading-relaxed">
            {t.foundingSponsor.description.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.foundingSponsor.description.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
          <ul className="space-y-2 text-text-2 mb-8">
            {t.foundingSponsor.benefits.map((benefit, i) => (
              <li key={i}>• {benefit}</li>
            ))}
          </ul>
          <div className="mono text-xs text-orange mb-6" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.foundingSponsor.availability}
          </div>
          <button
            onClick={() => openModal('sponsor-proposal', { founding: true })}
            className="font-sans text-[15px] font-semibold bg-orange text-white px-6 py-3 rounded-lg hover:bg-[#ff6620] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(255,85,0,0.25)] active:scale-[0.98] transition-all"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.foundingSponsor.button}
          </button>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
});
