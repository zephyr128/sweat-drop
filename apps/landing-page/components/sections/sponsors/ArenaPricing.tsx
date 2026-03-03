'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const ArenaPricing = memo(function ArenaPricing() {
  const { t } = useLanguage();
  const { openModal } = useModal();
  const pricingTiers = t.forSponsors.arenaPricing.tiers;

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forSponsors.arenaPricing.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pricingTiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <GlassCard variant="default" className="p-6">
                <div className="mono text-xs text-orange mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                {tier.name}
              </div>
              <p className="text-sm text-text-2 mb-4">{tier.subtitle}</p>
              <div className="display text-3xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
                {tier.price}
              </div>
              <ul className="space-y-3 mb-6 flex-grow">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-text-2">
                    <Check className="w-4 h-4 text-orange flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => openModal('sponsor-proposal', { plan: tier.name.toLowerCase().replace(' arena', '').replace(' lokalna', 'local').replace(' regionalna', 'regional').replace(' mrežna', 'network') })}
                className="w-full font-sans text-[15px] font-semibold bg-orange text-white px-6 py-3 rounded-lg hover:bg-[#ff6620] hover:shadow-[0_0_30px_rgba(255,85,0,0.25)] active:scale-[0.98] transition-all mt-auto"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t.forSponsors.arenaPricing.requestProposal}
              </button>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
});
