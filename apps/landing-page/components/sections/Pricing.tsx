'use client';

import { memo, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { GlassCard } from '@/components/ui/GlassCard';

export const Pricing = memo(function Pricing() {
  const { t } = useLanguage();
  const [isAnnual, setIsAnnual] = useState(false);
  const { openModal } = useModal();

  const plans = useMemo(() => [
    {
      key: 'starter' as const,
      name: t.pricing.plans.starter,
      price: { monthly: 39, annual: 390 },
      sensors: 5,
      members: 150,
      features: [
        t.pricing.plans.features.receptionCheckin,
        t.pricing.plans.features.weeklyLeaderboard,
        t.pricing.plans.features.basicRewardStore,
        t.pricing.plans.features.emailSupport,
        t.pricing.plans.features.cardioZoneCoverage,
      ],
      highlight: false,
    },
    {
      key: 'growth' as const,
      name: t.pricing.plans.growth,
      price: { monthly: 79, annual: 790 },
      sensors: 10,
      members: 300,
      features: [
        t.pricing.plans.features.receptionCheckin,
        t.pricing.plans.features.monthlyLeaderboard,
        t.pricing.plans.features.fullRewardStore,
        t.pricing.plans.features.twoActiveChallenges,
        t.pricing.plans.features.retentionDashboard,
        t.pricing.plans.features.reEngagementNotifications,
        t.pricing.plans.features.prioritySupport,
      ],
      highlight: true,
    },
    {
      key: 'pro' as const,
      name: t.pricing.plans.pro,
      price: { monthly: 149, annual: 1490 },
      sensors: 20,
      members: 600,
      features: [
        t.pricing.plans.features.receptionCheckin,
        t.pricing.plans.features.allLeaderboards,
        t.pricing.plans.features.unlimitedChallenges,
        t.pricing.plans.features.atRiskMemberAlerts,
        t.pricing.plans.features.sweatArenaSupport,
        t.pricing.plans.features.dedicatedOnboardingCall,
      ],
      highlight: false,
    },
    {
      key: 'elite' as const,
      name: t.pricing.plans.elite,
      price: { monthly: 249, annual: 2490 },
      sensors: 40,
      members: 'unlimited',
      features: [
        t.pricing.plans.features.receptionCheckin,
        t.pricing.plans.features.everythingInPro,
        t.pricing.plans.features.upToThreeLocations,
        t.pricing.plans.features.apiAccess,
        t.pricing.plans.features.quarterlyBusinessReview,
        t.pricing.plans.features.accountManager,
      ],
      highlight: false,
    },
  ], [t]);

  const handlePilotClick = (planKey: 'starter' | 'growth' | 'pro' | 'elite') => {
    openModal('apply-pilot', { initialPlan: planKey });
  };

  return (
    <section id="pricing" className="py-24 relative bg-bg-card">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="mono text-[10px] uppercase tracking-[3px] text-accent mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
            {t.pricing.badge}
          </p>
          <h2 className="display text-5xl sm:text-6xl md:text-7xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.pricing.title}
          </h2>
          <p className="text-lg text-text-2">{t.pricing.subtitle}</p>
        </div>

        {/* Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] rounded-[980px] p-1">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-6 py-2.5 rounded-lg font-sans text-xs font-medium transition-colors ${
                !isAnnual
                  ? 'bg-white text-[#001a18]'
                  : 'text-text-2 hover:text-text'
              }`}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.pricing.monthly}
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-6 py-2.5 rounded-lg font-sans text-xs font-medium transition-colors ${
                isAnnual
                  ? 'bg-white text-[#001a18]'
                  : 'text-text-2 hover:text-text'
              }`}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.pricing.annual}
            </button>
          </div>
        </div>
      </div>

      {/* Plans Grid - Full width on mobile */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12 items-stretch">
          {plans.map((plan) => {
            const price = isAnnual ? plan.price.annual : plan.price.monthly;
            
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="flex w-full"
              >
                <GlassCard
                  variant={plan.highlight ? 'featured' : 'pricing'}
                  className="p-6 relative w-full"
                >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="display text-[11px] bg-accent text-[#001a18] px-3 py-1 rounded-full" style={{ fontFamily: 'var(--font-display)' }}>
                      {t.pricing.mostPopular}
                    </span>
                  </div>
                )}

                <div className="mono text-[11px] uppercase tracking-[3px] text-accent mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                  {plan.name}
                </div>

                <div className="mb-6">
                  <div className="display text-6xl text-text mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    €{price}
                  </div>
                  <div className="text-sm text-text-2">/{isAnnual ? t.pricing.perYear : t.pricing.perMonth}</div>
                  {isAnnual && (
                    <div className="mono text-[10px] text-text-3 mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
                      (€{Math.round(price / 12)}{t.pricing.perMonth})
                    </div>
                  )}
                </div>

                <div className="space-y-3 mb-6 pb-6 border-b border-border">
                  <div className="flex items-center gap-2 text-sm text-text-2">
                    <span>🏋️</span>
                    <span>{t.pricing.upToMachines} {plan.sensors} {t.pricing.machines}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text-2">
                    <span>👥</span>
                    <span>
                      {typeof plan.members === 'string' && plan.members === 'unlimited' 
                        ? t.pricing.unlimited 
                        : `${t.pricing.upTo} ${plan.members}`} {t.pricing.members}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6 flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-text-2">
                      <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePilotClick(plan.key)}
                  className="w-full font-sans text-[15px] font-semibold bg-accent text-[#001a18] px-6 py-3 rounded-lg hover:bg-[#00f0d6] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)] active:scale-[0.98] transition-all mt-auto"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {t.pricing.startFreePilot}
                </button>
                </GlassCard>
              </motion.div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Enterprise Callout */}
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center border-t border-border pt-12">
          <p className="text-text-2 mb-2">
            {t.pricing.enterprise.text}
            <button
              onClick={() => openModal('contact')}
              className="text-accent hover:underline ml-1"
            >
              {t.pricing.enterprise.link}
            </button>
          </p>
        </div>
      </div>
    </section>
  );
});
