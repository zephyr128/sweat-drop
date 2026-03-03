'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Pill, Sparkles, Shirt } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const icons = [Pill, Sparkles, Shirt];

export const SponsorProfiles = memo(function SponsorProfiles() {
  const { t } = useLanguage();
  const profiles = useMemo(() => t.forSponsors.whoRunsArenas.profiles.map((profile, index) => ({
    ...profile,
    icon: icons[index],
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-bg-card">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-12">
          <h2 className="display text-4xl sm:text-5xl md:text-6xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.forSponsors.whoRunsArenas.title}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {profiles.map((profile, index) => {
            const Icon = profile.icon;
            return (
              <motion.div
                key={profile.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="card p-6"
              >
                <div className="w-12 h-12 rounded-lg bg-orange/10 border border-orange/20 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-orange" />
                </div>
                <h3 className="display text-xl text-text mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                  {profile.title}
                </h3>
                <p className="text-text-2 mb-4 leading-relaxed">{profile.description}</p>
                <p className="mono text-xs text-text-3" style={{ fontFamily: 'var(--font-mono)' }}>
                  Primeri: {profile.examples}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
