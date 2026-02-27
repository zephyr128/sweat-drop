'use client';

import { memo } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { Bike, Activity, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { useLanguage } from '@/lib/use-language';

export const SmartCardioSensors = memo(function SmartCardioSensors() {
  const { t } = useLanguage();
  const devices = [
    { name: 'Bike', icon: Bike },
    { name: 'Treadmill', icon: Activity },
    { name: 'Elliptical', icon: TrendingUp },
  ];

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="smart-cardio-sensors">
      <div className="container mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2
              id="smart-cardio-sensors"
              className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter mb-6 text-white"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              {t.smartCardioSensors.title}
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              {t.smartCardioSensors.subtitle}
            </p>
          </div>
        </ScrollReveal>

        {/* Supported Devices */}
        <ScrollReveal delay={0.2}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {devices.map((device, index) => {
              const Icon = device.icon;
              return (
                <div
                  key={device.name}
                  className="p-8 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 text-center"
                >
                  <Icon className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">{device.name}</h3>
                </div>
              );
            })}
          </div>
        </ScrollReveal>

        {/* Image */}
        <ScrollReveal delay={0.3}>
          <div className="relative w-full h-[400px] md:h-[500px] rounded-3xl overflow-hidden bg-white/5 backdrop-blur-lg border border-white/10">
            <Image
              src="/bike-sensor.png"
              alt="Smart sensor on bike"
              fill
              className="object-cover relative z-10"
              priority
            />
          </div>
        </ScrollReveal>

        {/* Coming Next */}
        <ScrollReveal delay={0.4}>
          <div className="mt-16 text-center">
            <p className="text-sm text-white/50 uppercase tracking-wider mb-4">{t.smartCardioSensors.comingNext}</p>
            <div className="flex flex-wrap justify-center gap-6 text-white/70">
              <span>{t.smartCardioSensors.weightMachines}</span>
              <span>•</span>
              <span>{t.smartCardioSensors.freeWeights}</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
});
