'use client';

import { memo, useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/use-language';

interface SponsorProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: 'local' | 'regional' | 'network' | undefined;
  founding?: boolean;
}

export const SponsorProposalModal = memo(function SponsorProposalModal({
  isOpen,
  onClose,
  initialPlan,
  founding = false,
}: SponsorProposalModalProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    company: '',
    name: '',
    email: '',
    phone: '',
    website: '',
    plan: initialPlan || '',
    startDate: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (initialPlan) {
      setFormData((prev) => ({ ...prev, plan: initialPlan }));
    }
  }, [initialPlan]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.company.trim()) newErrors.company = t.sponsorProposal.errors.required;
    if (!formData.name.trim()) newErrors.name = t.sponsorProposal.errors.required;
    if (!formData.email.trim() || !formData.email.includes('@')) {
      newErrors.email = t.sponsorProposal.errors.email;
    }
    if (!formData.phone.trim()) newErrors.phone = t.sponsorProposal.errors.required;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/sponsor-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, founding }),
      });

      if (response.ok) {
        setIsSuccess(true);
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
      <Modal isOpen={isOpen} onClose={onClose} title={t.sponsorProposal.successTitle}>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-orange/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg text-text mb-6">
            {t.sponsorProposal.successMessage}
          </p>
          <Button onClick={onClose} variant="primary" className="w-full">
            {t.sponsorProposal.close}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.sponsorProposal.title}>
      {founding && (
        <div className="mb-6 p-4 rounded-2xl bg-orange/10 border border-orange/20">
          <p className="text-sm text-orange font-medium">
            {t.sponsorProposal.foundingBadge}
          </p>
          <p className="text-xs text-text-2 mt-1">
            {t.sponsorProposal.foundingNote}
          </p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={t.sponsorProposal.fields.company}
          value={formData.company}
          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          error={errors.company}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.sponsorProposal.fields.name}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.sponsorProposal.fields.email}
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={errors.email}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.sponsorProposal.fields.phone}
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          error={errors.phone}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.sponsorProposal.fields.website}
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          disabled={isSubmitting}
        />
        <Select
          label={t.sponsorProposal.fields.plan}
          value={formData.plan}
          onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
          options={[
            { value: '', label: t.sponsorProposal.planOptions.select },
            { value: 'local', label: t.sponsorProposal.planOptions.local },
            { value: 'regional', label: t.sponsorProposal.planOptions.regional },
            { value: 'network', label: t.sponsorProposal.planOptions.network },
            { value: 'not-sure', label: t.sponsorProposal.planOptions.notSure },
          ]}
          disabled={isSubmitting}
        />
        <Input
          label={t.sponsorProposal.fields.startDate}
          type="date"
          value={formData.startDate}
          onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
          disabled={isSubmitting}
        />
        <Textarea
          label={t.sponsorProposal.fields.message}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          placeholder={t.sponsorProposal.messagePlaceholder}
          disabled={isSubmitting}
          rows={4}
        />
        <div className="flex gap-4 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting} className="flex-1">
            {t.sponsorProposal.cancel}
          </Button>
          <Button type="submit" variant="orange" isLoading={isSubmitting} className="flex-1">
            {t.sponsorProposal.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
