'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

interface FormData {
  companyName: string;
  yourName: string;
  email: string;
  phone: string;
  interestedIn: string;
  idealStart: string;
}

export const ProposalForm = memo(function ProposalForm() {
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
      alert('Something went wrong. Please try again.');
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
              Proposal Request Received
            </h3>
            <p className="text-text-2 mb-6">
              We'll be in touch within 24 hours.
              <br />
              No sales pressure. Just numbers.
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
            YOUR CUSTOMERS ARE ALREADY AT THE GYM.
          </h2>
          <p className="text-lg text-text-2">
            Request a proposal and we'll send you projected numbers specific to your target audience and budget.
            <br />
            No commitment. Response within 24 hours.
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
            label="Company name"
            value={formData.companyName}
            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Input
            label="Your name"
            value={formData.yourName}
            onChange={(e) => setFormData({ ...formData, yourName: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Input
            label="Phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
            disabled={isSubmitting}
          />

          <Select
            label="Interested in"
            value={formData.interestedIn}
            onChange={(e) => setFormData({ ...formData, interestedIn: e.target.value })}
            options={[
              { value: '', label: 'Select...' },
              { value: 'local', label: 'Local' },
              { value: 'regional', label: 'Regional' },
              { value: 'network', label: 'Network' },
              { value: 'not-sure', label: 'Not sure' },
            ]}
            required
            disabled={isSubmitting}
          />

          <Input
            label="Ideal start date"
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
              Send Proposal Request
            </Button>
          </div>

          <p className="text-center text-sm text-text-2">
            We respond within 24 hours.
            <br />
            No sales pressure. Just numbers.
          </p>
        </motion.form>
      </div>
    </section>
  );
});
