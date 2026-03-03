'use client';

import { memo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/use-language';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactModal = memo(function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    locations: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = t.contact.errors.required;
    if (!formData.company.trim()) newErrors.company = t.contact.errors.required;
    if (!formData.email.trim() || !formData.email.includes('@')) {
      newErrors.email = t.contact.errors.email;
    }
    if (!formData.phone.trim()) newErrors.phone = t.contact.errors.required;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSuccess(true);
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting contact:', error);
      alert(t.contact.errorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t.contact.successTitle}>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg text-text mb-6">
            {t.contact.successMessage}
          </p>
          <Button onClick={onClose} variant="primary" className="w-full">
            {t.contact.close}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.contact.title}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={t.contact.fields.name}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.contact.fields.company}
          value={formData.company}
          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
          error={errors.company}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.contact.fields.email}
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={errors.email}
          required
          disabled={isSubmitting}
        />
        <Input
          label={t.contact.fields.phone}
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          error={errors.phone}
          required
          disabled={isSubmitting}
        />
        <Select
          label={t.contact.fields.locations}
          value={formData.locations}
          onChange={(e) => setFormData({ ...formData, locations: e.target.value })}
          options={[
            { value: '', label: t.contact.locations.select },
            { value: '3-5', label: t.contact.locations.threeToFive },
            { value: '6-10', label: t.contact.locations.sixToTen },
            { value: '10-20', label: t.contact.locations.tenToTwenty },
            { value: '20+', label: t.contact.locations.twentyPlus },
          ]}
          disabled={isSubmitting}
        />
        <Textarea
          label={t.contact.fields.message}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          disabled={isSubmitting}
          rows={4}
        />
        <div className="flex gap-4 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting} className="flex-1">
            {t.contact.cancel}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} className="flex-1">
            {t.contact.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
