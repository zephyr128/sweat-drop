Initialising login role...
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      active_subscriptions: {
        Row: {
          coach_id: string | null
          completed_at: string | null
          created_at: string
          current_exercise_index: number | null
          id: string
          last_active_at: string | null
          payment_amount: number | null
          payment_status: string | null
          plan_id: string | null
          started_at: string
          status: string
          subscription_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_exercise_index?: number | null
          id?: string
          last_active_at?: string | null
          payment_amount?: number | null
          payment_status?: string | null
          plan_id?: string | null
          started_at?: string
          status?: string
          subscription_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coach_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_exercise_index?: number | null
          id?: string
          last_active_at?: string | null
          payment_amount?: number | null
          payment_status?: string | null
          plan_id?: string | null
          started_at?: string
          status?: string
          subscription_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_subscriptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_gyms: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          arena_id: string
          gym_id: string
          id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          arena_id: string
          gym_id: string
          id?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          arena_id?: string
          gym_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_gyms_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_gyms_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "sweat_arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_gyms_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_participants: {
        Row: {
          arena_id: string
          current_score: number
          gym_id: string
          id: string
          opted_in_at: string
          user_id: string
        }
        Insert: {
          arena_id: string
          current_score?: number
          gym_id: string
          id?: string
          opted_in_at?: string
          user_id: string
        }
        Update: {
          arena_id?: string
          current_score?: number
          gym_id?: string
          id?: string
          opted_in_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_participants_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "sweat_arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_participants_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_results: {
        Row: {
          arena_id: string
          created_at: string
          final_rank: number
          final_score: number
          id: string
          prize_description: string | null
          redemption_id: string | null
          user_id: string
        }
        Insert: {
          arena_id: string
          created_at?: string
          final_rank: number
          final_score: number
          id?: string
          prize_description?: string | null
          redemption_id?: string | null
          user_id: string
        }
        Update: {
          arena_id?: string
          created_at?: string
          final_rank?: number
          final_score?: number
          id?: string
          prize_description?: string | null
          redemption_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_results_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "sweat_arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_results_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          current_drops: number
          current_streak_days: number
          current_value: number
          drops_awarded: boolean
          gym_id: string
          id: string
          is_completed: boolean
          last_activity_date: string | null
          tier_achieved: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          current_drops?: number
          current_streak_days?: number
          current_value?: number
          drops_awarded?: boolean
          gym_id: string
          id?: string
          is_completed?: boolean
          last_activity_date?: string | null
          tier_achieved?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          current_drops?: number
          current_streak_days?: number
          current_value?: number
          drops_awarded?: boolean
          gym_id?: string
          id?: string
          is_completed?: boolean
          last_activity_date?: string | null
          tier_achieved?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "gym_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_gym_affiliations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string
          commission_percentage: number | null
          created_at: string
          gym_id: string
          id: string
          notes: string | null
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          coach_id: string
          commission_percentage?: number | null
          created_at?: string
          gym_id: string
          id?: string
          notes?: string | null
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          coach_id?: string
          commission_percentage?: number | null
          created_at?: string
          gym_id?: string
          id?: string
          notes?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_gym_affiliations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_gym_affiliations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_gym_affiliations_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_gym_affiliations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          is_active: boolean
          rate_per_session: number | null
          rating: number | null
          specialty: string | null
          total_sessions: number
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id: string
          is_active?: boolean
          rate_per_session?: number | null
          rating?: number | null
          specialty?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          rate_per_session?: number | null
          rating?: number | null
          specialty?: string | null
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      completed_exercises: {
        Row: {
          actual_unit: string | null
          actual_value: number | null
          completed_at: string
          completed_date: string | null
          created_at: string
          duration_seconds: number | null
          exercise_name: string
          id: string
          item_id: string
          machine_id: string | null
          machine_name: string | null
          order_index: number
          plan_id: string
          plan_progress_id: string | null
          session_id: string | null
          target_metric: string | null
          target_unit: string | null
          target_value: number | null
          user_id: string
        }
        Insert: {
          actual_unit?: string | null
          actual_value?: number | null
          completed_at?: string
          completed_date?: string | null
          created_at?: string
          duration_seconds?: number | null
          exercise_name: string
          id?: string
          item_id: string
          machine_id?: string | null
          machine_name?: string | null
          order_index: number
          plan_id: string
          plan_progress_id?: string | null
          session_id?: string | null
          target_metric?: string | null
          target_unit?: string | null
          target_value?: number | null
          user_id: string
        }
        Update: {
          actual_unit?: string | null
          actual_value?: number | null
          completed_at?: string
          completed_date?: string | null
          created_at?: string
          duration_seconds?: number | null
          exercise_name?: string
          id?: string
          item_id?: string
          machine_id?: string | null
          machine_name?: string | null
          order_index?: number
          plan_id?: string
          plan_progress_id?: string | null
          session_id?: string | null
          target_metric?: string | null
          target_unit?: string | null
          target_value?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_exercises_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_exercises_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_exercises_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_exercises_plan_progress_id_fkey"
            columns: ["plan_progress_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_exercises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      day_template_items: {
        Row: {
          base_target_value: number | null
          created_at: string
          day_template_id: string
          exercise_description: string | null
          exercise_name: string
          id: string
          machine_id: string | null
          machine_type: string | null
          order_index: number
          rest_seconds: number | null
          sets: number | null
          smart_progression_enabled: boolean
          target_metric: string | null
          target_reps: number | null
          target_time: number | null
          target_unit: string | null
          target_value: number | null
          updated_at: string
        }
        Insert: {
          base_target_value?: number | null
          created_at?: string
          day_template_id: string
          exercise_description?: string | null
          exercise_name: string
          id?: string
          machine_id?: string | null
          machine_type?: string | null
          order_index: number
          rest_seconds?: number | null
          sets?: number | null
          smart_progression_enabled?: boolean
          target_metric?: string | null
          target_reps?: number | null
          target_time?: number | null
          target_unit?: string | null
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          base_target_value?: number | null
          created_at?: string
          day_template_id?: string
          exercise_description?: string | null
          exercise_name?: string
          id?: string
          machine_id?: string | null
          machine_type?: string | null
          order_index?: number
          rest_seconds?: number | null
          sets?: number | null
          smart_progression_enabled?: boolean
          target_metric?: string | null
          target_reps?: number | null
          target_time?: number | null
          target_unit?: string | null
          target_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_template_items_day_template_id_fkey"
            columns: ["day_template_id"]
            isOneToOne: false
            referencedRelation: "workout_day_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_template_items_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      drops_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          description: string | null
          expires_at: string | null
          gym_id: string | null
          id: string
          reference_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          gym_id?: string | null
          id?: string
          reference_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          gym_id?: string | null
          id?: string
          reference_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drops_transactions_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drops_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          created_at: string
          equipment_type: string | null
          gym_id: string
          id: string
          is_active: boolean | null
          name: string
          qr_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipment_type?: string | null
          gym_id: string
          id?: string
          is_active?: boolean | null
          name: string
          qr_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipment_type?: string | null
          gym_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          qr_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      global_achievements: {
        Row: {
          badge_image_url: string
          code: string
          created_at: string
          criteria: Json
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean
          name: string
          reward_drops: number
          updated_at: string
        }
        Insert: {
          badge_image_url: string
          code: string
          created_at?: string
          criteria: Json
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          name: string
          reward_drops?: number
          updated_at?: string
        }
        Update: {
          badge_image_url?: string
          code?: string
          created_at?: string
          criteria?: Json
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          name?: string
          reward_drops?: number
          updated_at?: string
        }
        Relationships: []
      }
      gym_challenges: {
        Row: {
          badge_image_url: string | null
          challenge_type: Database["public"]["Enums"]["challenge_type"]
          created_at: string
          criteria: Json
          description: string | null
          drops_bounty: number | null
          end_date: string
          gym_id: string
          id: string
          is_active: boolean | null
          machine_type: string | null
          milestone_threshold: number | null
          name: string
          prize_description: string | null
          required_minutes: number | null
          reward_drops: number
          scoring_model: string
          sponsor_logo: string | null
          sponsor_name: string | null
          start_date: string
          streak_days: number | null
          target_drops: number
          tiers: Json | null
          updated_at: string
        }
        Insert: {
          badge_image_url?: string | null
          challenge_type: Database["public"]["Enums"]["challenge_type"]
          created_at?: string
          criteria: Json
          description?: string | null
          drops_bounty?: number | null
          end_date: string
          gym_id: string
          id?: string
          is_active?: boolean | null
          machine_type?: string | null
          milestone_threshold?: number | null
          name: string
          prize_description?: string | null
          required_minutes?: number | null
          reward_drops: number
          scoring_model?: string
          sponsor_logo?: string | null
          sponsor_name?: string | null
          start_date: string
          streak_days?: number | null
          target_drops: number
          tiers?: Json | null
          updated_at?: string
        }
        Update: {
          badge_image_url?: string | null
          challenge_type?: Database["public"]["Enums"]["challenge_type"]
          created_at?: string
          criteria?: Json
          description?: string | null
          drops_bounty?: number | null
          end_date?: string
          gym_id?: string
          id?: string
          is_active?: boolean | null
          machine_type?: string | null
          milestone_threshold?: number | null
          name?: string
          prize_description?: string | null
          required_minutes?: number | null
          reward_drops?: number
          scoring_model?: string
          sponsor_logo?: string | null
          sponsor_name?: string | null
          start_date?: string
          streak_days?: number | null
          target_drops?: number
          tiers?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_memberships: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          local_drops_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          local_drops_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          local_drops_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_memberships_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_staff: {
        Row: {
          assigned_by: string | null
          created_at: string
          gym_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          gym_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_staff_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          address: string | null
          branding_id: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          is_suspended: boolean
          name: string
          owner_id: string | null
          smartcoach_enabled: boolean
          status: string | null
          subscription_plan: string | null
          subscription_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branding_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_suspended?: boolean
          name: string
          owner_id?: string | null
          smartcoach_enabled?: boolean
          status?: string | null
          subscription_plan?: string | null
          subscription_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branding_id?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_suspended?: boolean
          name?: string
          owner_id?: string | null
          smartcoach_enabled?: boolean
          status?: string | null
          subscription_plan?: string | null
          subscription_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_rewards: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          is_active: boolean | null
          period: Database["public"]["Enums"]["leaderboard_period"]
          rank_position: number
          reward_description: string | null
          reward_name: string
          reward_type: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          is_active?: boolean | null
          period?: Database["public"]["Enums"]["leaderboard_period"]
          rank_position: number
          reward_description?: string | null
          reward_name: string
          reward_type: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          is_active?: boolean | null
          period?: Database["public"]["Enums"]["leaderboard_period"]
          rank_position?: number
          reward_description?: string | null
          reward_name?: string
          reward_type?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_rewards_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          period: string
          period_end: string
          period_start: string
          prizes_distributed: boolean
          rankings: Json
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          period: string
          period_end: string
          period_start: string
          prizes_distributed?: boolean
          rankings: Json
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          period?: string
          period_end?: string
          period_start?: string
          prizes_distributed?: boolean
          rankings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          current_exercise_index: number
          current_item_id: string | null
          current_machine_id: string | null
          current_metrics: Json
          id: string
          last_updated_at: string
          plan_id: string
          started_at: string
          status: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_exercise_index: number
          current_item_id?: string | null
          current_machine_id?: string | null
          current_metrics?: Json
          id?: string
          last_updated_at?: string
          plan_id: string
          started_at?: string
          status?: string
          subscription_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_exercise_index?: number
          current_item_id?: string | null
          current_machine_id?: string | null
          current_metrics?: Json
          id?: string
          last_updated_at?: string
          plan_id?: string
          started_at?: string
          status?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_current_item_id_fkey"
            columns: ["current_item_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_current_machine_id_fkey"
            columns: ["current_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "active_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          machine_id: string
          report_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          machine_id: string
          report_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          machine_id?: string
          report_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_reports_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          ble_protocol: string | null
          created_at: string
          current_user_id: string | null
          gym_id: string
          id: string
          is_active: boolean | null
          is_busy: boolean
          is_under_maintenance: boolean
          last_heartbeat: string | null
          last_rpm: number | null
          maintenance_notes: string | null
          maintenance_started_at: string | null
          maintenance_started_by: string | null
          name: string
          protocol_verified: boolean
          qr_uuid: string | null
          registered_at: string | null
          registered_by: string | null
          sensor_id: string | null
          sensor_paired_at: string | null
          sensor_paired_by: string | null
          type: string
          unique_qr_code: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          ble_protocol?: string | null
          created_at?: string
          current_user_id?: string | null
          gym_id: string
          id?: string
          is_active?: boolean | null
          is_busy?: boolean
          is_under_maintenance?: boolean
          last_heartbeat?: string | null
          last_rpm?: number | null
          maintenance_notes?: string | null
          maintenance_started_at?: string | null
          maintenance_started_by?: string | null
          name: string
          protocol_verified?: boolean
          qr_uuid?: string | null
          registered_at?: string | null
          registered_by?: string | null
          sensor_id?: string | null
          sensor_paired_at?: string | null
          sensor_paired_by?: string | null
          type: string
          unique_qr_code: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          ble_protocol?: string | null
          created_at?: string
          current_user_id?: string | null
          gym_id?: string
          id?: string
          is_active?: boolean | null
          is_busy?: boolean
          is_under_maintenance?: boolean
          last_heartbeat?: string | null
          last_rpm?: number | null
          maintenance_notes?: string | null
          maintenance_started_at?: string | null
          maintenance_started_by?: string | null
          name?: string
          protocol_verified?: boolean
          qr_uuid?: string | null
          registered_at?: string | null
          registered_by?: string | null
          sensor_id?: string | null
          sensor_paired_at?: string | null
          sensor_paired_by?: string | null
          type?: string
          unique_qr_code?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_current_user_id_fkey"
            columns: ["current_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_maintenance_started_by_fkey"
            columns: ["maintenance_started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_sensor_paired_by_fkey"
            columns: ["sensor_paired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_branding: {
        Row: {
          background_url: string | null
          created_at: string
          id: string
          logo_url: string | null
          owner_id: string
          primary_color: string | null
          updated_at: string
        }
        Insert: {
          background_url?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          owner_id: string
          primary_color?: string | null
          updated_at?: string
        }
        Update: {
          background_url?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          owner_id?: string
          primary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_session_history: {
        Row: {
          completed_at: string | null
          completed_exercises: number
          created_at: string
          id: string
          plan_id: string
          plan_progress_id: string | null
          session_date: string
          started_at: string
          status: string
          total_drops_earned: number | null
          total_duration_seconds: number | null
          total_exercises: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_exercises: number
          created_at?: string
          id?: string
          plan_id: string
          plan_progress_id?: string | null
          session_date?: string
          started_at: string
          status?: string
          total_drops_earned?: number | null
          total_duration_seconds?: number | null
          total_exercises: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_exercises?: number
          created_at?: string
          id?: string
          plan_id?: string
          plan_progress_id?: string | null
          session_date?: string
          started_at?: string
          status?: string
          total_drops_earned?: number | null
          total_duration_seconds?: number | null
          total_exercises?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_session_history_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_session_history_plan_progress_id_fkey"
            columns: ["plan_progress_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_session_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_gym_id: string | null
          assigned_gym_id: string | null
          available_drops: number
          avatar_url: string | null
          created_at: string
          email: string | null
          expo_push_token: string | null
          full_name: string | null
          home_gym_id: string | null
          id: string
          is_newcomer: boolean
          last_visit_date: string | null
          monthly_drops: number
          owner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          streak_days: number
          total_drops: number
          updated_at: string
          username: string
          weekly_drops: number
        }
        Insert: {
          admin_gym_id?: string | null
          assigned_gym_id?: string | null
          available_drops?: number
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          expo_push_token?: string | null
          full_name?: string | null
          home_gym_id?: string | null
          id: string
          is_newcomer?: boolean
          last_visit_date?: string | null
          monthly_drops?: number
          owner_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          streak_days?: number
          total_drops?: number
          updated_at?: string
          username: string
          weekly_drops?: number
        }
        Update: {
          admin_gym_id?: string | null
          assigned_gym_id?: string | null
          available_drops?: number
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          expo_push_token?: string | null
          full_name?: string | null
          home_gym_id?: string | null
          id?: string
          is_newcomer?: boolean
          last_visit_date?: string | null
          monthly_drops?: number
          owner_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          streak_days?: number
          total_drops?: number
          updated_at?: string
          username?: string
          weekly_drops?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_admin_gym_id_fkey"
            columns: ["admin_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_assigned_gym_id_fkey"
            columns: ["assigned_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_home_gym_id_fkey"
            columns: ["home_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      program_days: {
        Row: {
          created_at: string
          day_number: number
          description: string | null
          estimated_duration_minutes: number | null
          id: string
          is_rest_day: boolean
          program_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_number: number
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_rest_day?: boolean
          program_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_number?: number
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_rest_day?: boolean
          program_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_items: {
        Row: {
          base_target_value: number | null
          created_at: string
          exercise_description: string | null
          exercise_name: string
          id: string
          machine_id: string | null
          machine_type: string | null
          order_index: number
          program_day_id: string
          rest_seconds: number | null
          sets: number | null
          smart_progression_enabled: boolean
          target_metric: string | null
          target_reps: number | null
          target_time: number | null
          target_unit: string | null
          target_value: number | null
          updated_at: string
        }
        Insert: {
          base_target_value?: number | null
          created_at?: string
          exercise_description?: string | null
          exercise_name: string
          id?: string
          machine_id?: string | null
          machine_type?: string | null
          order_index: number
          program_day_id: string
          rest_seconds?: number | null
          sets?: number | null
          smart_progression_enabled?: boolean
          target_metric?: string | null
          target_reps?: number | null
          target_time?: number | null
          target_unit?: string | null
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          base_target_value?: number | null
          created_at?: string
          exercise_description?: string | null
          exercise_name?: string
          id?: string
          machine_id?: string | null
          machine_type?: string | null
          order_index?: number
          program_day_id?: string
          rest_seconds?: number | null
          sets?: number | null
          smart_progression_enabled?: boolean
          target_metric?: string | null
          target_reps?: number | null
          target_time?: number | null
          target_unit?: string | null
          target_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_items_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_items_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          cancellation_reason: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          drops_spent: number
          gym_id: string
          id: string
          redemption_code: string | null
          reward_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          drops_spent: number
          gym_id: string
          id?: string
          redemption_code?: string | null
          reward_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          drops_spent?: number
          gym_id?: string
          id?: string
          redemption_code?: string | null
          reward_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          available_from: string | null
          available_until: string | null
          created_at: string
          description: string | null
          gym_id: string
          id: string
          image_url: string | null
          is_active: boolean | null
          is_one_time: boolean
          name: string
          price_drops: number
          reward_type: string
          sponsor_logo: string | null
          sponsor_name: string | null
          stock: number | null
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          description?: string | null
          gym_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_one_time?: boolean
          name: string
          price_drops: number
          reward_type: string
          sponsor_logo?: string | null
          sponsor_name?: string | null
          stock?: number | null
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string
          description?: string | null
          gym_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_one_time?: boolean
          name?: string
          price_drops?: number
          reward_type?: string
          sponsor_logo?: string | null
          sponsor_name?: string | null
          stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          calories: number | null
          created_at: string
          drops_earned: number
          duration_seconds: number | null
          ended_at: string | null
          equipment_id: string | null
          gym_id: string
          id: string
          is_active: boolean | null
          machine_id: string | null
          multiplier: number
          raw_metrics: Json | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number | null
          created_at?: string
          drops_earned?: number
          duration_seconds?: number | null
          ended_at?: string | null
          equipment_id?: string | null
          gym_id: string
          id?: string
          is_active?: boolean | null
          machine_id?: string | null
          multiplier?: number
          raw_metrics?: Json | null
          started_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number | null
          created_at?: string
          drops_earned?: number
          duration_seconds?: number | null
          ended_at?: string | null
          equipment_id?: string | null
          gym_id?: string
          id?: string
          is_active?: boolean | null
          machine_id?: string | null
          multiplier?: number
          raw_metrics?: Json | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      smartcoach_user_progress: {
        Row: {
          actual_reps: number | null
          actual_value: number | null
          actual_weight: number | null
          completed_at: string
          created_at: string
          id: string
          item_id: string
          new_target_value: number | null
          plan_id: string
          progression_applied: boolean | null
          progression_type: string | null
          session_id: string | null
          target_reps: number | null
          target_value: number | null
          target_weight: number | null
          tempo_consistency: number | null
          user_id: string
        }
        Insert: {
          actual_reps?: number | null
          actual_value?: number | null
          actual_weight?: number | null
          completed_at?: string
          created_at?: string
          id?: string
          item_id: string
          new_target_value?: number | null
          plan_id: string
          progression_applied?: boolean | null
          progression_type?: string | null
          session_id?: string | null
          target_reps?: number | null
          target_value?: number | null
          target_weight?: number | null
          tempo_consistency?: number | null
          user_id: string
        }
        Update: {
          actual_reps?: number | null
          actual_value?: number | null
          actual_weight?: number | null
          completed_at?: string
          created_at?: string
          id?: string
          item_id?: string
          new_target_value?: number | null
          plan_id?: string
          progression_applied?: boolean | null
          progression_type?: string | null
          session_id?: string | null
          target_reps?: number | null
          target_value?: number | null
          target_weight?: number | null
          tempo_consistency?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smartcoach_user_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "workout_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartcoach_user_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartcoach_user_progress_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smartcoach_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          gym_id: string | null
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
          status: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          gym_id?: string | null
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
          status?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          gym_id?: string | null
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sweat_arenas: {
        Row: {
          arena_scope: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          finalized_at: string | null
          id: string
          is_active: boolean
          is_finalized: boolean
          name: string
          prizes: Json
          scoring_model: string
          sponsor_contact_email: string | null
          sponsor_fee_cents: number
          sponsor_logo: string | null
          sponsor_name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          arena_scope: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          finalized_at?: string | null
          id?: string
          is_active?: boolean
          is_finalized?: boolean
          name: string
          prizes?: Json
          scoring_model: string
          sponsor_contact_email?: string | null
          sponsor_fee_cents?: number
          sponsor_logo?: string | null
          sponsor_name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          arena_scope?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          finalized_at?: string | null
          id?: string
          is_active?: boolean
          is_finalized?: boolean
          name?: string
          prizes?: Json
          scoring_model?: string
          sponsor_contact_email?: string | null
          sponsor_fee_cents?: number
          sponsor_logo?: string | null
          sponsor_name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sweat_arenas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_active_programs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_day: number
          id: string
          last_active_at: string
          program_id: string
          purchase_method: string | null
          purchase_price: number | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_day?: number
          id?: string
          last_active_at?: string
          program_id: string
          purchase_method?: string | null
          purchase_price?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_day?: number
          id?: string
          last_active_at?: string
          program_id?: string
          purchase_method?: string | null
          purchase_price?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_active_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_active_programs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          challenge_id: string | null
          created_at: string
          earned_at: string
          global_achievement_id: string | null
          gym_challenge_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          challenge_id?: string | null
          created_at?: string
          earned_at?: string
          global_achievement_id?: string | null
          gym_challenge_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          challenge_id?: string | null
          created_at?: string
          earned_at?: string
          global_achievement_id?: string | null
          gym_challenge_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "gym_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_global_achievement_id_fkey"
            columns: ["global_achievement_id"]
            isOneToOne: false
            referencedRelation: "global_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_gym_challenge_id_fkey"
            columns: ["gym_challenge_id"]
            isOneToOne: false
            referencedRelation: "gym_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string
          current_minutes: number
          gym_id: string
          id: string
          is_completed: boolean
          last_updated: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string
          current_minutes?: number
          gym_id: string
          id?: string
          is_completed?: boolean
          last_updated?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string
          current_minutes?: number
          gym_id?: string
          id?: string
          is_completed?: boolean
          last_updated?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "gym_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_challenge_progress_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          global_achievement_id: string | null
          gym_challenge_id: string | null
          id: string
          is_completed: boolean
          progress_data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          global_achievement_id?: string | null
          gym_challenge_id?: string | null
          id?: string
          is_completed?: boolean
          progress_data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          global_achievement_id?: string | null
          gym_challenge_id?: string | null
          id?: string
          is_completed?: boolean
          progress_data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_global_achievement_id_fkey"
            columns: ["global_achievement_id"]
            isOneToOne: false
            referencedRelation: "global_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_gym_challenge_id_fkey"
            columns: ["gym_challenge_id"]
            isOneToOne: false
            referencedRelation: "gym_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_day_templates: {
        Row: {
          category: string | null
          coach_id: string | null
          created_at: string
          description: string | null
          estimated_duration_minutes: number | null
          gym_id: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          estimated_duration_minutes?: number | null
          gym_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          estimated_duration_minutes?: number | null
          gym_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_day_templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_day_templates_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plan_items: {
        Row: {
          base_target_value: number | null
          created_at: string
          exercise_description: string | null
          exercise_name: string
          id: string
          instruction_video_url: string | null
          order_index: number
          plan_id: string
          progression_increment: number | null
          rest_seconds: number | null
          sets: number | null
          smart_progression_enabled: boolean
          target_machine_id: string | null
          target_machine_type: string
          target_metric: string
          target_unit: string | null
          target_value: number
          updated_at: string
        }
        Insert: {
          base_target_value?: number | null
          created_at?: string
          exercise_description?: string | null
          exercise_name: string
          id?: string
          instruction_video_url?: string | null
          order_index: number
          plan_id: string
          progression_increment?: number | null
          rest_seconds?: number | null
          sets?: number | null
          smart_progression_enabled?: boolean
          target_machine_id?: string | null
          target_machine_type: string
          target_metric: string
          target_unit?: string | null
          target_value: number
          updated_at?: string
        }
        Update: {
          base_target_value?: number | null
          created_at?: string
          exercise_description?: string | null
          exercise_name?: string
          id?: string
          instruction_video_url?: string | null
          order_index?: number
          plan_id?: string
          progression_increment?: number | null
          rest_seconds?: number | null
          sets?: number | null
          smart_progression_enabled?: boolean
          target_machine_id?: string | null
          target_machine_type?: string
          target_metric?: string
          target_unit?: string | null
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plan_items_target_machine_id_fkey"
            columns: ["target_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plan_progress: {
        Row: {
          completed_at: string | null
          completed_exercises: number
          completion_percentage: number
          created_at: string
          current_exercise_index: number
          id: string
          last_active_at: string
          plan_id: string
          started_at: string
          status: string
          subscription_id: string | null
          total_exercises: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_exercises?: number
          completion_percentage?: number
          created_at?: string
          current_exercise_index?: number
          id?: string
          last_active_at?: string
          plan_id: string
          started_at?: string
          status?: string
          subscription_id?: string | null
          total_exercises: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_exercises?: number
          completion_percentage?: number
          created_at?: string
          current_exercise_index?: number
          id?: string
          last_active_at?: string
          plan_id?: string
          started_at?: string
          status?: string
          subscription_id?: string | null
          total_exercises?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plan_progress_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plan_progress_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "active_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plan_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          access_level: string
          access_type: Database["public"]["Enums"]["access_type"]
          category: string | null
          coach_id: string | null
          created_at: string
          currency: string
          description: string | null
          difficulty_level: string | null
          estimated_duration_minutes: number | null
          gym_id: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          is_template: boolean
          name: string
          price: number
          stripe_one_time_price_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          template_equipment: string | null
          template_goal: string | null
          template_source_id: string | null
          template_structure: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          access_level?: string
          access_type?: Database["public"]["Enums"]["access_type"]
          category?: string | null
          coach_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_minutes?: number | null
          gym_id?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_template?: boolean
          name: string
          price?: number
          stripe_one_time_price_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          template_equipment?: string | null
          template_goal?: string | null
          template_source_id?: string | null
          template_structure?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          access_level?: string
          access_type?: Database["public"]["Enums"]["access_type"]
          category?: string | null
          coach_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          difficulty_level?: string | null
          estimated_duration_minutes?: number | null
          gym_id?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          is_template?: boolean
          name?: string
          price?: number
          stripe_one_time_price_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          template_equipment?: string | null
          template_goal?: string | null
          template_source_id?: string | null
          template_structure?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_template_source_id_fkey"
            columns: ["template_source_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_programs: {
        Row: {
          access_type: Database["public"]["Enums"]["access_type_program"]
          coach_id: string | null
          created_at: string
          currency: string
          description: string | null
          duration_weeks: number
          gym_id: string | null
          id: string
          is_active: boolean
          is_template: boolean
          level: string | null
          name: string
          price: number
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          access_type?: Database["public"]["Enums"]["access_type_program"]
          coach_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_weeks: number
          gym_id?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          level?: string | null
          name: string
          price?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          access_type?: Database["public"]["Enums"]["access_type_program"]
          coach_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_weeks?: number
          gym_id?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          level?: string | null
          name?: string
          price?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_programs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_owner_invitation: { Args: { p_token: string }; Returns: string }
      accept_staff_invitation: { Args: { p_token: string }; Returns: string }
      activate_gym: {
        Args: { p_activated_by: string; p_gym_id: string }
        Returns: undefined
      }
      add_drops: {
        Args: {
          p_amount: number
          p_description?: string
          p_gym_id: string
          p_reference_id?: string
          p_transaction_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      advance_program_day: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: undefined
      }
      assign_staff_role: {
        Args: {
          p_assigned_by: string
          p_gym_id: string
          p_role: string
          p_user_id: string
        }
        Returns: string
      }
      award_drops: {
        Args: { p_session_id: string }
        Returns: {
          badges_earned: string[]
          drops_earned: number
          multiplier: number
        }[]
      }
      cancel_redemption: {
        Args: {
          p_cancelled_by: string
          p_reason?: string
          p_redemption_id: string
        }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      claim_reward: {
        Args: { p_gym_id: string; p_reward_id: string; p_user_id: string }
        Returns: {
          error_message: string
          redemption_code: string
          redemption_id: string
          success: boolean
        }[]
      }
      cleanup_abandoned_sessions: { Args: never; Returns: number }
      confirm_redemption: {
        Args: { p_confirmed_by: string; p_redemption_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      create_redemption: {
        Args: { p_gym_id: string; p_reward_id: string; p_user_id: string }
        Returns: {
          error_message: string
          redemption_code: string
          redemption_id: string
          success: boolean
        }[]
      }
      end_session: {
        Args: { p_drops_earned: number; p_session_id: string }
        Returns: undefined
      }
      evaluate_badges: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: {
          badge_name: string
        }[]
      }
      expire_stale_drops: { Args: never; Returns: number }
      finalize_arena: {
        Args: { p_arena_id: string }
        Returns: {
          winners_count: number
        }[]
      }
      find_redemption_by_code: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          drops_spent: number
          gym_id: string
          gym_name: string
          redemption_id: string
          reward_name: string
          reward_type: string
          status: string
          user_id: string
          username: string
        }[]
      }
      generate_machine_qr_code: { Args: never; Returns: string }
      generate_redemption_code: { Args: never; Returns: string }
      get_active_challenges_for_user: {
        Args: { p_gym_id: string; p_machine_type?: string; p_user_id: string }
        Returns: {
          challenge_id: string
          challenge_name: string
          current_minutes: number
          description: string
          drops_bounty: number
          frequency: string
          is_completed: boolean
          machine_type: string
          progress_percentage: number
          required_minutes: number
          streak_days: number
        }[]
      }
      get_admin_gym_id: { Args: { p_user_id: string }; Returns: string }
      get_assigned_gym_id: { Args: { p_user_id: string }; Returns: string }
      get_available_arenas: {
        Args: { p_user_id: string }
        Returns: {
          arena_id: string
          description: string
          end_date: string
          name: string
          participant_count: number
          prizes: Json
          scoring_model: string
          sponsor_logo: string
          sponsor_name: string
          start_date: string
          user_opted_in: boolean
          user_rank: number
          user_score: number
        }[]
      }
      get_badge_statistics: {
        Args: { p_challenge_id: string }
        Returns: {
          total_earned: number
        }[]
      }
      get_challenge_completion_stats: {
        Args: { p_challenge_id: string }
        Returns: {
          completed_users: number
          completion_percentage: number
          total_users: number
        }[]
      }
      get_global_leaderboard: {
        Args: { p_limit?: number; p_newcomer_only?: boolean; p_period?: string }
        Returns: {
          avatar_url: string
          drops: number
          is_newcomer: boolean
          rank: number
          streak_days: number
          user_id: string
          username: string
        }[]
      }
      get_gym_analytics: {
        Args: { p_gym_id: string; p_time_filter?: string }
        Returns: Json
      }
      get_gym_staff: {
        Args: { p_gym_id: string }
        Returns: {
          assigned_at: string
          assigned_by_username: string
          email: string
          full_name: string
          role: string
          user_id: string
          username: string
        }[]
      }
      get_gyms_with_owner_info: {
        Args: never
        Returns: {
          active_machines: number
          city: string
          country: string
          gym_id: string
          gym_name: string
          is_suspended: boolean
          owner_email: string
          owner_id: string
          owner_name: string
          subscription_type: string
        }[]
      }
      get_leaderboard: {
        Args: {
          p_limit?: number
          p_newcomer_only?: boolean
          p_period?: string
          p_scope_id: string
          p_type: string
        }
        Returns: {
          avatar_url: string
          gym_name: string
          is_newcomer: boolean
          rank: number
          score: number
          score_label: string
          streak_days: number
          user_id: string
          username: string
        }[]
      }
      get_local_leaderboard: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_newcomer_only?: boolean
          p_period?: string
        }
        Returns: {
          avatar_url: string
          drops: number
          is_newcomer: boolean
          rank: number
          streak_days: number
          user_id: string
          username: string
        }[]
      }
      get_machine_status: {
        Args: { p_qr_uuid: string }
        Returns: {
          ble_protocol: string
          current_user_id: string
          gym_id: string
          is_active: boolean
          is_busy: boolean
          is_under_maintenance: boolean
          machine_id: string
          machine_name: string
          machine_type: string
          sensor_id: string
        }[]
      }
      get_machines_with_reports: {
        Args: { p_gym_id: string }
        Returns: {
          latest_report_at: string
          machine_id: string
          machine_name: string
          report_count: number
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          admin_gym_id: string | null
          assigned_gym_id: string | null
          available_drops: number
          avatar_url: string | null
          created_at: string
          email: string | null
          expo_push_token: string | null
          full_name: string | null
          home_gym_id: string | null
          id: string
          is_newcomer: boolean
          last_visit_date: string | null
          monthly_drops: number
          owner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          streak_days: number
          total_drops: number
          updated_at: string
          username: string
          weekly_drops: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_network_overview_stats: {
        Args: { p_owner_id: string }
        Returns: {
          active_gyms: number
          suspended_gyms: number
          total_drops_earned: number
          total_gyms: number
          total_machines: number
          total_members: number
        }[]
      }
      get_next_machine_in_plan: {
        Args: { p_current_index: number; p_plan_id: string }
        Returns: {
          exercise_name: string
          instruction_video_url: string
          item_id: string
          machine_name: string
          order_index: number
          target_machine_id: string
          target_machine_type: string
        }[]
      }
      get_or_create_gym_membership: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: string
      }
      get_or_create_user_challenge_progress: {
        Args: { p_challenge_id: string; p_gym_id: string; p_user_id: string }
        Returns: string
      }
      get_owned_gym_ids: { Args: { p_user_id: string }; Returns: string[] }
      get_plan_item_for_machine: {
        Args: {
          p_current_index?: number
          p_machine_id: string
          p_plan_id: string
        }
        Returns: {
          exercise_name: string
          instruction_video_url: string
          item_id: string
          order_index: number
          rest_seconds: number
          sets: number
          target_machine_type: string
          target_metric: string
          target_unit: string
          target_value: number
        }[]
      }
      get_plan_owner: {
        Args: { plan_id: string }
        Returns: {
          coach_id: string
          gym_id: string
        }[]
      }
      get_user_active_plan: {
        Args: { p_user_id: string }
        Returns: {
          current_exercise_index: number
          owner_id: string
          owner_name: string
          owner_type: string
          plan_id: string
          plan_name: string
          subscription_id: string
        }[]
      }
      get_user_active_program: {
        Args: { p_user_id: string }
        Returns: {
          current_day: number
          id: string
          last_active_at: string
          program_access_type: string
          program_description: string
          program_duration_weeks: number
          program_gym_id: string
          program_id: string
          program_level: string
          program_name: string
          program_thumbnail_url: string
          started_at: string
          status: string
          today_day_id: string
          today_estimated_duration_minutes: number
          today_is_rest_day: boolean
          today_title: string
          total_days: number
        }[]
      }
      get_user_badges: {
        Args: { p_user_id: string }
        Returns: {
          badge_description: string
          badge_id: string
          badge_image_url: string
          badge_name: string
          badge_type: string
          earned_at: string
          gym_name: string
        }[]
      }
      get_user_plan_progress: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: {
          completed_at: string
          completed_exercises: number
          completion_percentage: number
          current_exercise_index: number
          exercises: Json
          last_active_at: string
          progress_id: string
          started_at: string
          status: string
          total_exercises: number
        }[]
      }
      get_user_role: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_gym_active: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_gym_owner: { Args: { p_user_id: string }; Returns: boolean }
      is_receptionist: { Args: { p_user_id: string }; Returns: boolean }
      is_superadmin: { Args: { p_user_id: string }; Returns: boolean }
      is_superadmin_from_auth: { Args: { p_user_id: string }; Returns: boolean }
      load_day_template_into_program: {
        Args: {
          p_day_number: number
          p_day_template_id: string
          p_program_id: string
        }
        Returns: string
      }
      lock_machine: {
        Args: { p_machine_id: string; p_user_id: string }
        Returns: boolean
      }
      opt_into_arena: {
        Args: { p_arena_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      owns_gym: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: boolean
      }
      pair_sensor_to_machine: {
        Args: { p_machine_id: string; p_sensor_id: string }
        Returns: boolean
      }
      process_smartcoach_progress: {
        Args: {
          p_actual_reps: number
          p_actual_value: number
          p_actual_weight: number
          p_item_id: string
          p_plan_id: string
          p_session_id: string
          p_target_reps: number
          p_target_value: number
          p_target_weight: number
          p_tempo_consistency: number
          p_user_id: string
        }
        Returns: {
          new_rest_seconds: number
          new_target_value: number
          progression_type: string
        }[]
      }
      remove_staff_role: {
        Args: { p_gym_id: string; p_removed_by: string; p_user_id: string }
        Returns: undefined
      }
      reset_daily_challenges: { Args: never; Returns: undefined }
      reset_machine_rpm: { Args: never; Returns: undefined }
      reset_weekly_challenges: { Args: never; Returns: undefined }
      set_program_as_active: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: undefined
      }
      spend_local_drops: {
        Args: {
          p_amount: number
          p_description?: string
          p_gym_id: string
          p_reward_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      suspend_gym: {
        Args: { p_gym_id: string; p_suspended_by: string }
        Returns: undefined
      }
      unlock_machine: {
        Args: { p_machine_id: string; p_user_id: string }
        Returns: boolean
      }
      unlock_stale_machines: { Args: never; Returns: undefined }
      update_challenge_progress:
        | {
            Args: {
              p_drops: number
              p_gym_id: string
              p_session_id: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_drops_earned: number
              p_gym_id: string
              p_session_date?: string
              p_user_id: string
            }
            Returns: {
              challenge_id: string
              challenge_name: string
              challenge_type: Database["public"]["Enums"]["challenge_type"]
              completed_now: boolean
              current_progress: number
              is_completed: boolean
              reward_drops: number
              target_progress: number
            }[]
          }
      update_challenge_progress_minutes: {
        Args: {
          p_gym_id: string
          p_machine_type: string
          p_minutes: number
          p_user_id: string
        }
        Returns: {
          challenge_id: string
          challenge_name: string
          completed_now: boolean
          current_minutes: number
          drops_awarded: number
          is_completed: boolean
          required_minutes: number
        }[]
      }
      update_machine_heartbeat: {
        Args: { p_machine_id: string; p_user_id: string }
        Returns: boolean
      }
      update_machine_rpm: {
        Args: { p_machine_id: string; p_rpm: number; p_user_id: string }
        Returns: boolean
      }
      update_newcomer_status: { Args: never; Returns: number }
      update_plan_progress_on_exercise_completion: {
        Args: {
          p_item_id: string
          p_plan_id: string
          p_session_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_profile: {
        Args: {
          p_avatar_url?: string
          p_expo_push_token?: string
          p_username?: string
        }
        Returns: {
          admin_gym_id: string | null
          assigned_gym_id: string | null
          available_drops: number
          avatar_url: string | null
          created_at: string
          email: string | null
          expo_push_token: string | null
          full_name: string | null
          home_gym_id: string | null
          id: string
          is_newcomer: boolean
          last_visit_date: string | null
          monthly_drops: number
          owner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          streak_days: number
          total_drops: number
          updated_at: string
          username: string
          weekly_drops: number
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_has_active_subscription: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_plan_access: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_program_access: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      access_type: "free" | "membership_required" | "paid_one_time"
      access_type_program: "free" | "gym_members_only" | "paid"
      challenge_type: "daily" | "weekly" | "monthly" | "streak" | "milestone"
      leaderboard_period: "daily" | "weekly" | "monthly"
      leaderboard_scope: "gym" | "city" | "country"
      user_role:
        | "superadmin"
        | "gym_admin"
        | "receptionist"
        | "user"
        | "gym_owner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_level: { Args: { name: string }; Returns: number }
      get_prefix: { Args: { name: string }; Returns: string }
      get_prefixes: { Args: { name: string }; Returns: string[] }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_legacy_v1: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_type: ["free", "membership_required", "paid_one_time"],
      access_type_program: ["free", "gym_members_only", "paid"],
      challenge_type: ["daily", "weekly", "monthly", "streak", "milestone"],
      leaderboard_period: ["daily", "weekly", "monthly"],
      leaderboard_scope: ["gym", "city", "country"],
      user_role: [
        "superadmin",
        "gym_admin",
        "receptionist",
        "user",
        "gym_owner",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
