/**
 * SmartCoach System TypeScript Types
 * Unified Content Provider: Workout Plans for Coaches and Gyms
 */

// ============================================================================
// Database Types (generated from Supabase)
// ============================================================================

export interface CoachProfile {
  id: string; // References profiles.id
  bio: string | null;
  specialty: string | null;
  rate_per_session: number | null;
  is_active: boolean;
  rating: number;
  total_sessions: number;
  created_at: string;
  updated_at: string;
}

export type WorkoutPlanAccessLevel = 'public' | 'private' | 'gym_members_only';
export type WorkoutPlanDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type TargetMetric = 'time' | 'reps' | 'distance' | 'rpm' | 'custom';
export type MachineType = 'treadmill' | 'bike';

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string | null;
  
  // Polymorphic ownership: Either coach_id OR gym_id must be set
  coach_id: string | null;
  gym_id: string | null;
  
  // Access control
  access_level: WorkoutPlanAccessLevel;
  
  // Pricing
  price: number;
  currency: string;
  
  // Metadata
  difficulty_level: WorkoutPlanDifficulty | null;
  estimated_duration_minutes: number | null;
  category: string | null;
  thumbnail_url: string | null;
  
  // Status
  is_active: boolean;
  is_featured: boolean;
  
  created_at: string;
  updated_at: string;
  
  // Extended fields (from joins)
  coach?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  gym?: {
    id: string;
    name: string;
    city: string | null;
  };
  
  // Computed fields
  owner_type?: 'coach' | 'gym';
  owner_name?: string;
}

export interface WorkoutPlanItem {
  id: string;
  plan_id: string;
  order_index: number;
  exercise_name: string;
  exercise_description: string | null;
  target_machine_type: MachineType;
  target_metric: TargetMetric;
  target_value: number;
  target_unit: string | null;
  rest_seconds: number;
  sets: number;
  target_machine_id: string | null; // If null, any machine of target_machine_type works
  created_at: string;
  updated_at: string;
  
  // Extended fields
  target_machine?: {
    id: string;
    name: string;
    type: MachineType;
  };
}

export type SubscriptionType = 'plan' | 'coach';
export type SubscriptionStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface ActiveSubscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  coach_id: string | null;
  subscription_type: SubscriptionType;
  status: SubscriptionStatus;
  current_exercise_index: number;
  started_at: string;
  last_active_at: string | null;
  completed_at: string | null;
  payment_status: PaymentStatus | null;
  payment_amount: number | null;
  created_at: string;
  updated_at: string;
  
  // Extended fields
  plan?: WorkoutPlan;
  coach?: CoachProfile;
}

export type LiveSessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface LiveSessionMetrics {
  rpm?: number;
  heart_rate?: number;
  distance_km?: number;
  calories?: number;
  drops?: number;
  pace?: string; // e.g., "5:30"
  [key: string]: any; // Allow flexibility for future metrics
}

export interface LiveSession {
  id: string;
  user_id: string;
  subscription_id: string;
  plan_id: string;
  current_exercise_index: number;
  current_item_id: string | null;
  current_machine_id: string | null;
  current_metrics: LiveSessionMetrics;
  status: LiveSessionStatus;
  started_at: string;
  last_updated_at: string;
  completed_at: string | null;
  created_at: string;
  
  // Extended fields
  user?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  plan?: WorkoutPlan;
  current_item?: WorkoutPlanItem;
  current_machine?: {
    id: string;
    name: string;
    type: MachineType;
  };
}

// ============================================================================
// Frontend/API Response Types
// ============================================================================

export interface WorkoutPlanWithItems extends WorkoutPlan {
  items: WorkoutPlanItem[];
}

export interface ActiveWorkoutSession {
  subscription: ActiveSubscription;
  plan: WorkoutPlanWithItems;
  live_session: LiveSession | null;
  current_item: WorkoutPlanItem | null;
  progress_percentage: number;
}

// ============================================================================
// Mapping Logic Types
// ============================================================================

/**
 * Result of mapping a scanned machine QR UUID to a plan item
 */
export interface MachineToPlanItemMapping {
  success: boolean;
  item: WorkoutPlanItem | null;
  subscription: ActiveSubscription | null;
  plan: WorkoutPlan | null;
  message?: string;
  
  // If machine doesn't match current exercise, but matches a future one
  is_future_exercise?: boolean;
  future_item_index?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateWorkoutPlanRequest {
  name: string;
  description?: string;
  coach_id?: string; // If creating as coach
  gym_id?: string; // If creating as gym admin
  access_level: WorkoutPlanAccessLevel;
  price?: number;
  difficulty_level?: WorkoutPlanDifficulty;
  estimated_duration_minutes?: number;
  category?: string;
  thumbnail_url?: string;
}

export interface CreateWorkoutPlanItemRequest {
  plan_id: string;
  order_index: number;
  exercise_name: string;
  exercise_description?: string;
  target_machine_type: MachineType;
  target_metric: TargetMetric;
  target_value: number;
  target_unit?: string;
  rest_seconds?: number;
  sets?: number;
  target_machine_id?: string; // Optional: lock to specific machine
}

export interface SubscribeToPlanRequest {
  plan_id: string;
  payment_status?: PaymentStatus;
  payment_amount?: number;
}

export interface StartLiveSessionRequest {
  subscription_id: string;
  machine_id: string; // Scanned machine UUID
}

export interface UpdateLiveSessionRequest {
  session_id: string;
  current_metrics: LiveSessionMetrics;
  current_exercise_index?: number;
  status?: LiveSessionStatus;
}
