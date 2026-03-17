'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { validateRedemptionCode, confirmRedemption, cancelRedemption } from '@/lib/actions/redemption-actions';
import { CheckCircle2, XCircle, Droplet, Gift, Clock, User, ShieldCheck } from 'lucide-react';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/utils/date';

interface RedemptionResult {
  id: string;
  redemption_code: string;
  drops_spent: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
  confirmed_at?: string;
  profiles: {
    id: string;
    username: string;
    email: string;
  } | null;
  rewards: {
    id: string;
    name: string;
    reward_type: string;
    price_drops: number;
    image_url?: string;
  } | null;
}

interface RedemptionVerifierProps {
  gymId: string;
}

export function RedemptionVerifier({ gymId }: RedemptionVerifierProps) {
  const [code, setCode] = useState(['', '', '', '']);
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleSearch = useCallback(async (fullCode: string) => {
    setIsSearching(true);
    setError(null);
    setResult(null);

    try {
      const res = await validateRedemptionCode(fullCode.toUpperCase(), gymId) as {
        success: boolean;
        redemption?: RedemptionResult;
        error?: string;
      };

      if (res.success && res.redemption) {
        setResult(res.redemption as RedemptionResult);
      } else {
        setError(res.error || 'Redemption not found');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSearching(false);
    }
  }, [gymId]);

  const handleInputChange = (index: number, value: string) => {
    // Only allow alphanumeric
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cleaned.length > 1) {
      // Handle paste
      const chars = cleaned.slice(0, 4).split('');
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (index + i < 4) {
          newCode[index + i] = char;
        }
      });
      setCode(newCode);
      const nextIndex = Math.min(index + chars.length, 3);
      inputRefs.current[nextIndex]?.focus();

      // Auto-submit if all 4 filled
      if (newCode.every((c) => c !== '')) {
        handleSearch(newCode.join(''));
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = cleaned;
    setCode(newCode);

    // Auto-advance
    if (cleaned && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 chars entered
    if (cleaned && index === 3) {
      const fullCode = [...newCode.slice(0, 3), cleaned].join('');
      if (fullCode.length === 4) {
        handleSearch(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleConfirm = async () => {
    if (!result) return;
    setIsProcessing(true);
    try {
      const res = await confirmRedemption(result.id, gymId);
      if (res.success) {
        toast.success('Redemption confirmed! Reward can be handed over.');
        resetState();
      } else {
        toast.error(res.error || 'Failed to confirm');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!result) return;
    if (!(await confirmAction({ title: 'Reject Redemption', message: 'Reject this redemption? Drops will be refunded to the member.', confirmLabel: 'Reject', variant: 'danger' }))) return;
    setIsProcessing(true);
    try {
      const res = await cancelRedemption(result.id, gymId, 'Rejected by staff');
      if (res.success) {
        toast.success('Redemption rejected. Drops refunded.');
        resetState();
      } else {
        toast.error(res.error || 'Failed to reject');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setCode(['', '', '', '']);
    setResult(null);
    setError(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Code Input */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-8 mb-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00E5FF]/10 mb-4">
            <ShieldCheck className="w-8 h-8 text-[#00E5FF]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Enter Redemption Code</h2>
          <p className="text-sm text-[#808080]">
            Ask the member for their 4-character code
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {code.map((char, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="text"
              maxLength={4}
              value={char}
              onChange={(e) => handleInputChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-16 h-20 text-center text-3xl font-mono font-bold bg-[#1A1A1A] border-2 border-[#333] rounded-xl text-white uppercase focus:border-[#00E5FF] focus:outline-none focus:ring-2 focus:ring-[#00E5FF]/20 transition-all"
              disabled={isSearching}
            />
          ))}
        </div>

        {isSearching && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[#00E5FF]">
              <div className="w-4 h-4 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Looking up code...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF5252]/10 border border-[#FF5252]/30 rounded-lg">
              <XCircle className="w-4 h-4 text-[#FF5252]" />
              <span className="text-sm text-[#FF5252]">{error}</span>
            </div>
            <button
              onClick={resetState}
              className="block mx-auto mt-4 text-sm text-[#00E5FF] hover:underline"
            >
              Try another code
            </button>
          </div>
        )}
      </div>

      {/* Result Card */}
      {result && (
        <div className="bg-[#0A0A0A] border border-[#00E5FF]/30 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#00E5FF]/10 to-transparent p-6 border-b border-[#1A1A1A]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center">
                <Gift className="w-7 h-7 text-[#00E5FF]" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">
                  {result.rewards?.name || 'Unknown Reward'}
                </h3>
                <p className="text-sm text-[#808080]">
                  {result.rewards?.reward_type || 'reward'}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                result.status === 'pending'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : result.status === 'confirmed'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[#808080]/10 text-[#808080] border border-[#808080]/30'
              }`}>
                {result.status}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-[#808080]" />
                <div>
                  <p className="text-xs text-[#808080]">Member</p>
                  <p className="text-sm font-medium text-white">
                    {result.profiles?.username || 'Unknown'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Droplet className="w-5 h-5 text-[#00E5FF]" />
                <div>
                  <p className="text-xs text-[#808080]">Drops Spent</p>
                  <p className="text-sm font-bold text-[#00E5FF]">
                    {result.drops_spent}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-[#808080]" />
                <div>
                  <p className="text-xs text-[#808080]">Claimed</p>
                  <p className="text-sm text-white">
                    {formatDateTime(result.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 text-center text-[#808080] font-mono text-xs leading-5">#</span>
                <div>
                  <p className="text-xs text-[#808080]">Code</p>
                  <p className="text-sm font-mono font-bold text-[#00E5FF]">
                    {result.redemption_code}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            {result.status === 'pending' && (
              <div className="flex gap-3 pt-4 border-t border-[#1A1A1A]">
                <button
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#00E5FF] text-black rounded-xl font-bold text-lg hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-6 h-6" />
                  {isProcessing ? 'Processing...' : 'Confirm & Hand Over'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="px-6 py-4 bg-[#1A1A1A] border border-[#FF5252]/30 text-[#FF5252] rounded-xl font-medium hover:bg-[#FF5252]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            )}

            {result.status === 'confirmed' && (
              <div className="pt-4 border-t border-[#1A1A1A]">
                <div className="flex items-center gap-2 justify-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">Already confirmed</span>
                </div>
                <button
                  onClick={resetState}
                  className="block mx-auto mt-3 text-sm text-[#00E5FF] hover:underline"
                >
                  Verify another code
                </button>
              </div>
            )}

            {result.status === 'cancelled' && (
              <div className="pt-4 border-t border-[#1A1A1A]">
                <div className="flex items-center gap-2 justify-center text-[#808080]">
                  <XCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">This redemption was cancelled</span>
                </div>
                <button
                  onClick={resetState}
                  className="block mx-auto mt-3 text-sm text-[#00E5FF] hover:underline"
                >
                  Verify another code
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
