'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const SweatArenasPreview = memo(function SweatArenasPreview() {
  const { t } = useLanguage();
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(at 80% 0%, rgba(255,85,0,0.06) 0px, transparent 50%)`,
        }}
        aria-hidden="true"
      />
      
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div>
            <p className="mono text-[10px] uppercase tracking-[3px] text-orange mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.sweatArenasPreview.badge}
            </p>
            <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.sweatArenasPreview.title}
              <br />
              <span className="text-accent">{t.sweatArenasPreview.titleHighlight}</span>
            </h2>
            <p className="text-lg text-text-2 leading-relaxed mb-8">
              {t.sweatArenasPreview.description.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.sweatArenasPreview.description.split('\n').length - 1 && ' '}
                </span>
              ))}
            </p>
            <Link
              href="/sweat-arenas"
              className="inline-flex items-center gap-2 font-sans text-[15px] font-medium text-accent hover:text-accent/80 transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.sweatArenasPreview.learnMore}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          {/* Right: Arena Card Mockup */}
          <GlassCard variant="orange" className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="mono text-xs text-orange" style={{ fontFamily: 'var(--font-mono)' }}>
                  {t.sweatArenasPreview.visual.sponsoredBy}
                </span>
                <span className="mono text-xs text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
                  {t.sweatArenasPreview.visual.daysLeft}
                </span>
              </div>
              <div className="display text-2xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {t.sweatArenasPreview.visual.arenaName}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-2">{t.sweatArenasPreview.visual.progress}</span>
                  <span className="text-text">67%</span>
                </div>
                <div className="h-2 bg-bg-card2 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange to-orange/60 rounded-full" style={{ width: '67%' }} />
                </div>
              </div>
              <div className="text-sm text-text-2">
                {t.sweatArenasPreview.visual.membersCompeting}
              </div>
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <span>🏆</span>
                  <span className="text-sm text-text">{t.sweatArenasPreview.visual.prize}</span>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </section>
  );
});
