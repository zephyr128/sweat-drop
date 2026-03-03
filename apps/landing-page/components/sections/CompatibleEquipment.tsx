'use client';

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Bike, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

const icons = [Activity, Bike, TrendingUp];
const equipmentKeys = ['treadmill', 'bike', 'elliptical'] as const;

export const CompatibleEquipment = memo(function CompatibleEquipment() {
  const { t } = useLanguage();
  
  const equipment = useMemo(() => equipmentKeys.map((key, index) => ({
    icon: icons[index],
    title: t.compatibleEquipment.equipment[key].title,
    description: t.compatibleEquipment.equipment[key].description,
    compatible: ['Life Fitness', 'Technogym', 'Matrix', 'Horizon', 'Shua'],
    compatibleLabel: t.compatibleEquipment.equipment[key].compatible,
  })), [t]);
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative bg-surface">
      <div className="container mx-auto max-w-6xl">
        <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-text text-center mb-12">
          {t.compatibleEquipment.title}
          <br />
          <span className="text-primary">{t.compatibleEquipment.titleHighlight}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {equipment.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
              >
                <GlassCard variant="default" className="p-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-2xl text-text mb-3">{item.title}</h3>
                <p className="text-text-secondary mb-4 leading-relaxed flex-grow">{item.description}</p>
                <div className="pt-4 border-t border-border mt-auto">
                  <p className="text-xs font-mono text-text-secondary mb-2">{item.compatibleLabel}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.compatible.map((brand) => (
                      <span
                        key={brand}
                        className="text-xs px-2 py-1 bg-surface border border-border rounded text-text-secondary"
                      >
                        {brand}
                      </span>
                    ))}
                  </div>
                </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-text-secondary font-mono text-sm">
          {t.compatibleEquipment.comingSoon}
        </p>
      </div>
    </section>
  );
});
