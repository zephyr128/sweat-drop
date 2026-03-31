export type RewardClaimErrorKind =
  | 'limit_once'
  | 'limit_daily'
  | 'limit_weekly'
  | 'limit_monthly'
  | 'fraud_blocked'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'verification_required'
  | 'unknown';

export function classifyRewardClaimError(message?: string | null): RewardClaimErrorKind {
  const msg = (message || '').toLowerCase();
  if (!msg) return 'unknown';
  if (msg.includes('verification_required') || msg.includes('verification required')) return 'verification_required';
  if (msg.includes('already claimed') || msg.includes('once')) return 'limit_once';
  if (msg.includes('daily')) return 'limit_daily';
  if (msg.includes('weekly')) return 'limit_weekly';
  if (msg.includes('monthly')) return 'limit_monthly';
  if (msg.includes('out of band') || msg.includes('out-of-band') || msg.includes('strict') || msg.includes('temporarily unavailable') || msg.includes('policy')) {
    return 'temporarily_unavailable';
  }
  if (msg.includes('fraud') || msg.includes('abuse') || msg.includes('risk') || msg.includes('blocked')) {
    return 'fraud_blocked';
  }
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('throttle') || msg.includes('429')) {
    return 'rate_limited';
  }
  return 'unknown';
}
