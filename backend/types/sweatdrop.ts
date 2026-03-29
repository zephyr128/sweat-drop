/**
 * SWEATDROP — Shared TypeScript Types
 *
 * Canonical type definitions shared across:
 *   - apps/admin-panel (Next.js)
 *   - apps/mobile-app (Expo/React Native)
 *   - backend/supabase (Edge Functions)
 *
 * These types represent the schema after all Phase 0–3 migrations are applied.
 *
 * Generated: 2026-03-02
 * Updated:   2026-03-03 (Phase 3 complete — Arenas + Unified Leaderboard)
 * Reference: docs/plans/mvp_full_audit_and_build_plan.md
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ENUMS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Database enum: public.user_role */
export type UserRole = 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user';

/** CHECK constraint on gyms.subscription_plan */
export type SubscriptionPlan = 'starter' | 'growth' | 'pro' | 'elite';

/** CHECK constraint on machines.type */
export type MachineType = 'treadmill' | 'bike' | 'elliptical' | 'weight';

/** CHECK constraint on machines.ble_protocol */
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

/** Status for reward claims / redemptions.
 *  'claimed' = user claimed, awaiting staff verification
 *  'redeemed' = staff verified / handed over
 *  'cancelled' = claim cancelled by user or system
 *  'expired' = claim expired without redemption */
export type ClaimStatus = 'claimed' | 'redeemed' | 'cancelled' | 'expired';

/** Source of a redemption entry */
export type RedemptionSourceType = 'reward_store' | 'arena_prize' | 'leaderboard_prize';

/** Leaderboard query type for generic get_leaderboard() RPC */
export type LeaderboardType = 'gym' | 'global' | 'challenge' | 'arena';

/** Arena scope */
export type ArenaScope = 'local' | 'regional' | 'network';

/** Arena scoring models */
export type ArenaScoringModel = 'total_drops' | 'days_visited' | 'variety_score' | 'streak_days';

/** Challenge category */
export type ChallengeType = 'individual' | 'group' | 'streak';

/** What metric the challenge tracks.
 *  CHECK constraint on gym_challenges.scoring_model */
export type ScoringModel = 'total_drops' | 'distance_km' | 'days_visited' | 'streak_days';

/** Leaderboard time period (TEXT parameter, replaces old ENUM) */
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

/** Push notification event types */
export type NotificationTrigger =
  | 'session_ended'
  | 'badge_earned'
  | 'rank_overtaken'
  | 'reward_claimed'
  | 'streak_reminder'
  | 'streak_at_risk'
  | 'weekly_results'
  | 'reengagement_7d'
  | 'reengagement_14d'
  | 'drops_expiry_30d'
  | 'drops_expiry_7d';

/** Tier levels for challenges */
export type TierLevel = 'bronze' | 'silver' | 'gold';

/** Source of calories data */
export type CaloriesSource = 'device' | 'estimated';

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
  /** 4-digit alphanumeric join code — NOT used in MVP (Blocker 3) */
  code: string | null;
  subscription_plan: SubscriptionPlan;
  /** Replaces is_suspended */
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
  /** Spendable wallet balance (decreases on reward claim). Backfilled = total_drops. */
  available_drops: number;
  /** Resets every Monday 00:00 Belgrade time. */
  weekly_drops: number;
  /** Resets 1st of every month. */
  monthly_drops: number;

  // ── Streaks & Activity ──
  /** Consecutive days of training. */
  streak_days: number;
  /** Date of last completed session (YYYY-MM-DD). */
  last_visit_date: string | null;

  // ── Push Notifications ──
  /** Expo push token for notifications. */
  expo_push_token: string | null;

  // ── Status ──
  /** True for first 30 days after signup. Cron flips to false. */
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
  ble_protocol: BLEProtocol | null;
  protocol_verified: boolean;
  /** Floor zone or area label */
  zone: string | null;

  // ── Machine Locking ──
  is_busy: boolean;
  current_user_id: string | null;
  last_heartbeat: string | null;

  // ── Registration ──
  registered_by: string | null;
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

  /** Calories burned (device-reported or estimated) */
  calories: number | null;
  /** Multiplier applied (streak bonus) */
  multiplier: number;
  /** Raw BLE data for server-side calculation */
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
  /** Whether calories came from device or were estimated */
  calories_source?: CaloriesSource;
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

  gym_id: string | null;
  /** Profile.available_drops snapshot after this transaction */
  balance_after: number | null;
  /** Null = never expires. Session drops expire after 90 days. */
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
  /** Display name — column is `title` in some migrations, `name` in others */
  title: string;
  description: string | null;
  reward_type: string;
  price_drops: number;
  stock: number | null;
  image_url: string | null;
  is_active: boolean;

  sponsor_name: string | null;
  sponsor_logo: string | null;
  available_from: string | null;
  available_until: string | null;
  /** If true, each user can claim only ONCE ever. */
  is_one_time: boolean;

  created_at: string;
}

/** public.redemptions (maps to spec's "reward_claims")
 *  Now supports multiple source types: reward_store, arena_prize, leaderboard_prize */
export interface Redemption {
  id: string;
  user_id: string;
  /** NULL for arena/leaderboard prizes */
  reward_id: string | null;
  gym_id: string;
  drops_spent: number;
  /** 'claimed' = pending verification, 'redeemed' = confirmed by staff */
  status: ClaimStatus;
  /** 6-char unique code for staff verification */
  redemption_code: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  /** Origin of this redemption */
  source_type: RedemptionSourceType;
  /** Human-readable description (used for arena/leaderboard prizes) */
  description: string | null;
  created_at: string;
  updated_at: string;
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

  /** What metric the challenge tracks */
  scoring_model: ScoringModel;
  /** Array of {label, target, drops} tier definitions */
  tiers: ChallengeTier[] | null;
  sponsor_name: string | null;
  sponsor_logo: string | null;
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

  /** Generic value for non-drops scoring models */
  current_value: number;
  /** Which tier has been reached (bronze/silver/gold) */
  tier_achieved: TierLevel | null;
  /** Prevent double-awarding */
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

/** public.user_badges (maps to spec's "member_badges")
 *  Created by evaluate_badges() function. */
export interface UserBadge {
  id: string;
  user_id: string;
  /** References global_achievements.id */
  global_achievement_id: string;
  /** The session that triggered badge earning */
  session_id: string | null;
  earned_at: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LEADERBOARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Return type from generic get_leaderboard() RPC */
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  score: number;
  /** Pre-formatted display string: "1,240 💧" | "🔥 21 days" */
  score_label: string;
  is_newcomer: boolean;
  streak_days: number;
  gym_name: string | null;
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
//  LEADERBOARD REWARDS & SNAPSHOTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LeaderboardReward {
  id: string;
  gym_id: string;
  rank_position: number;
  reward_name: string;
  reward_description: string | null;
  reward_type: string;
  value: string | null;
  is_active: boolean;
  period: LeaderboardPeriod;
}

export interface LeaderboardSnapshot {
  id: string;
  gym_id: string;
  period: LeaderboardPeriod;
  period_start: string;
  period_end: string;
  rankings: Array<{ rank: number; user_id: string; username: string; drops: number }>;
  prizes_distributed: boolean;
  created_at: string;
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

// NOTE: join_gym_by_code RPC removed from MVP scope (Blocker 3).
// Gym joining happens automatically on first machine QR scan.

/** Parameters for generic get_leaderboard() RPC */
export interface LeaderboardParams {
  p_type: LeaderboardType;
  p_scope_id: string | null;
  p_period?: LeaderboardPeriod;
  p_limit?: number;
  p_newcomer_only?: boolean;
}

/** Parameters for claim_reward RPC */
export interface ClaimRewardParams {
  p_user_id: string;
  p_reward_id: string;
  p_gym_id: string;
}

/** Parameters for get_gym_analytics RPC */
export interface GymAnalyticsParams {
  p_gym_id: string;
  p_time_filter: '7d' | '30d' | '90d' | 'all';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PUSH NOTIFICATION PAYLOADS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Input to the send-push Edge Function */
export interface SendPushRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Short label for structured logs (e.g. cron name). Max 64 chars. */
  client_ref?: string;
  /** Include raw Expo batch JSON in `result` (large; default false). */
  include_raw_batches?: boolean;
}

/** Output from the send-push Edge Function (v2; legacy fields may still appear). */
export interface SendPushResponse {
  ok?: boolean;
  version?: '2';
  sent: number;
  receipt_ok?: number;
  receipt_error?: number;
  requested?: number;
  valid_tokens?: number;
  skipped_invalid?: number;
  deduped_in_request?: number;
  batches_attempted?: number;
  batches_failed?: number;
  batch_summaries?: Array<Record<string, unknown>>;
  skip_reason?: 'no_tokens' | 'no_valid_tokens';
  error?: string;
  result?: unknown;
}

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
    period: string;
  };
}

export interface StreakReminderNotification extends PushNotificationPayload {
  trigger: 'streak_reminder';
  data: {
    type: 'streak_reminder';
  };
}

export interface ReEngagementNotification extends PushNotificationPayload {
  trigger: 'reengagement_7d' | 'reengagement_14d';
  data: {
    type: 'reengagement_7d' | 'reengagement_14d';
  };
}

export interface DropsExpiryNotification extends PushNotificationPayload {
  trigger: 'drops_expiry_30d' | 'drops_expiry_7d';
  data: {
    type: 'drops_expiry_30d' | 'drops_expiry_7d';
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SWEAT ARENAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** public.sweat_arenas — sponsor-branded competitions */
export interface SweatArena {
  id: string;
  name: string;
  description: string | null;
  arena_scope: ArenaScope;
  scoring_model: ArenaScoringModel;
  sponsor_name: string;
  sponsor_logo: string | null;
  sponsor_contact_email: string | null;
  prizes: ArenaPrize[];
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_finalized: boolean;
  finalized_at: string | null;
  sponsor_fee_cents: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** JSONB element in sweat_arenas.prizes */
export interface ArenaPrize {
  rank: number;
  prize: string;
  value?: string;
}

/** public.arena_gyms — gyms participating in an arena */
export interface ArenaGym {
  id: string;
  arena_id: string;
  gym_id: string;
  approved_by: string | null;
  approved_at: string | null;
}

/** public.arena_participants — user opt-in + live score */
export interface ArenaParticipant {
  id: string;
  arena_id: string;
  user_id: string;
  gym_id: string;
  current_score: number;
  opted_in_at: string;
}

/** public.arena_results — finalized rankings with redemption links */
export interface ArenaResult {
  id: string;
  arena_id: string;
  user_id: string;
  final_rank: number;
  final_score: number;
  prize_description: string | null;
  /** FK to redemptions table */
  redemption_id: string | null;
  created_at: string;
}

/** Return type from get_available_arenas() RPC */
export interface AvailableArena {
  arena_id: string;
  name: string;
  description: string | null;
  sponsor_name: string;
  sponsor_logo: string | null;
  scoring_model: ArenaScoringModel;
  start_date: string;
  end_date: string;
  participant_count: number;
  user_opted_in: boolean;
  user_rank: number | null;
  user_score: number | null;
  prizes: ArenaPrize[];
}

/** Result from opt_into_arena() RPC */
export interface OptIntoArenaResult {
  success: boolean;
  error?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BLE PROTOCOL INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Normalized workout metrics from any BLE protocol.
 *  INTERFACE CONTRACT: All BLE handlers output this shape. */
export interface WorkoutMetrics {
  /** Instantaneous speed in km/h */
  speed?: number;
  /** RPM */
  cadence?: number;
  /** Cumulative distance in km */
  distance?: number;
  /** Incline percentage */
  incline?: number;
  /** Cumulative calories */
  calories?: number;
  /** Whether calories came from device or were estimated */
  caloriesSource: CaloriesSource;
}

/** Abstract BLE protocol handler.
 *  INTERFACE CONTRACT: All BLE handlers implement this. */
export interface BLEProtocolHandler {
  connect(deviceId: string): Promise<void>;
  startMonitoring(callback: (metrics: WorkoutMetrics) => void): void;
  stopMonitoring(): void;
  disconnect(): void;
}

/** Full BLE data point (superset — for internal use / raw logging) */
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FEATURE GATE HELPER (Q7)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Feature IDs for future gating */
export type FeatureId =
  | 'challenges'
  | 'leaderboard'
  | 'rewards_store'
  | 'push_notifications'
  | 'machine_registration'
  | 'analytics_advanced'
  | 'custom_branding'
  | 'arenas';

/**
 * Check if a gym has access to a feature based on subscription plan.
 * For MVP: always returns true (all pilot gyms get full PRO features).
 * Post-MVP: implement actual plan-based gating here.
 */
export function checkFeatureAccess(_gym: Pick<Gym, 'subscription_plan'>, _feature: FeatureId): boolean {
  // Q7: Always true for MVP. Easy to wire up post-MVP.
  return true;
}
