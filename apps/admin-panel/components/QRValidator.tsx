'use client';

import { useState } from 'react';
import { validateRedemptionCode, confirmRedemption } from '@/lib/actions/redemption-actions';
import { toast } from 'sonner';
import { QrCode, CheckCircle2 } from 'lucide-react';

interface QRValidatorProps {
  gymId: string;
  onRedemptionConfirmed?: () => void;
}

export function QRValidator({ gymId, onRedemptionConfirmed }: QRValidatorProps) {
  const [redemptionCode, setRedemptionCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: 'success' | 'error' | null;
    message: string;
    redemption?: any;
  } | null>(null);

  const handleValidate = async () => {
    if (!redemptionCode.trim()) {
      setResult({ type: 'error', message: 'Please enter a redemption code' });
      toast.error('Please enter a redemption code');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const validationResult = await validateRedemptionCode(redemptionCode.trim().toUpperCase(), gymId);

      if (!validationResult.success || !validationResult.redemption) {
        setResult({
          type: 'error',
          message: validationResult.error || 'Redemption not found',
        });
        toast.error(validationResult.error || 'Redemption not found');
        return;
      }

      const redemption = validationResult.redemption;

      if (redemption.status === 'confirmed') {
        setResult({
          type: 'error',
          message: 'This redemption has already been confirmed',
          redemption: redemption,
        });
        toast.warning('This redemption has already been confirmed');
      } else if (redemption.status === 'cancelled') {
        setResult({
          type: 'error',
          message: 'This redemption has been cancelled',
          redemption: redemption,
        });
        toast.warning('This redemption has been cancelled');
      } else {
        setResult({
          type: 'success',
          message: 'Redemption found and ready to confirm',
          redemption: redemption,
        });
        toast.success('Redemption found');
      }
    } catch (err: any) {
      setResult({
        type: 'error',
        message: err.message || 'Failed to validate redemption',
      });
      toast.error(err.message || 'Failed to validate redemption');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!result?.redemption) return;

    setLoading(true);

    try {
      const confirmResult = await confirmRedemption(result.redemption.id, gymId);

      if (!confirmResult.success) {
        toast.error(confirmResult.error || 'Failed to confirm redemption');
        setResult({
          type: 'error',
          message: confirmResult.error || 'Failed to confirm redemption',
          redemption: result.redemption,
        });
        return;
      }

      toast.success('Redemption confirmed successfully!');
      setResult({
        type: 'success',
        message: 'Redemption confirmed successfully!',
        redemption: { ...result.redemption, status: 'confirmed' },
      });
      setRedemptionCode('');
      
      if (onRedemptionConfirmed) {
        onRedemptionConfirmed();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm redemption');
      setResult({
        type: 'error',
        message: err.message || 'Failed to confirm redemption',
        redemption: result.redemption,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <QrCode className="w-5 h-5 text-[#00E5FF]" />
          <h3 className="text-lg font-bold text-white">QR Code Scanner</h3>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={redemptionCode}
              onChange={(e) => setRedemptionCode(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && handleValidate()}
              placeholder="Scan or enter redemption code (e.g., RED-ABC12345)"
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none font-mono"
              autoFocus
            />
          </div>
          <button
            onClick={handleValidate}
            disabled={loading || !redemptionCode.trim()}
            className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? 'Checking...' : 'Validate'}
          </button>
        </div>
        <p className="text-xs text-[#808080] mt-2">
          Scan the QR code from the user's mobile app or enter the redemption code manually
        </p>
      </div>

      {result && (
        <div
          className={`p-6 rounded-xl border ${
            result.type === 'success'
              ? 'bg-[#00E5FF]/10 border-[#00E5FF]/30'
              : 'bg-[#FF5252]/10 border-[#FF5252]/30'
          }`}
        >
          <p className={`font-bold mb-4 ${
            result.type === 'success' ? 'text-[#00E5FF]' : 'text-[#FF5252]'
          }`}>
            {result.message}
          </p>
          {result.redemption && (
            <div className="space-y-3">
              <div className="bg-[#0A0A0A] rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#808080]">User:</span>
                  <span className="text-white font-medium">
                    {result.redemption.profiles?.username || result.redemption.profiles?.email || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#808080]">Reward:</span>
                  <span className="text-white font-medium">
                    {result.redemption.rewards?.name || 'Unknown'} ({result.redemption.drops_spent} drops)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#808080]">Code:</span>
                  <code className="text-[#00E5FF] font-mono font-bold">
                    {result.redemption.redemption_code || 'N/A'}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#808080]">Status:</span>
                  <span className={`font-medium ${
                    result.redemption.status === 'pending' ? 'text-[#FF9100]' :
                    result.redemption.status === 'confirmed' ? 'text-[#00E5FF]' :
                    'text-[#808080]'
                  }`}>
                    {result.redemption.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#808080]">Date:</span>
                  <span className="text-white text-sm">
                    {new Date(result.redemption.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              {result.type === 'success' && result.redemption.status === 'pending' && (
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {loading ? 'Confirming...' : 'Confirm Redemption'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
