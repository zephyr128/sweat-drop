'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { confirmRedemption, cancelRedemption, validateRedemptionCode } from '@/lib/actions/redemption-actions';
import { CheckCircle2, XCircle, Search, QrCode, Clock, CheckCircle } from 'lucide-react';
import { QRValidator } from '@/components/QRValidator';
import { supabase } from '@/lib/supabase-client';
import { formatDateTime } from '@/lib/utils/date';

interface Redemption {
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
  confirmed_by_profile?: {
    id: string;
    username: string;
  } | null;
}

interface RedemptionsManagerProps {
  gymId: string;
  initialPendingRedemptions: Redemption[];
  initialConfirmedRedemptions: Redemption[];
}

export function RedemptionsManager({
  gymId,
  initialPendingRedemptions,
  initialConfirmedRedemptions,
}: RedemptionsManagerProps) {
  const router = useRouter();
  const [pendingRedemptions, setPendingRedemptions] = useState<Redemption[]>(initialPendingRedemptions);
  const [confirmedRedemptions, setConfirmedRedemptions] = useState<Redemption[]>(initialConfirmedRedemptions);
  const [searchCode, setSearchCode] = useState('');
  const [searchResult, setSearchResult] = useState<Redemption | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'search'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleConfirm = async (redemptionId: string) => {
    setProcessingId(redemptionId);
    try {
      const result = await confirmRedemption(redemptionId, gymId);
      if (result.success) {
        // Refresh data from server to get complete redemption with confirmed_by_profile
        await refreshRedemptions();
        
        // Also update search result if it matches
        if (searchResult?.id === redemptionId) {
          // Refetch the redemption to get full details
          const { data } = await supabase
            .from('redemptions')
            .select(`
              *,
              profiles:user_id (id, username, email),
              rewards:reward_id (id, name, reward_type, price_drops, image_url),
              confirmed_by_profile:confirmed_by (id, username)
            `)
            .eq('id', redemptionId)
            .single();
          
          if (data) {
            setSearchResult(data as Redemption);
          }
        }
        
        toast.success('Redemption confirmed successfully');
      } else {
        toast.error(`Failed to confirm: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (redemptionId: string, reason?: string) => {
    if (!confirm('Cancel this redemption? Drops will be refunded to the user.')) return;

    setProcessingId(redemptionId);
    try {
      const result = await cancelRedemption(redemptionId, gymId, reason);
      if (result.success) {
        // Refresh data from server
        await refreshRedemptions();
        
        // Clear search result if it matches
        if (searchResult?.id === redemptionId) {
          setSearchResult(null);
          setSearchCode('');
        }
        
        toast.success('Redemption cancelled and drops refunded');
      } else {
        toast.error(`Failed to cancel: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSearch = async () => {
    if (!searchCode.trim()) {
      toast.error('Please enter a redemption code');
      return;
    }

    setIsSearching(true);
    try {
      const result = await validateRedemptionCode(searchCode.trim(), gymId);
      if (result.success && result.redemption) {
        setSearchResult(result.redemption as Redemption);
        setActiveTab('search');
        toast.success('Redemption found');
      } else {
        setSearchResult(null);
        toast.error(result.error || 'Redemption not found');
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const getRewardEmoji = (type: string) => {
    switch (type) {
      case 'coffee': return '☕';
      case 'protein': return '🥤';
      case 'discount': return '🎫';
      case 'merch': return '👕';
      default: return '🎁';
    }
  };

  const refreshRedemptions = async () => {
    setRefreshing(true);
    try {
      // Fetch fresh data from server
      const [pendingResult, confirmedResult] = await Promise.all([
        supabase
          .from('redemptions')
          .select(`
            *,
            profiles:user_id (id, username, email),
            rewards:reward_id (id, name, reward_type, price_drops, image_url)
          `)
          .eq('gym_id', gymId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('redemptions')
          .select(`
            *,
            profiles:user_id (id, username, email),
            rewards:reward_id (id, name, reward_type, price_drops, image_url)
          `)
          .eq('gym_id', gymId)
          .eq('status', 'confirmed')
          .order('confirmed_at', { ascending: false })
          .limit(50),
      ]);

      if (pendingResult.data) {
        setPendingRedemptions(pendingResult.data as Redemption[]);
      }
      if (confirmedResult.data) {
        setConfirmedRedemptions(confirmedResult.data as Redemption[]);
      }
    } catch (error) {
      // Error refreshing - fallback to router refresh
      // Fallback to router refresh
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleRedemptionConfirmed = () => {
    // Refresh data
    refreshRedemptions();
    setSearchResult(null);
    setSearchCode('');
  };

  return (
    <div>
      {/* QR Code Validator Section */}
      <div className="mb-8">
        <QRValidator gymId={gymId} onRedemptionConfirmed={handleRedemptionConfirmed} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#1A1A1A]">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'pending'
              ? 'text-[#00E5FF] border-[#00E5FF]'
              : 'text-[#808080] border-transparent hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending ({pendingRedemptions.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('confirmed')}
          className={`px-6 py-3 font-medium transition-colors border-b-2 ${
            activeTab === 'confirmed'
              ? 'text-[#00E5FF] border-[#00E5FF]'
              : 'text-[#808080] border-transparent hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Confirmed ({confirmedRedemptions.length})
          </div>
        </button>
        {searchResult && (
          <button
            onClick={() => setActiveTab('search')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'search'
                ? 'text-[#00E5FF] border-[#00E5FF]'
                : 'text-[#808080] border-transparent hover:text-white'
            }`}
          >
            Search Result
          </button>
        )}
      </div>

      {/* Content */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        {activeTab === 'pending' && (
          <div className="p-6">
            {pendingRedemptions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#808080]">No pending redemptions</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRedemptions.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg p-6 hover:border-[#00E5FF]/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="text-3xl">{getRewardEmoji(redemption.rewards?.reward_type || 'unknown')}</div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white mb-1">
                              {redemption.rewards?.name || 'Unknown Reward'}
                            </h3>
                            <p className="text-sm text-[#808080]">
                              {redemption.profiles?.username || 'Unknown User'} • {redemption.rewards?.reward_type || 'Unknown'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-4">
                          <div>
                            <p className="text-xs text-[#808080] mb-1">Redemption Code</p>
                            <code className="text-sm font-mono text-[#00E5FF] bg-[#0A0A0A] px-3 py-1 rounded">
                              {redemption.redemption_code}
                            </code>
                          </div>
                          <div>
                            <p className="text-xs text-[#808080] mb-1">Drops Spent</p>
                            <p className="text-lg font-bold text-[#00E5FF]">
                              {redemption.drops_spent} 💧
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[#808080] mb-1">Requested</p>
                            <p className="text-sm text-white">
                              {formatDateTime(redemption.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleConfirm(redemption.id)}
                          disabled={processingId === redemption.id}
                          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          {processingId === redemption.id ? 'Confirming...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => handleCancel(redemption.id)}
                          disabled={processingId === redemption.id}
                          className="px-6 py-3 bg-[#1A1A1A] border border-[#FF5252]/30 text-[#FF5252] rounded-lg font-medium hover:bg-[#FF5252]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <XCircle className="w-5 h-5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'confirmed' && (
          <div className="p-6">
            {confirmedRedemptions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#808080]">No confirmed redemptions</p>
              </div>
            ) : (
              <div className="space-y-4">
                {confirmedRedemptions.map((redemption) => (
                  <div
                    key={redemption.id}
                    className="bg-[#1A1A1A] border border-[#00E5FF]/20 rounded-lg p-6"
                  >
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{getRewardEmoji(redemption.rewards?.reward_type || 'unknown')}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-bold text-white">
                            {redemption.rewards?.name || 'Unknown Reward'}
                          </h3>
                          <span className="px-2 py-1 bg-[#00E5FF]/10 text-[#00E5FF] rounded text-xs font-medium">
                            Confirmed
                          </span>
                        </div>
                        <p className="text-sm text-[#808080] mb-4">
                          {redemption.profiles?.username || 'Unknown User'} • {redemption.drops_spent} drops
                        </p>
                        <div className="flex items-center gap-4 text-xs text-[#808080]">
                          <span>Code: <code className="text-[#00E5FF]">{redemption.redemption_code}</code></span>
                          <span>•</span>
                          <span>Confirmed: {redemption.confirmed_at ? formatDateTime(redemption.confirmed_at) : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'search' && searchResult && (
          <div className="p-6">
            <div className="bg-[#1A1A1A] border border-[#00E5FF]/30 rounded-lg p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="text-4xl">{getRewardEmoji(searchResult.rewards?.reward_type || 'unknown')}</div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">
                    {searchResult.rewards?.name || 'Unknown Reward'}
                  </h3>
                  <p className="text-sm text-[#808080] mb-4">
                    {searchResult.profiles?.username || 'Unknown User'} • {searchResult.rewards?.reward_type || 'Unknown'}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[#808080] mb-1">Redemption Code</p>
                      <code className="text-lg font-mono text-[#00E5FF] bg-[#0A0A0A] px-4 py-2 rounded block text-center">
                        {searchResult.redemption_code}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-[#808080] mb-1">Drops Spent</p>
                      <p className="text-2xl font-bold text-[#00E5FF] text-center">
                        {searchResult.drops_spent} 💧
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#1A1A1A]">
                    <p className="text-xs text-[#808080] mb-1">Status</p>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      searchResult.status === 'pending'
                        ? 'bg-[#FF9100]/10 text-[#FF9100]'
                        : searchResult.status === 'confirmed'
                        ? 'bg-[#00E5FF]/10 text-[#00E5FF]'
                        : 'bg-[#808080]/10 text-[#808080]'
                    }`}>
                      {searchResult.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              {searchResult.status === 'pending' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleConfirm(searchResult.id)}
                    disabled={processingId === searchResult.id}
                    className="flex-1 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {processingId === searchResult.id ? 'Confirming...' : 'Confirm Redemption'}
                  </button>
                  <button
                    onClick={() => handleCancel(searchResult.id)}
                    disabled={processingId === searchResult.id}
                    className="px-6 py-3 bg-[#1A1A1A] border border-[#FF5252]/30 text-[#FF5252] rounded-lg font-medium hover:bg-[#FF5252]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <XCircle className="w-5 h-5" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
