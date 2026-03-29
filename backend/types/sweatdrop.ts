/**
 * SWEATDROP — Shared TypeScript Types
 *
 * Canonical type definitions shared across:
 *   - apps/admin-panel (Next.js)
 *   - apps/mobile-app (Expo/React Native)
 *   - backend/supabase (Edge Functions)
 *
 * IMPORTANT: These types represent the TARGET schema after all MVP migrations
 * are applied. If a column doesn't exist yet in the DB, the corresponding
 * property is marked with a JSDoc comment: @pending-migration
 *
 * Generated: 2026-03-02
 * Reference: docs/plans/mvp_full_audit_and_build_plan.md
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ENUMS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Database enum: public.user_role */
export type UserRole = 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user';

/** @pending-migration — needs CHECK constraint on gyms.subscription_plan */
export type SubscriptionPlan = 'starter' | 'growth' | 'pro' | 'elite';

/** Database CHECK constraint on machines.type — needs expansion */
export type MachineType = 'treadmill' | 'bike' | 'elliptical' | 'weight';

/** @pending-migration — needs CHECK constraint on machines.ble_protocol */
export type BLEProtocol = 'ftms' | 'fitshow' | 'magene' | 'ksfit';

/** Database enum or CHECK on drops_transactions.transaction_type */
export type TransactionType =
  | 'session'
  | 'badge'
  | 'streak'
  | 'challenge'
  | 'reward_claim'
  | 'manual'
  | 'expiry';

/** Status for reward claims / redemptions */
export type ClaimStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

/** Challenge category */
export type ChallengeType = 'individual' | 'group' | 'streak';

/** What metric the challenge tracks */
export type ScoringModel = 'total_drops' | 'distance_km' | 'days_visited';

/** Leaderboard time period */
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

/** Push notification event types */
export type NotificationTrigger =
  | 'session_ended'
  | 'badge_earned'
  | 'rank_overtaken'
  | 'reward_claimed'
  | 'streak_at_risk'
  | 'weekly_results'
  | 'inactive_7d'
  | 'inactive_14d'
  | 'drops_expiring_30d'
  | 'drops_expiring_7d';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  VALUE OBJECTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GymDayHours {
  open: string;
  close: string;
}

export type GymWorkingHours = {
  [day in 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun']?: GymDayHours;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CORE MODELS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** public.gyms */
export interface Gym {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  owner_id: string;
  logo_url: string | null;
  primary_color: string | null;
  background_image_url: string | null;
  /** @pending-migration — 4-digit alphanumeric join code */
  code: string | null;
  /** @pending-migration */
  subscription_plan: SubscriptionPlan;
  /** @pending-migration — replaces is_suspended */
  is_active: boolean;

  description: string | null;
  working_hours: GymWorkingHours | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  latitude: number | null;
  longitude: number | null;
  is_founding_partner: boolean;

  created_at: string;
  updated_at: string;
}

/** public.profiles */
export interface Profile {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  home_gym_id: string | null;
  role: UserRole;
  admin_gym_id: string | null;

  // ── Drops & Economy ──
  /** All-time drops earned (never decreases). Used for leaderboard ranking. */
  total_drops: number;
  /** @pending-migration — Spendable wallet balance (decreases on reward claim). */
  available_drops: number;
  /** @pending-migration — Resets every Monday 00:00. */
  weekly_drops: number;
  /** @pending-migration — Resets 1st of every month. */
  monthly_drops: number;

  // ── Streaks & Activity ──
  /** @pending-migration — Consecutive days of training. */
  streak_days: number;
  /** @pending-migration — Date of last completed session. */
  last_visit_date: string | null;

  // ── Push Notifications ──
  /** @pending-migration — Expo push token for notifications. */
  expo_push_token: string | null;

  // ── Status ──
  /** @pending-migration — True for first 30 days after signup. */
  is_newcomer: boolean;

  created_at: string;
  updated_at: string;
}

/** public.machines */
export interface Machine {
  id: string;
  gym_id: string;
  type: MachineType;
  name: string;
  unique_qr_code: string | null;
  qr_uuid: string | null;
  sensor_id: string | null;
  is_active: boolean;

  // ── BLE ──
  /** @pending-migration */
  ble_protocol: BLEProtocol | null;
  /** @pending-migration */
  protocol_verified: boolean;
  /** @pending-migration — Floor zone or area label */
  zone: string | null;

  // ── Machine Locking ──
  is_busy: boolean;
  current_user_id: string | null;
  last_heartbeat: string | null;

  // ── Registration ──
  /** @pending-migration */
  registered_by: string | null;
  /** @pending-migration */
  registered_at: string | null;

  created_at: string;
}

/** public.sessions */
export interface Session {
  id: string;
  user_id: string;
  gym_id: string;
  machine_id: string | null;
  equipment_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  drops_earned: number;
  is_active: boolean;

  /** @pending-migration — Estimated calories burned */
  calories: number | null;
  /** @pending-migration — Multiplier applied (streak × challenge × gym boost) */
  multiplier: number;
  /** @pending-migration — Raw BLE data for server-side calculation */
  raw_metrics: RawMetrics | null;
}

/** JSONB stored in sessions.raw_metrics */
export interface RawMetrics {
  avg_speed?: number;
  max_speed?: number;
  avg_cadence?: number;
  max_cadence?: number;
  total_distance?: number;
  avg_incline?: number;
  max_incline?: number;
  avg_power?: number;
  max_power?: number;
}

/** public.drops_transactions (maps to spec's "drops_ledger") */
export interface DropsTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: TransactionType;
  reference_id: string | null;
  description: string | null;
  created_at: string;

  /** @pending-migration */
  gym_id: string | null;
  /** @pending-migration — Profile.available_drops snapshot after this transaction */
  balance_after: number | null;
  /** @pending-migration — Null = never expires */
  expires_at: string | null;
}

/** public.gym_memberships */
export interface GymMembership {
  id: string;
  user_id: string;
  gym_id: string;
  local_drops_balance: number;
  joined_at: string;
  role: UserRole | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  REWARDS & STORE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** public.rewards */
export interface Reward {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  reward_type: string;
  price_drops: number;
  stock: number | null;
  image_url: string | null;
  is_active: boolean;

  /** @pending-migration */
  sponsor_name: string | null;
  /** @pending-migration */
  sponsor_logo: string | null;
  /** @pending-migration */
  available_from: string | null;
  /** @pending-migration */
  available_until: string | null;

  created_at: string;
}

/** public.redemptions (maps to spec's "reward_claims") */
export interface Redemption {
  id: string;
  user_id: string;
  reward_id: string;
  gym_id: string;
  drops_spent: number;
  status: ClaimStatus;
  redemption_code: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHALLENGES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** public.gym_challenges (renamed from challenges) */
export interface GymChallenge {
  id: string;
  gym_id: string;
  name: string;
  challenge_type: string;
  target_drops: number | null;
  reward_drops: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  badge_image_url: string | null;
  frequency: string | null;
  required_minutes: number | null;
  machine_type: string | null;
  drops_bounty: number | null;
  streak_days: number | null;
  criteria: Record<string, unknown> | null;

  /** @pending-migration */
  scoring_model: ScoringModel;
  /** @pending-migration — Array of {label, target, drops} tier definitions */
  tiers: ChallengeTier[] | null;
  /** @pending-migration */
  sponsor_name: string | null;
  /** @pending-migration */
  sponsor_logo: string | null;
  /** @pending-migration */
  prize_description: string | null;

  created_at: string;
}

/** JSONB element in gym_challenges.tiers */
export interface ChallengeTier {
  /** e.g., 'Bronze', 'Silver', 'Gold' */
  label: string;
  /** Target value for this tier (drops, km, or days depending on scoring_model) */
  target: number;
  /** Drops awarded upon reaching this tier */
  drops: number;
}

/** public.challenge_progress */
export interface ChallengeProgress {
  id: string;
  challenge_id: string;
  user_id: string;
  current_drops: number;
  is_completed: boolean;
  completed_at: string | null;

  /** @pending-migration — Generic value for non-drops scoring models */
  current_value: number;
  /** @pending-migration — Which tier has been reached */
  tier_achieved: string | null;
  /** @pending-migration — Prevent double-awarding */
  drops_awarded: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BADGES & ACHIEVEMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** public.global_achievements (maps to spec's "badge_definitions") */
export interface GlobalAchievement {
  id: string;
  code: string;
  name: string;
  description: string | null;
  badge_image_url: string | null;
  criteria: BadgeCondition;
  reward_drops: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

/** JSONB stored in global_achievements.criteria */
export interface BadgeCondition {
  type: 'session_count' | 'total_drops' | 'streak_days' | 'gym_count' | 'distance_km' | 'challenge_count';
  value: number;
  /** Optional: restrict to a specific gym */
  gym_id?: string;
}

/** public.user_badges (maps to spec's "member_badges") */
export interface UserBadge {
  id: string;
  user_id: string;
  /** Polymorphic — references global_achievements or gym_challenges */
  badge_source_type: 'achievement' | 'challenge';
  badge_source_id: string;
  earned_at: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LEADERBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LeaderboardEntry {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  drops: number;
  rank: number;
  is_newcomer: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GYM BRANDING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface GymBranding {
  id: string;
  gym_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  background_image_url: string | null;
  welcome_message: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LEADERBOARD REWARDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LeaderboardReward {
  id: string;
  gym_id: string;
  period: LeaderboardPeriod;
  rank_position: number;
  reward_drops: number;
  reward_description: string | null;
  is_active: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RPC REQUEST/RESPONSE TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Response from supabase.rpc('award_drops', { p_session_id }) */
export interface AwardDropsResult {
  drops_earned: number;
  multiplier: number;
  badges_earned: string[];
}

/** Response from supabase.rpc('claim_reward', ...) */
export interface ClaimRewardResult {
  success: boolean;
  redemption_id: string | null;
  redemption_code: string | null;
  error_message: string | null;
}

/** Response from supabase.rpc('join_gym_by_code', { p_code }) */
export interface JoinGymResult {
  success: boolean;
  gym: Pick<Gym, 'id' | 'name' | 'city' | 'logo_url'> | null;
  error_message: string | null;
}

/** Parameters for get_local_leaderboard RPC */
export interface LeaderboardParams {
  p_gym_id: string;
  p_period: LeaderboardPeriod;
  p_limit?: number;
}

/** Parameters for get_gym_analytics RPC */
export interface GymAnalyticsParams {
  p_gym_id: string;
  p_time_filter: '7d' | '30d' | '90d' | 'all';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PUSH NOTIFICATION PAYLOADS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PushNotificationPayload {
  trigger: NotificationTrigger;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SessionEndedNotification extends PushNotificationPayload {
  trigger: 'session_ended';
  data: {
    session_id: string;
    drops_earned: string;
    multiplier: string;
  };
}

export interface BadgeEarnedNotification extends PushNotificationPayload {
  trigger: 'badge_earned';
  data: {
    badge_id: string;
    badge_name: string;
    drops_bonus: string;
  };
}

export interface RankOvertakenNotification extends PushNotificationPayload {
  trigger: 'rank_overtaken';
  data: {
    new_rank: string;
    gym_id: string;
    period: LeaderboardPeriod;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BLE PROTOCOL INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Abstract BLE data coming from any protocol */
export interface BLEWorkoutData {
  /** Instantaneous speed in km/h */
  speed: number | null;
  /** RPM */
  cadence: number | null;
  /** Cumulative distance in meters */
  distance: number | null;
  /** Watts */
  power: number | null;
  /** Cumulative calories */
  calories: number | null;
  /** Incline percentage */
  incline: number | null;
  /** BPM from heart rate monitor (if available) */
  heartRate: number | null;
  /** Timestamp of this data point */
  timestamp: number;
}

/** BLE Service UUIDs per protocol */
export const BLE_SERVICE_UUIDS = {
  /** Fitness Machine Service — standard for most gym equipment */
  FTMS: '00001826-0000-1000-8000-00805f9b34fb',
  /** Cycling Speed and Cadence — used by Magene sensors */
  CSC: '00001816-0000-1000-8000-00805f9b34fb',
  /** Heart Rate Monitor */
  HRM: '0000180d-0000-1000-8000-00805f9b34fb',
  /** FitShow proprietary — Chinese gym equipment */
  FITSHOW: '0000fff0-0000-1000-8000-00805f9b34fb',
} as const;

/** FTMS Characteristic UUIDs */
export const FTMS_CHARACTERISTICS = {
  TREADMILL_DATA: '00002acd-0000-1000-8000-00805f9b34fb',
  INDOOR_BIKE_DATA: '00002ad2-0000-1000-8000-00805f9b34fb',
  CROSS_TRAINER_DATA: '00002ace-0000-1000-8000-00805f9b34fb',
  TRAINING_STATUS: '00002ad3-0000-1000-8000-00805f9b34fb',
} as const;
