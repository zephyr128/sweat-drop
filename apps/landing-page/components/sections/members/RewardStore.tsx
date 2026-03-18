'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';

const emojis = ['🥤', '🎽', '💆', '🎟️'];
const rewardKeys = ['proteinDiscount', 'freeShirt', 'ptSession', 'freeWeekPass'] as const;
const drops = [200, 500, 1000, 3500];

export const RewardStore = memo(function RewardStore() {
  const { t } = useLanguage();
  const rewards = useMemo(() => rewardKeys.map((key, index) => ({
    emoji: emojis[index],
    name: t.rewardStore.rewards[key],
    drops: drops[index],
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-bg-card">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.rewardStore.title}
          </h2>
          <p className="text-lg text-text-2 max-w-2xl mx-auto">
            {t.rewardStore.subtitle.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.rewardStore.subtitle.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>

        {/* Reward Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {rewards.map((reward, index) => (
            <motion.div
              key={reward.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="card p-6 border-accent/20 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-4xl">{reward.emoji}</div>
                <div className="text-right">
                  <div className="display text-2xl text-lime" style={{ fontFamily: 'var(--font-display)' }}>
                    {reward.drops}
                  </div>
                  <div className="text-2xl">💧</div>
                </div>
              </div>
              <h3 className="display text-xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {reward.name}
              </h3>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
});
