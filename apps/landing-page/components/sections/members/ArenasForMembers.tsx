'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

export const ArenasForMembers = memo(function ArenasForMembers() {
  const { t } = useLanguage();
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div>
            <h2 className="display text-3xl sm:text-4xl text-text mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {t.arenasForMembers.title}
            </h2>
            <p className="text-lg text-text-2 leading-relaxed mb-6">
              {t.arenasForMembers.description.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.arenasForMembers.description.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>
            <p className="text-text-2 text-sm mb-6">
              {t.arenasForMembers.note.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.arenasForMembers.note.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>
            <Link
              href="/sweat-arenas"
              className="inline-flex items-center gap-2 display text-lg text-accent hover:text-accent/80 transition-colors"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.arenasForMembers.learnMore}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          {/* Right: Arena Card Mockup */}
          <div className="card card-accent p-6 border-orange/30">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="mono text-xs text-orange" style={{ fontFamily: 'var(--font-mono)' }}>
                  {t.arenasForMembers.visual.sponsoredBy}
                </span>
                <span className="mono text-xs text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
                  {t.arenasForMembers.visual.daysLeft}
                </span>
              </div>
              <div className="display text-2xl text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {t.arenasForMembers.visual.arenaName}
              </div>
              <div className="text-sm text-text-2 mb-4">
                {t.arenasForMembers.visual.membersCompeting}
              </div>
              <div className="pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <span>🏆</span>
                  <span className="text-sm text-text">{t.arenasForMembers.visual.prize}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
