'use client';

import { useState, useEffect } from 'react';
import { updateGymSmartCoach } from '@/lib/actions/gym-actions';
import { toast } from 'sonner';

interface SmartCoachToggleProps {
  gymId: string;
  initialEnabled: boolean;
}

export function SmartCoachToggle({ gymId, initialEnabled }: SmartCoachToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  // Sync state when initialEnabled prop changes (e.g., after page refresh)
  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const handleToggle = async (newValue: boolean) => {
    setLoading(true);
    try {
      const result = await updateGymSmartCoach(gymId, newValue);
      
      if (result.success) {
        setEnabled(newValue);
        toast.success(
          `SmartCoach ${newValue ? 'enabled' : 'disabled'} for this gym`
        );
      } else {
        toast.error(result.error || 'Failed to update SmartCoach status');
        // Revert to previous value on error
        setEnabled(!newValue);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update SmartCoach status');
      // Revert to previous value on error
      setEnabled(!newValue);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <label className="text-sm font-medium text-white">SmartCoach Feature</label>
        <p className="text-xs text-[#808080] mt-1">
          Enable or disable SmartCoach workout plans for this gym
        </p>
      </div>
      <button
        type="button"
        onClick={() => handleToggle(!enabled)}
        disabled={loading}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${enabled ? 'bg-[#00E5FF]' : 'bg-[#1A1A1A]'}
          ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-[#00E5FF] focus:ring-offset-2 focus:ring-offset-[#0A0A0A]
        `}
        aria-label={enabled ? 'Disable SmartCoach' : 'Enable SmartCoach'}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${enabled ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  );
}
