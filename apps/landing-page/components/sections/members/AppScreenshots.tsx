'use client';

import { memo, useMemo } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';

const screenKeys = ['home', 'workoutSession', 'workoutSummary', 'leaderboard', 'rewardStore'] as const;
const imagePaths: Record<(typeof screenKeys)[number], string> = {
  home: '/home.png',
  workoutSession: '/workout-session.png',
  workoutSummary: '/workout-summary.png',
  leaderboard: '/leaderboard.png',
  rewardStore: '/rewards-store.png',
};

export const AppScreenshots = memo(function AppScreenshots() {
  const { t } = useLanguage();
  const screens = useMemo(
    () =>
      screenKeys.map((key) => ({
        key,
        src: imagePaths[key],
        label: t.appScreenshots.screens[key].label,
        desc: t.appScreenshots.screens[key].desc,
      })),
    [t]
  );

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-bg-card">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h2
            className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t.appScreenshots.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {screens.map((screen, index) => (
            <motion.div
              key={screen.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="card p-6 text-center"
            >
              <div className="bg-bg-card2 rounded-[2rem] aspect-[9/19.5] mb-4 overflow-hidden border border-border flex items-center justify-center">
                <Image
                  src={screen.src}
                  alt={screen.label}
                  width={390}
                  height={844}
                  className="w-full h-full object-cover object-top"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                />
              </div>
              <div className="mono text-xs text-text-3 mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {screen.label}
              </div>
              <div className="text-xs text-text-2">{screen.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
});
