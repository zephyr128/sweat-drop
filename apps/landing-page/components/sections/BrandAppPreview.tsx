'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

const COLOR_OPTIONS = [
  { id: 'cyan', hex: '#00E5CC', label: 'Cyan' },
  { id: 'red', hex: '#EF4444', label: 'Red' },
  { id: 'orange', hex: '#F97316', label: 'Orange' },
  { id: 'green', hex: '#22C55E', label: 'Green' },
  { id: 'purple', hex: '#A855F7', label: 'Purple' },
  { id: 'blue', hex: '#3B82F6', label: 'Blue' },
] as const;

type AccentColorOption = (typeof COLOR_OPTIONS)[number];

export const BrandAppPreview = memo(function BrandAppPreview() {
  const { t } = useLanguage();
  const [accentColor, setAccentColor] = useState<AccentColorOption>(COLOR_OPTIONS[0]);

  return (
    <section
      id="brand-app-preview"
      className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 relative"
      aria-labelledby="brand-app-title"
    >
      <div className="container mx-auto max-w-6xl">
        {/* Title & subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-16"
        >
          <h2
            id="brand-app-title"
            className="font-display text-2xl sm:text-4xl md:text-5xl text-text mb-4 sm:mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t.brandAppPreview.title}
          </h2>
          <p className="text-base sm:text-lg text-text-2 max-w-2xl mx-auto leading-relaxed whitespace-pre-line">
            {t.brandAppPreview.subtitle}
          </p>
        </motion.div>

        {/* Phone mockup on top on mobile, side-by-side on desktop */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-8 lg:gap-16 items-center"
        >
          {/* Left: color swatches + what you customize */}
          <div className="w-full">
            <p className="mono text-xs uppercase tracking-widest text-text-3 mb-3 text-center lg:text-left" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.brandAppPreview.tryYourColor}
            </p>
            <div className="flex flex-wrap justify-center lg:justify-start gap-2.5 sm:gap-3 mb-8 sm:mb-10">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAccentColor(opt)}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg"
                  style={{
                    backgroundColor: opt.hex,
                    borderColor: accentColor.id === opt.id ? '#fff' : 'rgba(255,255,255,0.2)',
                    boxShadow: accentColor.id === opt.id ? `0 0 20px ${opt.hex}60` : 'none',
                  }}
                  aria-label={opt.label}
                  aria-pressed={accentColor.id === opt.id}
                />
              ))}
            </div>

            <p className="font-semibold text-text mb-3 text-center lg:text-left" style={{ fontFamily: 'var(--font-body)' }}>
              {t.brandAppPreview.whatYouCustomize}
            </p>
            <ul className="space-y-2 max-w-sm mx-auto lg:mx-0">
              {[
                t.brandAppPreview.primaryColor,
                t.brandAppPreview.gymName,
                t.brandAppPreview.yourLogo,
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-3 text-text-2 text-sm sm:text-base">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{ backgroundColor: `${accentColor.hex}20` }}>
                    <Check className="w-3 h-3" style={{ color: accentColor.hex }} />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right (top on mobile): phone mockup with dynamic accent */}
          <div className="flex justify-center">
            <div className="relative w-[200px] sm:w-[260px]">
              <div
                className="absolute inset-0 rounded-full blur-3xl opacity-20 sm:opacity-30"
                style={{ backgroundColor: accentColor.hex, transform: 'scale(1.8)' }}
                aria-hidden="true"
              />
              <motion.div
                key={accentColor.id}
                initial={{ opacity: 0.8, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="relative bg-bg-card border-[1.5px] rounded-[32px] sm:rounded-[40px] p-4 sm:p-6 shadow-2xl"
                style={{
                  borderColor: `${accentColor.hex}40`,
                  boxShadow: `0 0 60px ${accentColor.hex}15`,
                }}
              >
                {/* Drops card */}
                <div className="bg-lime rounded-xl sm:rounded-2xl p-2.5 sm:p-3 mb-2 sm:mb-3">
                  <div className="mono text-[7px] sm:text-[8px] text-[#2a4a00] tracking-[2px] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
                    💧 AVAILABLE DROPS
                  </div>
                  <div className="font-display text-3xl sm:text-4xl text-[#0a1500] leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    1,240
                  </div>
                </div>
                {/* Stats row with accent color */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {[
                    { val: '4', lbl: 'Sessions' },
                    { val: '#7', lbl: 'Rank' },
                    { val: '🔥5', lbl: 'Streak' },
                  ].map((stat) => (
                    <div key={stat.lbl} className="bg-bg-card2 rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-center">
                      <div className="font-display text-base sm:text-lg mb-0.5" style={{ fontFamily: 'var(--font-display)', color: accentColor.hex }}>
                        {stat.val}
                      </div>
                      <div className="mono text-[6px] sm:text-[7px] text-text-3 tracking-[1px]" style={{ fontFamily: 'var(--font-mono)' }}>
                        {stat.lbl}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  className="mt-2 sm:mt-3 h-1.5 sm:h-2 rounded-full"
                  style={{ backgroundColor: `${accentColor.hex}50` }}
                  aria-hidden="true"
                />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
});
