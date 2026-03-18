'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/use-language';

interface FormData {
  companyName: string;
  yourName: string;
  email: string;
  phone: string;
  interestedIn: string;
  idealStart: string;
}

export const ProposalForm = memo(function ProposalForm() {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    yourName: '',
    email: '',
    phone: '',
    interestedIn: '',
    idealStart: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/sponsor-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSuccess(true);
        setFormData({
          companyName: '',
          yourName: '',
          email: '',
          phone: '',
          interestedIn: '',
          idealStart: '',
        });
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting proposal:', error);
      alert(t.sponsorProposal.errorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
        <div className="container mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-12 text-center"
          >
            <div className="w-16 h-16 bg-orange/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-8 h-8 text-orange"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="display text-2xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              {t.sponsorProposal.successTitle}
            </h3>
            <p className="text-text-2 mb-6">
              {t.sponsorProposal.successNote.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < t.sponsorProposal.successNote.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="container mx-auto max-w-2xl">
        <div className="text-center mb-12">
          <h2 className="display text-3xl sm:text-4xl text-text mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            {t.sponsorProposal.formTitle}
          </h2>
          <p className="text-lg text-text-2">
            {t.sponsorProposal.formSubtitle.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.sponsorProposal.formSubtitle.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          onSubmit={handleSubmit}
          className="card p-8 space-y-6"
        >
          <Input
            label={t.sponsorProposal.fields.company}
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Input
            label={t.sponsorProposal.fields.name}
            value={formData.yourName}
            onChange={(e) => setFormData({ ...formData, yourName: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Input
            label={t.sponsorProposal.fields.email}
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Input
            label={t.sponsorProposal.fields.phone}
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Select
            label={t.sponsorProposal.fields.plan}
            value={formData.interestedIn}
            onChange={(e) => setFormData({ ...formData, interestedIn: e.target.value })}
            options={[
              { value: '', label: t.sponsorProposal.planOptionsShort.select },
              { value: 'local', label: t.sponsorProposal.planOptionsShort.local },
              { value: 'regional', label: t.sponsorProposal.planOptionsShort.regional },
              { value: 'network', label: t.sponsorProposal.planOptionsShort.network },
              { value: 'not-sure', label: t.sponsorProposal.planOptionsShort.notSure },
            ]}
            required
            disabled={isSubmitting}
          />

          <Input
            label={t.sponsorProposal.fields.startDate}
            type="date"
            value={formData.idealStart}
            onChange={(e) => setFormData({ ...formData, idealStart: e.target.value })}
            disabled={isSubmitting}
          />

          <div className="pt-4">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              className="w-full display text-lg bg-orange text-background hover:bg-orange/90"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.sponsorProposal.submit}
            </Button>
          </div>

          <p className="text-center text-sm text-text-2">
            {t.sponsorProposal.formFooter.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < t.sponsorProposal.formFooter.split('\n').length - 1 && <br />}
              </span>
            ))}
          </p>
        </motion.form>
      </div>
    </section>
  );
});
