'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Droplet, Calendar, Shuffle, Flame } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';
import { smoothScrollTo } from '@/lib/smooth-scroll';

const icons = [Droplet, Calendar, Shuffle, Flame];

export const ForGymOwners = memo(function ForGymOwners() {
  const { t } = useLanguage();
  const scoringModels = useMemo(() => t.forGymOwners.scoringModels.models.map((model, index) => ({
    ...model,
    icon: icons[index],
  })), [t]);
  return (
    <section id="gym-owners" className="py-24 px-4 sm:px-6 lg:px-8 relative border-t border-border">
      <div className="container mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left Column */}
          <div>
            <p className="mono text-[10px] uppercase tracking-[3px] text-accent mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.forGymOwners.badge}
            </p>
            <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-8" style={{ fontFamily: 'var(--font-display)' }}>
              {t.forGymOwners.title}
              <br />
              {t.forGymOwners.titleLine2}
            </h2>

            {/* Revenue Example Card */}
            <GlassCard variant="teal" className="p-6 mb-8">
              <p className="mono text-xs text-accent mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                {t.forGymOwners.exampleDeal.badge}
              </p>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-text-2">{t.forGymOwners.exampleDeal.supplementShopPays}</span>
                  <span className="text-text font-medium">€200/month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-2">{t.forGymOwners.exampleDeal.youKeep}</span>
                  <span className="text-accent font-medium">€140/month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-2">{t.forGymOwners.exampleDeal.sweatDropFee}</span>
                  <span className="text-text-2">€60/month</span>
                </div>
                <div className="pt-3 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-2">{t.forGymOwners.exampleDeal.yourWork}</span>
                    <span className="text-text font-medium">{t.forGymOwners.exampleDeal.zero}</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Right Column: Revenue Table */}
          <div>
            <GlassCard variant="default" className="p-6">
              <div className="mono text-xs text-text-3 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                {t.forGymOwners.revenueTable.badge}
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 pb-3 border-b border-border">
                  <div className="mono text-xs text-text-2 font-medium" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.forGymOwners.revenueTable.arenaType}
                  </div>
                  <div className="mono text-xs text-text-2 font-medium" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.forGymOwners.revenueTable.sponsorPays}
                  </div>
                  <div className="mono text-xs text-text-2 font-medium" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t.forGymOwners.revenueTable.yourCut}
                  </div>
                </div>
                {t.forGymOwners.revenueTable.rows.map((row) => (
                  <div key={row.type} className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-text">{row.type}</div>
                    <div className="text-text-2">{row.sponsor}</div>
                    <div className="text-accent font-medium">{row.cut}</div>
                  </div>
                ))}
              </div>
              <p className="mono text-[10px] text-text-3 mt-6 pt-4 border-t border-border" style={{ fontFamily: 'var(--font-mono)' }}>
                {t.forGymOwners.revenueTable.note.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < t.forGymOwners.revenueTable.note.split('\n').length - 1 && ' '}
                  </span>
                ))}
              </p>
            </GlassCard>
          </div>
        </div>

        {/* Scoring Models */}
        <div className="mt-16">
          <h3 className="display text-3xl sm:text-4xl text-text mb-8 text-center" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forGymOwners.scoringModels.title}
            <br />
            {t.forGymOwners.scoringModels.titleLine2}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {scoringModels.map((model, index) => {
              const Icon = model.icon;
              return (
                <motion.div
                  key={model.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GlassCard variant="default" className="p-6">
                    <div className="w-12 h-12 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h4 className="display text-xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    {model.title}
                  </h4>
                  <p className="text-sm text-text-2 flex-grow">{model.description}</p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/#pricing';
              }
            }}
            className="inline-flex items-center gap-2 font-sans text-[15px] font-medium text-accent hover:text-accent/80 transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t.forGymOwners.cta}
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
});
