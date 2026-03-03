'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Home, Activity, Trophy, ShoppingBag } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const icons = [Home, Activity, Trophy, ShoppingBag];
const screenKeys = ['home', 'liveSession', 'leaderboard', 'rewardStore'] as const;

export const AppScreenshots = memo(function AppScreenshots() {
  const { t } = useLanguage();
  const screens = useMemo(() => screenKeys.map((key, index) => ({
    icon: icons[index],
    label: t.appScreenshots.screens[key].label,
    desc: t.appScreenshots.screens[key].desc,
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-bg-card">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.appScreenshots.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {screens.map((screen, index) => {
            const Icon = screen.icon;
            return (
              <motion.div
                key={screen.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="card p-6 text-center"
              >
                {/* Phone mockup placeholder */}
                <div className="bg-bg-card2 rounded-[2rem] aspect-[9/19.5] mb-4 flex items-center justify-center border border-border">
                  <Icon className="w-12 h-12 text-accent/30" />
                </div>
                <div className="mono text-xs text-text-3 mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {screen.label}
                </div>
                <div className="text-xs text-text-2">{screen.desc}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
