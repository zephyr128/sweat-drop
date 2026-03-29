'use client';

import { useState, useEffect } from 'react';
import { updateGymMobileListing } from '@/lib/actions/gym-actions';
import { toast } from 'sonner';

interface MobileListingToggleProps {
  gymId: string;
  initialEnabled: boolean;
  /** Shorter label for table cells */
  compact?: boolean;
}

/**
 * @deprecated Filename kept for import compat. Component renamed internally.
 * TODO: rename file to MobileListingToggle.tsx in a follow-up cleanup.
 */
export { MobileListingToggle as PilotVisibilityToggle };

export function MobileListingToggle({
  gymId,
  initialEnabled,
  compact = false,
}: MobileListingToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  const handleToggle = async (newValue: boolean) => {
    setLoading(true);
    try {
      const result = await updateGymMobileListing(gymId, newValue);

      if (result.success) {
        setEnabled(newValue);
        toast.success(
          newValue
            ? 'Gym is now visible in the mobile app'
            : 'Gym is now hidden from the mobile app',
        );
      } else {
        toast.error(result.error || 'Failed to update mobile listing');
        setEnabled(!newValue);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update mobile listing';
      toast.error(message);
      setEnabled(!newValue);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={compact ? 'flex items-center justify-center' : 'flex items-center justify-between'}>
      {!compact && (
        <div>
          <label className="text-sm font-medium text-white">Visible in mobile app</label>
          <p className="text-xs text-[#808080] mt-1">
            Members see this gym in the mobile app gym list when enabled.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => handleToggle(!enabled)}
        disabled={loading}
        title={
          enabled
            ? 'Visible in mobile app gym list'
            : 'Hidden from mobile app gym list'
        }
        className={`
          relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
          ${enabled ? 'bg-[#00E5FF]' : 'bg-[#1A1A1A]'}
          ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-[#00E5FF] focus:ring-offset-2 focus:ring-offset-[#0A0A0A]
        `}
        aria-label={enabled ? 'Hide from mobile app' : 'Show in mobile app'}
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
