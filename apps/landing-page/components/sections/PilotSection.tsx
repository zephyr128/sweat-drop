'use client';

import { memo, useState } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { BorderBeam } from '@/components/ui/BorderBeam';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ApplyPilotModal } from '@/components/modals/ApplyPilotModal';
import { useLanguage } from '@/lib/use-language';

export const PilotSection = memo(function PilotSection() {
  const { t } = useLanguage();
  const [isApplyPilotOpen, setIsApplyPilotOpen] = useState(false);

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="pilot-section">
      <div className="container mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="text-center">
            <h2
              id="pilot-section"
              className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-6 text-white"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {t.pilotSection.title}
            </h2>
            <p className="text-xl text-white/70 mb-12 max-w-2xl mx-auto">
              {t.pilotSection.description}
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsApplyPilotOpen(true)}
              className="group relative px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-400 text-white font-bold rounded-lg flex items-center gap-2 hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all overflow-hidden mx-auto"
            >
              <BorderBeam size={150} duration={8} colorFrom="#8B5CF6" colorTo="#A78BFA" />
              <span className="relative z-20 flex items-center gap-2">
                {t.pilotSection.cta}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>
          </div>
        </ScrollReveal>
      </div>

      <ApplyPilotModal isOpen={isApplyPilotOpen} onClose={() => setIsApplyPilotOpen(false)} />
    </section>
  );
});
