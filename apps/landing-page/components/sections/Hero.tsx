'use client';

import { memo, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { BorderBeam } from '@/components/ui/BorderBeam';
import { RequestDemoModal } from '@/components/modals/RequestDemoModal';
import { ApplyPilotModal } from '@/components/modals/ApplyPilotModal';
import { useLanguage } from '@/lib/use-language';

export const Hero = memo(function Hero() {
  const { t } = useLanguage();
  const [isRequestDemoOpen, setIsRequestDemoOpen] = useState(false);
  const [isApplyPilotOpen, setIsApplyPilotOpen] = useState(false);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-32" aria-label="Hero section">
      {/* Minimal background */}
      <div className="absolute inset-0 bg-background" aria-hidden="true" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* Main headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-8"
          >
            <h1
              className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter mb-6 text-white"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              SweatDrop
            </h1>
            <h2 className="text-2xl sm:text-3xl md:text-4xl text-white/70 mb-6 font-light">
              {t.heroMinimal.subtitle}
            </h2>
            <p className="text-lg text-white/60 max-w-2xl mx-auto mb-12">
              {t.heroMinimal.description}
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsRequestDemoOpen(true)}
              className="group relative px-8 py-4 bg-gradient-to-r from-primary to-primary-light text-background font-bold rounded-lg flex items-center gap-2 hover:shadow-[0_0_30px_rgba(0,229,255,0.5)] transition-all overflow-hidden"
              aria-label={t.heroMinimal.ctaPrimary}
            >
              <BorderBeam size={150} duration={8} colorFrom="#00E5FF" colorTo="#00B8CC" />
              <span className="relative z-20 flex items-center gap-2">
                {t.heroMinimal.ctaPrimary}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsApplyPilotOpen(true)}
              className="group relative px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-400 text-white font-bold rounded-lg flex items-center gap-2 hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all overflow-hidden"
              aria-label={t.heroMinimal.ctaSecondary}
            >
              <BorderBeam size={150} duration={8} delay={0.5} colorFrom="#8B5CF6" colorTo="#A78BFA" />
              <span className="relative z-20 flex items-center gap-2">
                {t.heroMinimal.ctaSecondary}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </span>
            </motion.button>
          </motion.div>

          {/* Hero image */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative w-full h-[500px] md:h-[600px] rounded-3xl overflow-hidden bg-white/5 backdrop-blur-lg border border-white/10"
            aria-label="Hero image"
          >
            <Image
              src="/hero.png"
              alt="SweatDrop Platform"
              fill
              className="object-cover"
              priority
            />
          </motion.div>
        </div>
      </div>

      <RequestDemoModal isOpen={isRequestDemoOpen} onClose={() => setIsRequestDemoOpen(false)} />
      <ApplyPilotModal isOpen={isApplyPilotOpen} onClose={() => setIsApplyPilotOpen(false)} />
    </section>
  );
});
