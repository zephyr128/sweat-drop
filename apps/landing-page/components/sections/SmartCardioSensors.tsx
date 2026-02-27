'use client';

import { memo, useState } from 'react';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { Bike, Activity, TrendingUp, Lock, Link as LinkIcon, Zap } from 'lucide-react';
import Image from 'next/image';
import { useLanguage } from '@/lib/use-language';

export const SmartCardioSensors = memo(function SmartCardioSensors() {
  const { t } = useLanguage();
  const [hoveredLocked, setHoveredLocked] = useState<string | null>(null);

  const activeDevices = [
    { name: 'Bike', icon: Bike },
    { name: 'Treadmill', icon: Activity },
    { name: 'Elliptical', icon: TrendingUp },
  ];

  const roadmapItems = [
    {
      id: 'smart-pin',
      name: t.smartCardioSensors.futureResistance.smartPin.name,
      description: t.smartCardioSensors.futureResistance.smartPin.description,
      icon: Lock,
    },
    {
      id: 'smart-carabiner',
      name: t.smartCardioSensors.futureResistance.smartCarabiner.name,
      description: t.smartCardioSensors.futureResistance.smartCarabiner.description,
      icon: LinkIcon,
    },
    {
      id: 'universal-motion',
      name: t.smartCardioSensors.futureResistance.universalMotion.name,
      description: t.smartCardioSensors.futureResistance.universalMotion.description,
      icon: Zap,
    },
  ];

  return (
    <section className="py-32 px-4 sm:px-6 lg:px-8" aria-labelledby="smart-cardio-sensors">
      <div className="container mx-auto max-w-7xl">
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

        {/* Smart Cardio Ecosystem - Active */}
        <ScrollReveal delay={0.1}>
          <div className="mb-20">
            <div className="text-center mb-12">
              <h3
                className="text-3xl sm:text-4xl font-black tracking-tighter mb-4 text-white"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {t.smartCardioSensors.cardioEcosystem.title}
              </h3>
              <p className="text-lg text-primary/80 font-medium">
                {t.smartCardioSensors.cardioEcosystem.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              {activeDevices.map((device) => {
                const Icon = device.icon;
                return (
                  <div
                    key={device.name}
                    className="group relative p-8 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 text-center hover:border-primary/50 hover:shadow-[0_0_30px_rgba(0,229,255,0.3)] transition-all"
                  >
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Icon className="w-12 h-12 text-primary mx-auto mb-4 relative z-10 group-hover:scale-110 transition-transform" />
                    <h3 className="text-xl font-bold text-white mb-2 relative z-10">{device.name}</h3>
                    <div className="absolute top-4 right-4">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Image */}
            <div className="relative w-full h-[400px] md:h-[500px] rounded-3xl overflow-hidden bg-white/5 backdrop-blur-lg border border-white/10">
              <Image
                src="/bike-sensor.png"
                alt="Smart sensor on bike"
                fill
                className="object-cover relative z-10"
                priority
              />
            </div>
          </div>
        </ScrollReveal>

        {/* The Future of Resistance - Roadmap */}
        <ScrollReveal delay={0.2}>
          <div className="mt-24">
            <div className="text-center mb-12">
              <h3
                className="text-3xl sm:text-4xl font-black tracking-tighter mb-4 text-white/70"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {t.smartCardioSensors.futureResistance.title}
              </h3>
              <p className="text-sm text-white/50 uppercase tracking-wider">
                {t.smartCardioSensors.futureResistance.subtitle}
              </p>
            </div>

            {/* Bento Grid for Roadmap */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {roadmapItems.map((item) => {
                const Icon = item.icon;
                const isHovered = hoveredLocked === item.id;
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredLocked(item.id)}
                    onMouseLeave={() => setHoveredLocked(null)}
                    className="group relative p-8 rounded-2xl bg-white/5 backdrop-blur-lg border border-white/10 text-center opacity-60 grayscale transition-all cursor-pointer overflow-hidden"
                    style={{
                      filter: isHovered ? 'grayscale(0%)' : 'grayscale(100%)',
                      opacity: isHovered ? 0.9 : 0.6,
                    }}
                  >
                    {/* Lock overlay */}
                    <div className="absolute inset-0 backdrop-blur-md bg-black/20 rounded-2xl" />
                    <div className="absolute top-4 right-4 z-20">
                      <Lock className="w-5 h-5 text-white/50 group-hover:text-primary transition-colors" />
                    </div>

                    {/* Content */}
                    <div className="relative z-10">
                      <Icon className="w-12 h-12 text-white/50 mx-auto mb-4 group-hover:text-primary transition-colors" />
                      <h3 className="text-xl font-bold text-white/70 mb-3 group-hover:text-white transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-sm text-white/50 leading-relaxed mb-4 group-hover:text-white/70 transition-colors">
                        {item.description}
                      </p>
                    </div>

                    {/* Hover effect - Beta Waitlist */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-sm rounded-2xl transition-opacity ${
                        isHovered ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <div className="text-center">
                        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                          <Lock className="w-8 h-8 text-primary" />
                        </div>
                        <p className="text-sm font-bold text-primary uppercase tracking-wider">
                          {t.smartCardioSensors.futureResistance.joinBeta}
                        </p>
                      </div>
                    </div>

                    {/* Neon glow on hover */}
                    {isHovered && (
                      <div className="absolute inset-0 rounded-2xl border-2 border-primary/50 shadow-[0_0_40px_rgba(0,229,255,0.4)] animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
});
