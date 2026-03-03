'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Pill, Sparkles, Shirt } from 'lucide-react';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

const icons = [Pill, Sparkles, Shirt];

export const ForSponsors = memo(function ForSponsors() {
  const { t } = useLanguage();
  const { openModal } = useModal();

  const sponsorProfiles = useMemo(() => t.forSponsors.whoRunsArenas.profiles.map((profile, index) => ({
    ...profile,
    icon: icons[index],
  })), [t]);

  const arenaPricing = useMemo(() => t.forSponsors.arenaPricing.tiers, [t]);

  return (
    <section
      id="sponsors"
      className="py-24 px-4 sm:px-6 lg:px-8 relative"
      style={{ background: 'rgba(255,85,0,0.02)' }}
    >
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="mono text-[10px] uppercase tracking-[3px] text-orange mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.forSponsors.badge}
          </p>
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forSponsors.title}
            <br />
            <span className="text-orange">{t.forSponsors.titleHighlight}</span>
          </h2>
        </div>

        {/* Comparison Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <GlassCard variant="default" className="p-6">
            <h3 className="display text-2xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.forSponsors.comparison.traditional.title}
            </h3>
            <ul className="space-y-3 text-text-2">
              {t.forSponsors.comparison.traditional.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard variant="orange" className="p-6">
            <h3 className="display text-2xl text-orange mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.forSponsors.comparison.sweatArena.title}
            </h3>
            <ul className="space-y-3 text-text">
              {t.forSponsors.comparison.sweatArena.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </GlassCard>
        </div>

        {/* Sponsor Profiles */}
        <div className="mb-16">
          <h3 className="display text-3xl sm:text-4xl text-text mb-12 text-center" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forSponsors.whoRunsArenas.title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sponsorProfiles.map((profile, index) => {
              const Icon = profile.icon;
              return (
                <motion.div
                  key={profile.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GlassCard variant="default" className="p-6">
                    <div className="w-12 h-12 rounded-lg bg-orange/10 border border-orange/20 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-orange" />
                  </div>
                  <h4 className="display text-xl text-text mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    {profile.title}
                  </h4>
                  <p className="text-text-2 mb-4 leading-relaxed flex-grow">{profile.description}</p>
                  <p className="mono text-xs text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
                    Primeri: {profile.examples}
                  </p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Arena Pricing */}
        <div className="mb-16">
          <h3 className="display text-3xl sm:text-4xl text-text mb-12 text-center" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forSponsors.arenaPricing.title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {arenaPricing.map((arena, index) => (
              <motion.div
                key={arena.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <GlassCard variant="default" className="p-6">
                  <div className="mono text-xs text-orange mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                  {arena.name}
                </div>
                <p className="text-sm text-text-2 mb-4">{arena.subtitle}</p>
                <div className="display text-3xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
                  {arena.price}
                </div>
                <ul className="space-y-3 mb-6 flex-grow">
                  {arena.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-text-2">
                      <span className="text-orange mt-1">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => openModal('sponsor-proposal', { plan: arena.name.toLowerCase().replace(' arena', '').replace(' lokalna', 'local').replace(' regionalna', 'regional').replace(' mrežna', 'network') })}
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

        {/* Founding Sponsor Callout */}
        <GlassCard variant="orange" className="p-8 border-l-4 border-orange">
          <div className="mono text-xs text-orange mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.forSponsors.foundingSponsor.badge}
          </div>
          <h4 className="display text-2xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forSponsors.foundingSponsor.title}
          </h4>
          <p className="text-text-2 mb-6 leading-relaxed">
            {t.forSponsors.foundingSponsor.description.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.forSponsors.foundingSponsor.description.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
          <button
            onClick={() => openModal('sponsor-proposal', { founding: true })}
            className="font-sans text-[15px] font-semibold bg-orange text-white px-6 py-3 rounded-lg hover:bg-[#ff6620] hover:shadow-[0_0_30px_rgba(255,85,0,0.25)] active:scale-[0.98] transition-all"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.forSponsors.foundingSponsor.button}
          </button>
        </GlassCard>
      </div>
    </section>
  );
});
