'use client';

import { memo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/use-language';

interface ApplyPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan?: string | null;
}

interface FormData {
  fullName: string;
  gymName: string;
  cityCountry: string;
  activeMembers: string;
  cardioMachines: string;
  multipleLocations: string;
  whyJoin: string;
}

interface FormErrors {
  fullName?: string;
  gymName?: string;
  cityCountry?: string;
  activeMembers?: string;
  cardioMachines?: string;
  multipleLocations?: string;
  whyJoin?: string;
}

export const ApplyPilotModal = memo(function ApplyPilotModal({ isOpen, onClose, selectedPlan }: ApplyPilotModalProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    gymName: '',
    cityCountry: '',
    activeMembers: '',
    cardioMachines: '',
    multipleLocations: '',
    whyJoin: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateNumber = (value: string): boolean => {
    const num = parseInt(value, 10);
    return !isNaN(num) && num > 0;
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = t.applyPilot.errors.required;
    }

    if (!formData.gymName.trim()) {
      newErrors.gymName = t.applyPilot.errors.required;
    }

    if (!formData.cityCountry.trim()) {
      newErrors.cityCountry = t.applyPilot.errors.required;
    }

    if (!formData.activeMembers.trim()) {
      newErrors.activeMembers = t.applyPilot.errors.required;
    } else if (!validateNumber(formData.activeMembers)) {
      newErrors.activeMembers = t.applyPilot.errors.number;
    }

    if (!formData.cardioMachines.trim()) {
      newErrors.cardioMachines = t.applyPilot.errors.required;
    } else if (!validateNumber(formData.cardioMachines)) {
      newErrors.cardioMachines = t.applyPilot.errors.number;
    }

    if (!formData.multipleLocations) {
      newErrors.multipleLocations = t.applyPilot.errors.required;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/apply-pilot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          selectedPlan: selectedPlan || null,
        }),
      });

      if (response.ok) {
        setIsSuccess(true);
        setFormData({
          fullName: '',
          gymName: '',
          cityCountry: '',
          activeMembers: '',
          cardioMachines: '',
          multipleLocations: '',
          whyJoin: '',
        });
        setErrors({});
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsSuccess(false);
      setFormData({
        fullName: '',
        gymName: '',
        cityCountry: '',
        activeMembers: '',
        cardioMachines: '',
        multipleLocations: '',
        whyJoin: '',
      });
      setErrors({});
      onClose();
    }
  };

  const multipleLocationsOptions = [
    { value: 'yes', label: t.applyPilot.multipleLocations.yes },
    { value: 'no', label: t.applyPilot.multipleLocations.no },
  ];

  if (isSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title={t.applyPilot.title}>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl text-white/90 mb-6">{t.applyPilot.success}</p>
          <Button onClick={handleClose} variant="primary" className="w-full">
            {t.applyPilot.close}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t.applyPilot.title}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={t.applyPilot.fields.fullName}
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          error={errors.fullName}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.applyPilot.fields.gymName}
          value={formData.gymName}
          onChange={(e) => setFormData({ ...formData, gymName: e.target.value })}
          error={errors.gymName}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.applyPilot.fields.cityCountry}
          value={formData.cityCountry}
          onChange={(e) => setFormData({ ...formData, cityCountry: e.target.value })}
          error={errors.cityCountry}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.applyPilot.fields.activeMembers}
          type="number"
          min="1"
          value={formData.activeMembers}
          onChange={(e) => setFormData({ ...formData, activeMembers: e.target.value })}
          error={errors.activeMembers}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.applyPilot.fields.cardioMachines}
          type="number"
          min="1"
          value={formData.cardioMachines}
          onChange={(e) => setFormData({ ...formData, cardioMachines: e.target.value })}
          error={errors.cardioMachines}
          required
          disabled={isSubmitting}
        />

        <Select
          label={t.applyPilot.fields.multipleLocations}
          value={formData.multipleLocations}
          onChange={(e) => setFormData({ ...formData, multipleLocations: e.target.value })}
          options={multipleLocationsOptions}
          error={errors.multipleLocations}
          required
          disabled={isSubmitting}
        />

        <Textarea
          label={t.applyPilot.fields.whyJoin}
          value={formData.whyJoin}
          onChange={(e) => setFormData({ ...formData, whyJoin: e.target.value })}
          error={errors.whyJoin}
          required
          disabled={isSubmitting}
        />

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t.applyPilot.cancel}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} className="flex-1">
            {t.applyPilot.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
