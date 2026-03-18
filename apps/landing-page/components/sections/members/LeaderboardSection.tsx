'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';

export const LeaderboardSection = memo(function LeaderboardSection() {
  const { t, language } = useLanguage();
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div>
            <p className="mono text-[10px] uppercase tracking-[3px] text-accent mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.leaderboardSection.badge}
            </p>
            <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.leaderboardSection.title}
              <br />
              {t.leaderboardSection.titleLine2}
            </h2>
            <p className="text-lg text-text-2 leading-relaxed mb-6">
              {t.leaderboardSection.description.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.leaderboardSection.description.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>
            <p className="text-text-2 leading-relaxed mb-8">
              {t.leaderboardSection.updates.split('\n').slice(0, 2).map((line, i) => (
                <span key={i}>
                  {line}
                  {i < 1 && <br />}
                </span>
              ))}
              <br />
              <span className="text-text font-medium">{t.leaderboardSection.updates.split('\n')[2]}</span>
            </p>

          </div>

          {/* Right: Leaderboard Mockup */}
          <div className="card p-6">
            <div className="mono text-xs text-text-3 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.leaderboardSection.badge}
            </div>
            
            {/* Podium */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              {[
                { rank: 2, name: 'Sarah K.', drops: '11,890', height: 'h-20', color: 'text-text-2' },
                { rank: 1, name: 'Alex M.', drops: '12,450', height: 'h-24', color: 'text-lime' },
                { rank: 3, name: 'Mike T.', drops: '10,230', height: 'h-16', color: 'text-text-2' },
              ].map((entry) => (
                <div key={entry.rank} className="text-center">
                  <div className={`${entry.height} bg-bg-card2 rounded-t-lg border border-border mb-2 flex items-end justify-center pb-2`}>
                    <span className="display text-2xl text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                      #{entry.rank}
                    </span>
                  </div>
                  <div className="text-xs text-text font-medium">{entry.name}</div>
                  <div className={`display text-sm ${entry.color}`} style={{ fontFamily: 'var(--font-display)' }}>
                    {entry.drops}
                  </div>
                </div>
              ))}
            </div>

            {/* List */}
            <div className="space-y-2">
              {[
                { rank: 4, name: 'Emma L.', drops: '9,850' },
                { rank: 5, name: language === 'sr' ? 'TI' : 'YOU', drops: '8,240', highlight: true },
                { rank: 6, name: 'David R.', drops: '7,120' },
              ].map((entry) => (
                <div
                  key={entry.rank}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    entry.highlight
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-bg-card2 border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="display text-lg text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                      #{entry.rank}
                    </span>
                    <span className={`text-sm ${entry.highlight ? 'text-accent font-medium' : 'text-text'}`}>
                      {entry.name}
                    </span>
                  </div>
                  <span className="display text-lg text-text" style={{ fontFamily: 'var(--font-display)' }}>
                    {entry.drops}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
