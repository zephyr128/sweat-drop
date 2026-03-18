'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, DollarSign, Megaphone, ShoppingBag } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

const icons = [Trophy, DollarSign, ShoppingBag, Megaphone];
const visuals = ['leaderboard', 'challenge', 'rewardStore', 'gymStandsOut'] as const;

export const WhyItWorks = memo(function WhyItWorks() {
  const { t } = useLanguage();
  const features = t.whyItWorks.features.map((feature, index) => ({
    ...feature,
    icon: icons[index],
    visual: visuals[index],
  }));
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <p className="mono text-[10px] uppercase tracking-[3px] text-accent mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.whyItWorks.badge}
          </p>
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.whyItWorks.title}
            <br />
            <span className="text-accent">{t.whyItWorks.titleHighlight}</span>
          </h2>
        </div>

        <div className="space-y-24">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isEven = index % 2 === 0;
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className={`grid grid-cols-1 md:grid-cols-2 gap-12 items-center ${
                  !isEven ? 'md:grid-flow-dense' : ''
                }`}
              >
                {/* Text Column */}
                <div className={!isEven ? 'md:col-start-2' : ''}>
                  <div className="w-12 h-12 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
                    <Icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="display text-3xl sm:text-4xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                    {feature.title}
                  </h3>
                  <p className="text-text-2 leading-relaxed text-lg">
                    {feature.description}
                  </p>
                </div>

                {/* Visual Column */}
                <div className={!isEven ? 'md:col-start-1 md:row-start-1' : ''}>
                  <GlassCard variant="default" className="p-8">
                    {feature.visual === 'leaderboard' && (
                      <div className="space-y-3">
                        <div className="mono text-xs text-text-3 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                          {t.whyItWorks.visuals.leaderboard.title}
                        </div>
                        {[
                          { rank: 1, name: 'Alex M.', drops: '12,450', color: 'text-lime' },
                          { rank: 2, name: 'Sarah K.', drops: '11,890', color: 'text-text-2' },
                          { rank: 3, name: 'Mike T.', drops: '10,230', color: 'text-text-2' },
                        ].map((entry) => (
                          <div key={entry.rank} className="flex items-center justify-between p-3 bg-bg-card2 rounded-lg border border-border">
                            <div className="flex items-center gap-3">
                              <span className="display text-2xl text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                                #{entry.rank}
                              </span>
                              <span className="text-text">{entry.name}</span>
                            </div>
                            <span className={`display text-xl ${entry.color}`} style={{ fontFamily: 'var(--font-display)' }}>
                              {entry.drops}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {feature.visual === 'challenge' && (
                      <div className="card-accent p-6 bg-gradient-to-br from-orange/10 to-transparent">
                        <div className="mono text-xs text-orange mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                          {t.whyItWorks.visuals.challenge.sponsor}
                        </div>
                        <div className="display text-2xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                          {t.whyItWorks.visuals.challenge.title}
                        </div>
                        <div className="text-text-2 text-sm">
                          {t.whyItWorks.visuals.challenge.description}
                        </div>
                      </div>
                    )}
                    {feature.visual === 'gymStandsOut' && (
                      <div className="space-y-3">
                        <div className="mono text-xs text-text-3 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                          {t.whyItWorks.visuals.gymStandsOut.title}
                        </div>
                        <div className="text-text-2 text-sm">
                          {t.whyItWorks.visuals.gymStandsOut.description}
                        </div>
                      </div>
                    )}
                    {feature.visual === 'rewardStore' && (
                      <div className="space-y-3">
                        <div className="mono text-xs text-text-3 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                          {t.whyItWorks.visuals.rewardStore.title}
                        </div>
                        <div className="space-y-2">
                          {[
                            { emoji: '🥤', name: 'Protein Shake', drops: '120' },
                            { emoji: '🏋️', name: 'PT Session', drops: '500' },
                            { emoji: '🎫', name: 'Free Week Pass', drops: '800' },
                          ].map((item) => (
                            <div key={item.name} className="flex items-center justify-between p-3 bg-bg-card2 rounded-lg border border-border">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{item.emoji}</span>
                                <span className="text-text text-sm">{item.name}</span>
                              </div>
                              <span className="display text-sm text-lime" style={{ fontFamily: 'var(--font-display)' }}>
                                💧 {item.drops}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="text-text-3 text-xs mt-2">
                          {t.whyItWorks.visuals.rewardStore.description}
                        </div>
                      </div>
                    )}
                  </GlassCard>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
