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
    PostgrestVersion: "14.4"
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
      app_runtime_flags: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
      arena_invitations: {
        Row: {
          arena_id: string
          created_at: string
          id: string
          invited_by: string
          invited_gym_id: string
          invited_user_id: string | null
          responded_at: string | null
          responded_by: string | null
          revenue_share_note: string | null
          revenue_share_percent: number | null
          status: string
          updated_at: string
        }
        Insert: {
          arena_id: string
          created_at?: string
          id?: string
          invited_by: string
          invited_gym_id: string
          invited_user_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          revenue_share_note?: string | null
          revenue_share_percent?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          arena_id?: string
          created_at?: string
          id?: string
          invited_by?: string
          invited_gym_id?: string
          invited_user_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          revenue_share_note?: string | null
          revenue_share_percent?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_invitations_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "sweat_arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_invitations_invited_gym_id_fkey"
            columns: ["invited_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_invitations_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_participant_gym_scores: {
        Row: {
          arena_id: string
          gym_id: string
          id: string
          score: number
          sessions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          arena_id: string
          gym_id: string
          id?: string
          score?: number
          sessions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          arena_id?: string
          gym_id?: string
          id?: string
          score?: number
          sessions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_participant_gym_scores_arena_id_fkey"
            columns: ["arena_id"]
            isOneToOne: false
            referencedRelation: "sweat_arenas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_participant_gym_scores_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_participant_gym_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          opt_in_drops_paid: number
          opted_in_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arena_id: string
          current_score?: number
          gym_id: string
          id?: string
          opt_in_drops_paid?: number
          opted_in_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arena_id?: string
          current_score?: number
          gym_id?: string
          id?: string
          opt_in_drops_paid?: number
          opted_in_at?: string
          updated_at?: string
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
      drop_limit_counters: {
        Row: {
          gym_id: string
          id: string
          minted_drops: number
          period_start: string
          period_type: string
          rewarded_sessions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          gym_id: string
          id?: string
          minted_drops?: number
          period_start: string
          period_type: string
          rewarded_sessions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          gym_id?: string
          id?: string
          minted_drops?: number
          period_start?: string
          period_type?: string
          rewarded_sessions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_limit_counters_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drop_limit_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_limits: {
        Row: {
          created_at: string
          enabled: boolean
          gym_id: string | null
          id: string
          max_drops_per_day: number
          max_drops_per_session: number
          max_drops_per_week: number
          max_rewarded_sessions_per_day: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          gym_id?: string | null
          id?: string
          max_drops_per_day?: number
          max_drops_per_session?: number
          max_drops_per_week?: number
          max_rewarded_sessions_per_day?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          gym_id?: string | null
          id?: string
          max_drops_per_day?: number
          max_drops_per_session?: number
          max_drops_per_week?: number
          max_rewarded_sessions_per_day?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_limits_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_model_config: {
        Row: {
          enabled_at: string
          full_rate_until_min: number
          gym_id: string | null
          id: string
          low_rate_until_min: number
          machine_base_json: Json
          post_limit_factor: number
          reduced_rate_until_min: number
          updated_at: string
        }
        Insert: {
          enabled_at?: string
          full_rate_until_min?: number
          gym_id?: string | null
          id?: string
          low_rate_until_min?: number
          machine_base_json?: Json
          post_limit_factor?: number
          reduced_rate_until_min?: number
          updated_at?: string
        }
        Update: {
          enabled_at?: string
          full_rate_until_min?: number
          gym_id?: string | null
          id?: string
          low_rate_until_min?: number
          machine_base_json?: Json
          post_limit_factor?: number
          reduced_rate_until_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_model_config_gym_id_fkey1"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_model_config_legacy: {
        Row: {
          base_rate_per_min: number
          created_at: string
          full_rate_until_min: number
          gym_id: string | null
          id: string
          is_active: boolean
          low_rate_until_min: number
          machine_type: string
          max_drops_per_day: number
          max_drops_per_minute: number
          max_drops_per_session: number
          max_drops_per_week: number
          max_multiplier: number
          max_rewarded_sessions_per_day: number
          post_limit_rate: number
          reduced_rate_until_min: number
          spike_ratio_threshold: number
          spike_window_seconds: number
          sustained_high_effort_ratio: number
          sustained_window_seconds: number
          updated_at: string
        }
        Insert: {
          base_rate_per_min?: number
          created_at?: string
          full_rate_until_min?: number
          gym_id?: string | null
          id?: string
          is_active?: boolean
          low_rate_until_min?: number
          machine_type: string
          max_drops_per_day?: number
          max_drops_per_minute?: number
          max_drops_per_session?: number
          max_drops_per_week?: number
          max_multiplier?: number
          max_rewarded_sessions_per_day?: number
          post_limit_rate?: number
          reduced_rate_until_min?: number
          spike_ratio_threshold?: number
          spike_window_seconds?: number
          sustained_high_effort_ratio?: number
          sustained_window_seconds?: number
          updated_at?: string
        }
        Update: {
          base_rate_per_min?: number
          created_at?: string
          full_rate_until_min?: number
          gym_id?: string | null
          id?: string
          is_active?: boolean
          low_rate_until_min?: number
          machine_type?: string
          max_drops_per_day?: number
          max_drops_per_minute?: number
          max_drops_per_session?: number
          max_drops_per_week?: number
          max_multiplier?: number
          max_rewarded_sessions_per_day?: number
          post_limit_rate?: number
          reduced_rate_until_min?: number
          spike_ratio_threshold?: number
          spike_window_seconds?: number
          sustained_high_effort_ratio?: number
          sustained_window_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drop_model_config_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
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
      economy_snapshots_daily: {
        Row: {
          burn_mint_ratio: number
          burned_drops: number
          created_at: string
          gym_id: string
          id: string
          minted_drops: number
          snapshot_date: string
          top1_share_pct: number
          unique_earners: number
          unique_redeemers: number
        }
        Insert: {
          burn_mint_ratio?: number
          burned_drops?: number
          created_at?: string
          gym_id: string
          id?: string
          minted_drops?: number
          snapshot_date: string
          top1_share_pct?: number
          unique_earners?: number
          unique_redeemers?: number
        }
        Update: {
          burn_mint_ratio?: number
          burned_drops?: number
          created_at?: string
          gym_id?: string
          id?: string
          minted_drops?: number
          snapshot_date?: string
          top1_share_pct?: number
          unique_earners?: number
          unique_redeemers?: number
        }
        Relationships: [
          {
            foreignKeyName: "economy_snapshots_daily_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_campaign_deliveries: {
        Row: {
          campaign_id: string
          created_at: string
          error_text: string | null
          id: string
          provider_id: string | null
          retry_count: number
          sent_at: string | null
          status: string
          target_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error_text?: string | null
          id?: string
          provider_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          target_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error_text?: string | null
          id?: string
          provider_id?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          target_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_campaign_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "engagement_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_campaign_deliveries_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "engagement_campaign_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_campaign_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_campaign_targets: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          push_token: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          push_token?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          push_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "engagement_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_campaign_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_campaigns: {
        Row: {
          audience_params: Json
          audience_type: string
          body: string
          campaign_type: string
          created_at: string
          created_by: string
          deep_link: string | null
          failed_count: number
          gym_id: string
          id: string
          queued_at: string | null
          reward_id: string | null
          sent_at: string | null
          sent_count: number
          status: string
          target_count: number
          title: string
          updated_at: string
        }
        Insert: {
          audience_params?: Json
          audience_type?: string
          body: string
          campaign_type?: string
          created_at?: string
          created_by: string
          deep_link?: string | null
          failed_count?: number
          gym_id: string
          id?: string
          queued_at?: string | null
          reward_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_count?: number
          title: string
          updated_at?: string
        }
        Update: {
          audience_params?: Json
          audience_type?: string
          body?: string
          campaign_type?: string
          created_at?: string
          created_by?: string
          deep_link?: string | null
          failed_count?: number
          gym_id?: string
          id?: string
          queued_at?: string | null
          reward_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          target_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_campaigns_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_campaigns_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_events: {
        Row: {
          created_at: string
          event_type: string
          gym_id: string | null
          id: string
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          gym_id?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          gym_id?: string | null
          id?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_events_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_challenge_progress: {
        Row: {
          challenge_id: string
          last_computed_at: string
          score: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          last_computed_at?: string
          score?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          last_computed_at?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "friend_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_challenges: {
        Row: {
          challenge_type: string
          challenger_user_id: string
          completed_at: string | null
          created_at: string
          duration_days: number
          ends_at: string | null
          gym_id: string
          id: string
          opponent_user_id: string
          pending_expires_at: string
          reward_drops_per_user: number
          starts_at: string | null
          status: string
          tie_mode: string
          updated_at: string
          winner_user_id: string | null
        }
        Insert: {
          challenge_type: string
          challenger_user_id: string
          completed_at?: string | null
          created_at?: string
          duration_days: number
          ends_at?: string | null
          gym_id: string
          id?: string
          opponent_user_id: string
          pending_expires_at: string
          reward_drops_per_user?: number
          starts_at?: string | null
          status?: string
          tie_mode?: string
          updated_at?: string
          winner_user_id?: string | null
        }
        Update: {
          challenge_type?: string
          challenger_user_id?: string
          completed_at?: string | null
          created_at?: string
          duration_days?: number
          ends_at?: string | null
          gym_id?: string
          id?: string
          opponent_user_id?: string
          pending_expires_at?: string
          reward_drops_per_user?: number
          starts_at?: string | null
          status?: string
          tie_mode?: string
          updated_at?: string
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friend_challenges_challenger_user_id_fkey"
            columns: ["challenger_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_challenges_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_challenges_opponent_user_id_fkey"
            columns: ["opponent_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_challenges_winner_user_id_fkey"
            columns: ["winner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          end_date: string | null
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
          end_date?: string | null
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
          end_date?: string | null
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
      gym_checkins: {
        Row: {
          checked_in_at: string
          created_at: string
          drops_earned: number
          gps_distance_m: number | null
          gps_lat: number | null
          gps_lng: number | null
          gps_verified: boolean
          gym_id: string
          id: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string
          created_at?: string
          drops_earned?: number
          gps_distance_m?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          gps_verified?: boolean
          gym_id: string
          id?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string
          created_at?: string
          drops_earned?: number
          gps_distance_m?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          gps_verified?: boolean
          gym_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_checkins_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_drop_boost_rules: {
        Row: {
          created_at: string
          created_by: string | null
          days_of_week: number[]
          display_label: string | null
          end_time_local: string
          gym_id: string
          id: string
          is_active: boolean
          is_visible_to_members: boolean
          machine_types: string[] | null
          multiplier: number
          name: string
          priority: number
          start_time_local: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days_of_week?: number[]
          display_label?: string | null
          end_time_local: string
          gym_id: string
          id?: string
          is_active?: boolean
          is_visible_to_members?: boolean
          machine_types?: string[] | null
          multiplier?: number
          name: string
          priority?: number
          start_time_local: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days_of_week?: number[]
          display_label?: string | null
          end_time_local?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          is_visible_to_members?: boolean
          machine_types?: string[] | null
          multiplier?: number
          name?: string
          priority?: number
          start_time_local?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_drop_boost_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_drop_boost_rules_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_floor_config: {
        Row: {
          cols: number
          gym_id: string
          rows: number
          updated_at: string
        }
        Insert: {
          cols?: number
          gym_id: string
          rows?: number
          updated_at?: string
        }
        Update: {
          cols?: number
          gym_id?: string
          rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_floor_config_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_gallery: {
        Row: {
          caption: string | null
          created_at: string
          gym_id: string
          id: string
          image_url: string
          sort_order: number
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          gym_id: string
          id?: string
          image_url: string
          sort_order?: number
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          image_url?: string
          sort_order?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_gallery_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_member_identities: {
        Row: {
          created_at: string
          external_membership_id: string | null
          full_name_verified: string | null
          gym_id: string
          id: string
          is_verified: boolean
          updated_at: string
          user_id: string
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          external_membership_id?: string | null
          full_name_verified?: string | null
          gym_id: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          user_id: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          external_membership_id?: string | null
          full_name_verified?: string | null
          gym_id?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          user_id?: string
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_member_identities_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_member_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_member_identities_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      gym_ownership_history: {
        Row: {
          change_method: string
          changed_at: string
          changed_by: string | null
          gym_id: string
          id: string
          new_owner_id: string | null
          old_owner_id: string | null
          reason: string | null
        }
        Insert: {
          change_method: string
          changed_at?: string
          changed_by?: string | null
          gym_id: string
          id?: string
          new_owner_id?: string | null
          old_owner_id?: string | null
          reason?: string | null
        }
        Update: {
          change_method?: string
          changed_at?: string
          changed_by?: string | null
          gym_id?: string
          id?: string
          new_owner_id?: string | null
          old_owner_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_ownership_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_ownership_history_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_ownership_history_new_owner_id_fkey"
            columns: ["new_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_ownership_history_old_owner_id_fkey"
            columns: ["old_owner_id"]
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
      gym_waitlist: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          gym_name: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          gym_name: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          gym_name?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gyms: {
        Row: {
          address: string | null
          branding_id: string | null
          checkin_drops: number
          checkin_verification_mode: string
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          email: string | null
          gps_radius_m: number
          id: string
          instagram: string | null
          is_active: boolean
          is_founding_partner: boolean
          is_mobile_listed: boolean
          is_pilot_enabled: boolean
          is_suspended: boolean
          lat: number | null
          latitude: number | null
          lng: number | null
          longitude: number | null
          name: string
          owner_id: string | null
          phone: string | null
          session_inactivity_autofinish_sec: number
          session_takeover_stale_sec: number
          session_warning_after_sec: number
          smartcoach_enabled: boolean
          status: string | null
          subscription_plan: string | null
          subscription_type: string | null
          updated_at: string
          website: string | null
          working_hours: Json | null
        }
        Insert: {
          address?: string | null
          branding_id?: string | null
          checkin_drops?: number
          checkin_verification_mode?: string
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          gps_radius_m?: number
          id?: string
          instagram?: string | null
          is_active?: boolean
          is_founding_partner?: boolean
          is_mobile_listed?: boolean
          is_pilot_enabled?: boolean
          is_suspended?: boolean
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          name: string
          owner_id?: string | null
          phone?: string | null
          session_inactivity_autofinish_sec?: number
          session_takeover_stale_sec?: number
          session_warning_after_sec?: number
          smartcoach_enabled?: boolean
          status?: string | null
          subscription_plan?: string | null
          subscription_type?: string | null
          updated_at?: string
          website?: string | null
          working_hours?: Json | null
        }
        Update: {
          address?: string | null
          branding_id?: string | null
          checkin_drops?: number
          checkin_verification_mode?: string
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          gps_radius_m?: number
          id?: string
          instagram?: string | null
          is_active?: boolean
          is_founding_partner?: boolean
          is_mobile_listed?: boolean
          is_pilot_enabled?: boolean
          is_suspended?: boolean
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          longitude?: number | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          session_inactivity_autofinish_sec?: number
          session_takeover_stale_sec?: number
          session_warning_after_sec?: number
          smartcoach_enabled?: boolean
          status?: string | null
          subscription_plan?: string | null
          subscription_type?: string | null
          updated_at?: string
          website?: string | null
          working_hours?: Json | null
        }
        Relationships: []
      }
      happy_hour_reminder_logs: {
        Row: {
          gym_id: string
          id: string
          offset_min: number
          rule_id: string
          sent_at: string
          user_id: string
          window_start_at: string
        }
        Insert: {
          gym_id: string
          id?: string
          offset_min: number
          rule_id: string
          sent_at?: string
          user_id: string
          window_start_at: string
        }
        Update: {
          gym_id?: string
          id?: string
          offset_min?: number
          rule_id?: string
          sent_at?: string
          user_id?: string
          window_start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_reminder_logs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_reminder_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "gym_drop_boost_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_reminder_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_live_scores: {
        Row: {
          alltime_score: number
          gym_id: string
          monthly_score: number
          refreshed_at: string
          user_id: string
          weekly_score: number
        }
        Insert: {
          alltime_score?: number
          gym_id: string
          monthly_score?: number
          refreshed_at?: string
          user_id: string
          weekly_score?: number
        }
        Update: {
          alltime_score?: number
          gym_id?: string
          monthly_score?: number
          refreshed_at?: string
          user_id?: string
          weekly_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_live_scores_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_live_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string | null
          gym_id: string
          id: string
          period: string
          period_end: string
          period_start: string
          prizes_distributed: boolean | null
          rankings: Json
        }
        Insert: {
          created_at?: string | null
          gym_id: string
          id?: string
          period: string
          period_end: string
          period_start: string
          prizes_distributed?: boolean | null
          rankings: Json
        }
        Update: {
          created_at?: string | null
          gym_id?: string
          id?: string
          period?: string
          period_end?: string
          period_start?: string
          prizes_distributed?: boolean | null
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
          floor_col: number | null
          floor_rotation: number
          floor_row: number | null
          gym_id: string
          id: string
          is_active: boolean | null
          is_busy: boolean
          is_demo_machine: boolean
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
          floor_col?: number | null
          floor_rotation?: number
          floor_row?: number | null
          gym_id: string
          id?: string
          is_active?: boolean | null
          is_busy?: boolean
          is_demo_machine?: boolean
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
          floor_col?: number | null
          floor_rotation?: number
          floor_row?: number | null
          gym_id?: string
          id?: string
          is_active?: boolean | null
          is_busy?: boolean
          is_demo_machine?: boolean
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
      pending_session_side_effects: {
        Row: {
          created_at: string
          drops_earned: number
          error_message: string | null
          gym_id: string
          id: string
          processed_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drops_earned?: number
          error_message?: string | null
          gym_id: string
          id?: string
          processed_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          drops_earned?: number
          error_message?: string | null
          gym_id?: string
          id?: string
          processed_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_gym_id: string | null
          assigned_gym_id: string | null
          available_drops: number
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          email_verified_at: string | null
          expo_push_token: string | null
          fitness_goal: string | null
          full_name: string | null
          gender: string | null
          happy_hour_reminder_offset_min: number
          happy_hour_reminders_enabled: boolean
          height_cm: number | null
          home_gym_id: string | null
          id: string
          is_demo: boolean
          is_newcomer: boolean
          last_visit_date: string | null
          monthly_drops: number
          onboarding_completed: boolean
          owner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          streak_days: number
          terms_privacy_acknowledged_at: string | null
          terms_privacy_document_version: string | null
          total_drops: number
          updated_at: string
          username: string
          weekly_drops: number
          weight_kg: number | null
        }
        Insert: {
          admin_gym_id?: string | null
          assigned_gym_id?: string | null
          available_drops?: number
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          email_verified_at?: string | null
          expo_push_token?: string | null
          fitness_goal?: string | null
          full_name?: string | null
          gender?: string | null
          happy_hour_reminder_offset_min?: number
          happy_hour_reminders_enabled?: boolean
          height_cm?: number | null
          home_gym_id?: string | null
          id: string
          is_demo?: boolean
          is_newcomer?: boolean
          last_visit_date?: string | null
          monthly_drops?: number
          onboarding_completed?: boolean
          owner_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          streak_days?: number
          terms_privacy_acknowledged_at?: string | null
          terms_privacy_document_version?: string | null
          total_drops?: number
          updated_at?: string
          username: string
          weekly_drops?: number
          weight_kg?: number | null
        }
        Update: {
          admin_gym_id?: string | null
          assigned_gym_id?: string | null
          available_drops?: number
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          email_verified_at?: string | null
          expo_push_token?: string | null
          fitness_goal?: string | null
          full_name?: string | null
          gender?: string | null
          happy_hour_reminder_offset_min?: number
          happy_hour_reminders_enabled?: boolean
          height_cm?: number | null
          home_gym_id?: string | null
          id?: string
          is_demo?: boolean
          is_newcomer?: boolean
          last_visit_date?: string | null
          monthly_drops?: number
          onboarding_completed?: boolean
          owner_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          streak_days?: number
          terms_privacy_acknowledged_at?: string | null
          terms_privacy_document_version?: string | null
          total_drops?: number
          updated_at?: string
          username?: string
          weekly_drops?: number
          weight_kg?: number | null
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
      redemptions: {
        Row: {
          cancellation_reason: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          description: string | null
          drops_spent: number
          expires_at: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          fulfillment_notes: string | null
          gym_id: string | null
          id: string
          redemption_code: string | null
          reward_id: string | null
          source_type: string
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
          description?: string | null
          drops_spent: number
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_notes?: string | null
          gym_id?: string | null
          id?: string
          redemption_code?: string | null
          reward_id?: string | null
          source_type?: string
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
          description?: string | null
          drops_spent?: number
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_notes?: string | null
          gym_id?: string | null
          id?: string
          redemption_code?: string | null
          reward_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      referrals: {
        Row: {
          block_reason: string | null
          created_at: string
          expires_at: string | null
          gym_id: string
          id: string
          invite_code: string
          invitee_reward_tx_id: string | null
          invitee_user_id: string | null
          joined_at: string | null
          qualified_checkin_at: string | null
          qualified_checkin_id: string | null
          qualified_verified_at: string | null
          referrer_user_id: string
          reward_block_reason: string | null
          reward_tx_id: string | null
          rewarded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          block_reason?: string | null
          created_at?: string
          expires_at?: string | null
          gym_id: string
          id?: string
          invite_code: string
          invitee_reward_tx_id?: string | null
          invitee_user_id?: string | null
          joined_at?: string | null
          qualified_checkin_at?: string | null
          qualified_checkin_id?: string | null
          qualified_verified_at?: string | null
          referrer_user_id: string
          reward_block_reason?: string | null
          reward_tx_id?: string | null
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          block_reason?: string | null
          created_at?: string
          expires_at?: string | null
          gym_id?: string
          id?: string
          invite_code?: string
          invitee_reward_tx_id?: string | null
          invitee_user_id?: string | null
          joined_at?: string | null
          qualified_checkin_at?: string | null
          qualified_checkin_id?: string | null
          qualified_verified_at?: string | null
          referrer_user_id?: string
          reward_block_reason?: string | null
          reward_tx_id?: string | null
          rewarded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_invitee_reward_tx_id_fkey"
            columns: ["invitee_reward_tx_id"]
            isOneToOne: false
            referencedRelation: "drops_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_invitee_user_id_fkey"
            columns: ["invitee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_qualified_checkin_id_fkey"
            columns: ["qualified_checkin_id"]
            isOneToOne: false
            referencedRelation: "gym_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_reward_tx_id_fkey"
            columns: ["reward_tx_id"]
            isOneToOne: false
            referencedRelation: "drops_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          available_from: string | null
          available_until: string | null
          base_price_rsd: number | null
          created_at: string
          description: string | null
          discount_percent: number
          drops_per_rsd_snapshot: number | null
          final_price_rsd_snapshot: number | null
          gym_id: string
          id: string
          image_url: string | null
          is_active: boolean | null
          is_one_time: boolean
          name: string
          price_calc_mode: string
          price_drops: number
          redemption_limit: string
          reward_type: string
          sponsor_logo: string | null
          sponsor_name: string | null
          stock: number | null
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          base_price_rsd?: number | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          drops_per_rsd_snapshot?: number | null
          final_price_rsd_snapshot?: number | null
          gym_id: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_one_time?: boolean
          name: string
          price_calc_mode?: string
          price_drops: number
          redemption_limit?: string
          reward_type: string
          sponsor_logo?: string | null
          sponsor_name?: string | null
          stock?: number | null
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          base_price_rsd?: number | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          drops_per_rsd_snapshot?: number | null
          final_price_rsd_snapshot?: number | null
          gym_id?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_one_time?: boolean
          name?: string
          price_calc_mode?: string
          price_drops?: number
          redemption_limit?: string
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
          average_rpm: number | null
          calories: number | null
          created_at: string
          drops_earned: number
          duration_seconds: number | null
          ended_at: string | null
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
          average_rpm?: number | null
          calories?: number | null
          created_at?: string
          drops_earned?: number
          duration_seconds?: number | null
          ended_at?: string | null
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
          average_rpm?: number | null
          calories?: number | null
          created_at?: string
          drops_earned?: number
          duration_seconds?: number | null
          ended_at?: string | null
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
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          email_delivery_status: string
          email_failure_reason: string | null
          email_sent_at: string | null
          expires_at: string
          gym_id: string | null
          id: string
          invited_by: string
          last_email_provider_id: string | null
          resend_count: number
          role: Database["public"]["Enums"]["user_role"]
          status: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          email_delivery_status?: string
          email_failure_reason?: string | null
          email_sent_at?: string | null
          expires_at?: string
          gym_id?: string | null
          id?: string
          invited_by: string
          last_email_provider_id?: string | null
          resend_count?: number
          role: Database["public"]["Enums"]["user_role"]
          status?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          email_delivery_status?: string
          email_failure_reason?: string | null
          email_sent_at?: string | null
          expires_at?: string
          gym_id?: string | null
          id?: string
          invited_by?: string
          last_email_provider_id?: string | null
          resend_count?: number
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
          card_color: string | null
          card_gradient_end: string | null
          card_text_color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          finalized_at: string | null
          id: string
          is_active: boolean
          is_finalized: boolean
          name: string
          opt_in_type: string | null
          opt_in_value: number | null
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
          card_color?: string | null
          card_gradient_end?: string | null
          card_text_color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          finalized_at?: string | null
          id?: string
          is_active?: boolean
          is_finalized?: boolean
          name: string
          opt_in_type?: string | null
          opt_in_value?: number | null
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
          card_color?: string | null
          card_gradient_end?: string | null
          card_text_color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          finalized_at?: string | null
          id?: string
          is_active?: boolean
          is_finalized?: boolean
          name?: string
          opt_in_type?: string | null
          opt_in_value?: number | null
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
      tokenomics_config: {
        Row: {
          band_enforcement_mode: string
          calibration_meta: Json
          calibration_version: number
          currency_code: string
          drops_per_rsd: number
          enabled_at: string
          enforce_rewarded_sessions_cap: boolean
          gym_id: string | null
          id: string
          max_checkin_drops_per_day: number
          max_drops_per_day: number
          max_drops_per_session: number
          max_drops_per_week: number
          max_rewarded_sessions_per_day: number
          price_band_json: Json
          reward_band_ignore_until: string | null
          rewarded_sessions_cap_mode: string
          session_restart_grace_sec: number
          session_soft_tier_1_factor: number
          session_soft_tier_1_span_ratio: number
          session_soft_tier_2_factor: number
          split_merge_window_sec: number
          updated_at: string
          use_drop_model_v2: boolean
        }
        Insert: {
          band_enforcement_mode?: string
          calibration_meta?: Json
          calibration_version?: number
          currency_code?: string
          drops_per_rsd?: number
          enabled_at?: string
          enforce_rewarded_sessions_cap?: boolean
          gym_id?: string | null
          id?: string
          max_checkin_drops_per_day?: number
          max_drops_per_day?: number
          max_drops_per_session?: number
          max_drops_per_week?: number
          max_rewarded_sessions_per_day?: number
          price_band_json?: Json
          reward_band_ignore_until?: string | null
          rewarded_sessions_cap_mode?: string
          session_restart_grace_sec?: number
          session_soft_tier_1_factor?: number
          session_soft_tier_1_span_ratio?: number
          session_soft_tier_2_factor?: number
          split_merge_window_sec?: number
          updated_at?: string
          use_drop_model_v2?: boolean
        }
        Update: {
          band_enforcement_mode?: string
          calibration_meta?: Json
          calibration_version?: number
          currency_code?: string
          drops_per_rsd?: number
          enabled_at?: string
          enforce_rewarded_sessions_cap?: boolean
          gym_id?: string | null
          id?: string
          max_checkin_drops_per_day?: number
          max_drops_per_day?: number
          max_drops_per_session?: number
          max_drops_per_week?: number
          max_rewarded_sessions_per_day?: number
          price_band_json?: Json
          reward_band_ignore_until?: string | null
          rewarded_sessions_cap_mode?: string
          session_restart_grace_sec?: number
          session_soft_tier_1_factor?: number
          session_soft_tier_1_span_ratio?: number
          session_soft_tier_2_factor?: number
          split_merge_window_sec?: number
          updated_at?: string
          use_drop_model_v2?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tokenomics_config_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          created_at: string
          earned_at: string
          global_achievement_id: string | null
          gym_challenge_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          earned_at?: string
          global_achievement_id?: string | null
          gym_challenge_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          earned_at?: string
          global_achievement_id?: string | null
          gym_challenge_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
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
      user_email_change_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_email: string
          old_email: string
          reason: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_email: string
          old_email: string
          reason?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_email?: string
          old_email?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_email_change_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_email_change_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      v_diag_missing_fk_indexes: {
        Row: {
          column_name: unknown
          constraint_name: unknown
          table_name: unknown
        }
        Relationships: []
      }
      v_diag_table_bloat: {
        Row: {
          dead_pct: number | null
          dead_rows: number | null
          last_analyze: string | null
          last_autoanalyze: string | null
          last_autovacuum: string | null
          last_vacuum: string | null
          live_rows: number | null
          schemaname: unknown
          table_name: unknown
        }
        Relationships: []
      }
      v_diag_unused_indexes: {
        Row: {
          index_name: unknown
          index_size: string | null
          schemaname: unknown
          table_name: unknown
          times_used: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _admin_check_gym_access: { Args: { p_gym_id: string }; Returns: boolean }
      _friend_challenge_compute_score: {
        Args: {
          p_challenge_type: string
          p_ends: string
          p_gym_id: string
          p_starts: string
          p_user_id: string
        }
        Returns: number
      }
      _friend_challenge_credit_winner: {
        Args: {
          p_amount: number
          p_challenge_id: string
          p_gym_id: string
          p_note: string
          p_user_id: string
        }
        Returns: string
      }
      _invoke_edge_function: {
        Args: { p_body?: Json; p_function_slug: string }
        Returns: number
      }
      _referral_generate_code: { Args: never; Returns: string }
      accept_owner_invitation: { Args: { p_token: string }; Returns: string }
      accept_staff_invitation: { Args: { p_token: string }; Returns: string }
      activate_gym: {
        Args: { p_activated_by: string; p_gym_id: string }
        Returns: undefined
      }
      admin_list_arenas: {
        Args: {
          p_gym_id: string
          p_is_active?: boolean
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
        }
        Returns: Json
      }
      admin_list_challenges: {
        Args: {
          p_gym_id: string
          p_is_active?: boolean
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
        }
        Returns: Json
      }
      admin_list_machines: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_type?: string
        }
        Returns: Json
      }
      admin_list_members: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
        }
        Returns: Json
      }
      admin_list_redemptions: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_list_rewards: {
        Args: {
          p_gym_id: string
          p_is_active?: boolean
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
        }
        Returns: Json
      }
      admin_list_team: {
        Args: {
          p_gym_id: string
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
        }
        Returns: Json
      }
      admin_upsert_drop_boost_rule: {
        Args: {
          p_days_of_week?: number[]
          p_end_time?: string
          p_gym_id: string
          p_is_active?: boolean
          p_machine_types?: string[]
          p_multiplier?: number
          p_name?: string
          p_priority?: number
          p_rule_id?: string
          p_start_time?: string
          p_timezone?: string
        }
        Returns: Json
      }
      apply_referral_code: {
        Args: { p_gym_id: string; p_invite_code: string }
        Returns: Json
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
      calculate_session_drops_v2: {
        Args: {
          p_avg_rpm?: number
          p_cadence_avg?: number
          p_calories?: number
          p_duration_seconds: number
          p_gym_id: string
          p_incline_avg_pct?: number
          p_machine_type: string
          p_quality_flags?: Json
          p_resistance_avg?: number
          p_rpm_peak?: number
          p_speed_avg_kmh?: number
          p_steps_per_min_avg?: number
        }
        Returns: {
          adjusted_drops: number
          applied_caps: Json
          applied_multiplier: number
          raw_drops: number
          reasons: Json
        }[]
      }
      can_upload_to_gym_challenge_bucket: {
        Args: { p_gym_id_text: string; p_user_id: string }
        Returns: boolean
      }
      cancel_arena: {
        Args: { p_arena_id: string }
        Returns: {
          error_message: string
          participants_refunded: number
          success: boolean
        }[]
      }
      cancel_friend_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      cancel_own_redemption: {
        Args: { p_redemption_id: string }
        Returns: {
          error_message: string
          success: boolean
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
      close_stale_live_sessions: { Args: never; Returns: undefined }
      compute_reward_band_compliance: {
        Args: { p_gym_id: string; p_reward_id: string }
        Returns: {
          band_max: number
          band_min: number
          compliance_reason: string
          discount_percent: number
          final_price_drops: number
          in_band: boolean
          normalized_price_drops: number
          price_calc_mode: string
          reward_id: string
          reward_name: string
          reward_type: string
        }[]
      }
      compute_reward_price_drops: {
        Args: {
          p_base_price_rsd: number
          p_discount_percent: number
          p_gym_id: string
        }
        Returns: {
          drops_per_rsd: number
          effective_drops: number
          effective_rsd: number
        }[]
      }
      confirm_redemption: {
        Args: { p_confirmed_by: string; p_redemption_id: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      create_engagement_campaign: {
        Args: {
          p_audience_params?: Json
          p_audience_type?: string
          p_body?: string
          p_campaign_type?: string
          p_deep_link?: string
          p_gym_id: string
          p_reward_id?: string
          p_title?: string
          p_user_ids?: string[]
        }
        Returns: Json
      }
      create_friend_challenge: {
        Args: {
          p_challenge_type: string
          p_duration_days: number
          p_gym_id: string
          p_opponent_user_id: string
          p_reward_drops_per_user?: number
          p_tie_mode?: string
        }
        Returns: Json
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
      create_referral_invite: { Args: { p_gym_id: string }; Returns: Json }
      distribute_leaderboard_prizes:
        | { Args: { p_gym_id: string; p_period: string }; Returns: number }
        | {
            Args: { p_force?: boolean; p_gym_id: string; p_period: string }
            Returns: number
          }
      distribute_leaderboard_prizes_now: {
        Args: { p_gym_id: string; p_period?: string }
        Returns: Json
      }
      evaluate_badges: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: {
          badge_name: string
        }[]
      }
      evaluate_referral_qualification: {
        Args: { p_referral_id?: string }
        Returns: Json
      }
      expire_stale_drops: { Args: never; Returns: number }
      finalize_arena: {
        Args: { p_arena_id: string }
        Returns: {
          winners_count: number
        }[]
      }
      finalize_inactive_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: {
          already_finalized: boolean
          drops_earned: number
          message: string
          success: boolean
        }[]
      }
      find_redemption_by_code: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          description: string
          drops_spent: number
          gym_id: string
          gym_name: string
          redemption_id: string
          reward_name: string
          reward_type: string
          source_type: string
          status: string
          user_id: string
          username: string
        }[]
      }
      generate_machine_qr_code: { Args: never; Returns: string }
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
      get_active_drop_boost: {
        Args: {
          p_gym_id: string
          p_machine_type?: string
          p_timestamp?: string
        }
        Returns: Json
      }
      get_admin_gym_id: { Args: { p_user_id: string }; Returns: string }
      get_arena_fulfillment_manifest: {
        Args: { p_arena_id: string }
        Returns: {
          confirmed_at: string
          expires_at: string
          fulfilled_at: string
          fulfilled_by: string
          full_name: string
          gym_id: string
          gym_name: string
          prize_description: string
          rank: number
          redemption_code: string
          redemption_id: string
          status: string
          user_id: string
          username: string
        }[]
      }
      get_arena_results: {
        Args: { p_arena_id: string }
        Returns: {
          avatar_url: string
          final_score: number
          gym_breakdown: Json
          gym_name: string
          prize: string
          rank: number
          redemption_code: string
          redemption_status: string
          user_id: string
          username: string
        }[]
      }
      get_assigned_gym_id: { Args: { p_user_id: string }; Returns: string }
      get_available_arenas: {
        Args: { p_user_id: string }
        Returns: {
          arena_id: string
          arena_status: string
          card_color: string
          card_gradient_end: string
          card_text_color: string
          description: string
          end_date: string
          finalized_at: string
          gym_score_breakdown: Json
          is_finalized: boolean
          leader_score: number
          name: string
          opt_in_type: string
          opt_in_value: number
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
      get_checkin_identity_candidates: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: Json
      }
      get_checkin_status: { Args: { p_gym_id: string }; Returns: Json }
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
      get_gym_activity_log: {
        Args: {
          p_gym_id: string
          p_kind?: string
          p_page?: number
          p_per_page?: number
          p_search?: string
        }
        Returns: Json
      }
      get_gym_analytics: {
        Args: { p_gym_id: string; p_time_filter?: string }
        Returns: Json
      }
      get_gym_arena_report: {
        Args: { p_end_date: string; p_gym_id: string; p_start_date: string }
        Returns: {
          arena_end: string
          arena_id: string
          arena_name: string
          arena_start: string
          derived_status: string
          gym_participants_count: number
          participants_count: number
          prizes: Json
          revenue_share_pct: number
          sponsor_name: string
        }[]
      }
      get_gym_challenge_report: {
        Args: { p_end_date: string; p_gym_id: string; p_start_date: string }
        Returns: {
          challenge_id: string
          challenge_name: string
          challenge_type: string
          completion_rate: number
          completions: number
          total_participants: number
        }[]
      }
      get_gym_dashboard_overview: {
        Args: { p_gym_id: string; p_window_days?: number }
        Returns: Json
      }
      get_gym_engagement_report: {
        Args: { p_end_date: string; p_gym_id: string; p_start_date: string }
        Returns: Json
      }
      get_gym_reward_compliance_discount_aware: {
        Args: { p_gym_id: string }
        Returns: {
          band_max: number
          band_min: number
          compliance_reason: string
          discount_percent: number
          final_price_drops: number
          in_band: boolean
          normalized_price_drops: number
          price_calc_mode: string
          reward_id: string
          reward_name: string
          reward_type: string
        }[]
      }
      get_gym_sessions_trend: {
        Args: { p_gym_id: string; p_weeks?: number }
        Returns: {
          drops_earned: number
          sessions_count: number
          unique_members: number
          week_start: string
        }[]
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
      get_gym_store_report: {
        Args: { p_end_date: string; p_gym_id: string; p_start_date: string }
        Returns: {
          confirmed_count: number
          is_active: boolean
          item_id: string
          item_name: string
          pending_count: number
          price_drops: number
          redemptions_count: number
          total_drops_spent: number
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
      get_happy_hour_schedule_preview: {
        Args: { p_days?: number; p_gym_id: string }
        Returns: Json
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
      get_leaderboard_snapshot_history: {
        Args: { p_gym_id?: string; p_limit?: number; p_period?: string }
        Returns: {
          gym_id: string
          gym_name: string
          my_drops: number
          my_rank: number
          period: string
          period_end: string
          period_start: string
          prizes_distributed: boolean
          rankings: Json
          snapshot_id: string
        }[]
      }
      get_live_machine_status: { Args: { p_gym_id: string }; Returns: Json }
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
      get_machine_analytics_dashboard: {
        Args: { p_days?: number; p_gym_id: string }
        Returns: Json
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
      get_members_at_risk: {
        Args: { p_days_inactive?: number; p_gym_id: string }
        Returns: Json
      }
      get_my_challenges: {
        Args: { p_gym_id?: string }
        Returns: {
          badge_image_url: string
          challenge_id: string
          challenge_name: string
          challenge_type: string
          completed_at: string
          current_drops: number
          current_streak_days: number
          current_value: number
          drops_awarded: boolean
          end_date: string
          is_completed: boolean
          milestone_threshold: number
          reward_drops: number
          scoring_model: string
          start_date: string
          streak_days: number
          target_drops: number
          tier_achieved: string
          tiers: Json
        }[]
      }
      get_my_checkins: {
        Args: { p_gym_id?: string; p_limit?: number; p_since?: string }
        Returns: {
          checked_in_at: string
          drops_earned: number
          gps_verified: boolean
          gym_id: string
          gym_name: string
          id: string
        }[]
      }
      get_my_demo_machine: {
        Args: never
        Returns: {
          gym_id: string
          machine_id: string
          machine_name: string
          machine_type: string
          qr_uuid: string
        }[]
      }
      get_my_drops: {
        Args: {
          p_gym_id?: string
          p_limit?: number
          p_since?: string
          p_types?: string[]
        }
        Returns: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          gym_id: string
          id: string
          transaction_type: string
        }[]
      }
      get_my_leaderboard_prizes: {
        Args: { p_gym_id?: string; p_limit?: number }
        Returns: {
          confirmed_at: string
          created_at: string
          description: string
          expires_at: string
          gym_id: string
          gym_name: string
          id: string
          redemption_code: string
          source_type: string
          status: string
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
          date_of_birth: string | null
          email: string | null
          email_verified_at: string | null
          expo_push_token: string | null
          fitness_goal: string | null
          full_name: string | null
          gender: string | null
          happy_hour_reminder_offset_min: number
          happy_hour_reminders_enabled: boolean
          height_cm: number | null
          home_gym_id: string | null
          id: string
          is_demo: boolean
          is_newcomer: boolean
          last_visit_date: string | null
          monthly_drops: number
          onboarding_completed: boolean
          owner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          streak_days: number
          terms_privacy_acknowledged_at: string | null
          terms_privacy_document_version: string | null
          total_drops: number
          updated_at: string
          username: string
          weekly_drops: number
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_redemptions: {
        Args: { p_gym_id?: string; p_limit?: number; p_statuses?: string[] }
        Returns: {
          confirmed_at: string
          created_at: string
          description: string
          drops_spent: number
          gym_id: string
          gym_name: string
          id: string
          redemption_code: string
          reward_id: string
          reward_image: string
          reward_name: string
          status: string
        }[]
      }
      get_my_referrals: { Args: { p_gym_id: string }; Returns: Json }
      get_my_sessions: {
        Args: {
          p_active_only?: boolean
          p_gym_id?: string
          p_limit?: number
          p_since?: string
        }
        Returns: {
          calories: number
          drops_earned: number
          duration_seconds: number
          ended_at: string
          gym_id: string
          gym_name: string
          id: string
          is_active: boolean
          machine_id: string
          machine_name: string
          machine_type: string
          multiplier: number
          raw_metrics: Json
          started_at: string
        }[]
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
      get_plan_owner: {
        Args: { plan_id: string }
        Returns: {
          coach_id: string
          gym_id: string
        }[]
      }
      get_platform_report: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_public_gyms_for_mobile: {
        Args: { p_listed_only?: boolean; p_pilot_only?: boolean }
        Returns: {
          address: string
          city: string
          country: string
          created_at: string
          id: string
          is_mobile_listed: boolean
          is_pilot_enabled: boolean
          lat: number
          lng: number
          name: string
          owner_id: string
          updated_at: string
        }[]
      }
      get_realtime_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      get_referral_stats: { Args: { p_gym_id: string }; Returns: Json }
      get_referral_timeline: { Args: { p_referral_id?: string }; Returns: Json }
      get_runtime_flag: { Args: { p_key: string }; Returns: Json }
      get_seq_scan_tables: {
        Args: never
        Returns: {
          idx_scans: number
          live_rows: number
          seq_rows_read: number
          seq_scans: number
          seq_to_idx_ratio: number
          table_name: string
        }[]
      }
      get_slow_queries: {
        Args: { p_min_ms?: number }
        Returns: {
          calls: number
          max_ms: number
          mean_ms: number
          query: string
          rows_returned: number
          total_ms: number
        }[]
      }
      get_unread_notification_count: { Args: never; Returns: number }
      get_upcoming_happy_hours: {
        Args: { p_gym_id: string; p_limit?: number }
        Returns: Json
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
      get_user_age: { Args: { p_user_id: string }; Returns: number }
      get_user_arena_result: {
        Args: { p_arena_id: string; p_user_id: string }
        Returns: {
          final_rank: number
          final_score: number
          prize_description: string
          redemption_code: string
          redemption_status: string
          top_participants: Json
          total_participants: number
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
          gym_id: string
          gym_name: string
        }[]
      }
      get_user_drop_limits: {
        Args: { p_gym_id: string }
        Returns: {
          max_drops_per_day: number
          max_drops_per_session: number
          max_drops_per_week: number
          max_rewarded_sessions_per_day: number
          rewarded_sessions_cap_mode: string
          session_restart_grace_sec: number
          session_soft_tier_1_factor: number
          session_soft_tier_1_span_ratio: number
          session_soft_tier_2_factor: number
          split_merge_window_sec: number
        }[]
      }
      get_user_drops_ledger_summary: {
        Args: { p_gym_id?: string }
        Returns: {
          earned_score_all_time: number
          earned_score_monthly: number
          earned_score_weekly: number
          wallet_balance: number
        }[]
      }
      get_user_earned_drops_gym: {
        Args: { p_gym_id: string; p_period?: string; p_user_id: string }
        Returns: number
      }
      get_user_expiring_drops: {
        Args: { p_gym_id?: string }
        Returns: {
          expiring_in_30d: number
          expiring_in_7d: number
          next_expiry_date: string
        }[]
      }
      get_user_role: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_transactions: {
        Args: {
          p_amount_sign?: string
          p_gym_id?: string
          p_limit?: number
          p_offset?: number
          p_types?: string[]
        }
        Returns: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          gym_id: string
          id: string
          redemption_status: string
          reference_id: string
          transaction_type: string
        }[]
      }
      get_wallet_summary: {
        Args: { p_gym_id?: string }
        Returns: {
          earned: number
          net: number
          period: string
          spent: number
        }[]
      }
      haversine_distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      is_gym_active: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_gym_owner: { Args: { p_user_id: string }; Returns: boolean }
      is_member_verified: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: boolean
      }
      is_receptionist: { Args: { p_user_id: string }; Returns: boolean }
      is_superadmin: { Args: { p_user_id: string }; Returns: boolean }
      lock_machine: {
        Args: { p_machine_id: string; p_user_id: string }
        Returns: boolean
      }
      log_fraud_event: {
        Args: {
          p_event_type: string
          p_gym_id: string
          p_metadata?: Json
          p_severity?: string
          p_user_id: string
        }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      mark_redemption_fulfilled: {
        Args: { p_notes?: string; p_redemption_id: string }
        Returns: Json
      }
      mark_staff_invitation_email_delivery: {
        Args: {
          p_error_text?: string
          p_invitation_id: string
          p_provider_id?: string
          p_status?: string
        }
        Returns: Json
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
      perform_checkin: {
        Args: { p_gym_id: string; p_lat?: number; p_lng?: number }
        Returns: Json
      }
      persist_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      preview_drop_calculation: {
        Args: {
          p_avg_rpm?: number
          p_avg_speed_kmh?: number
          p_cadence_per_min?: number
          p_calories_fallback?: number
          p_duration_min: number
          p_gym_id: string
          p_incline_pct?: number
          p_machine_type: string
          p_simulate_spikes?: boolean
        }
        Returns: Json
      }
      preview_referral_code: { Args: { p_invite_code: string }; Returns: Json }
      process_pending_side_effects: { Args: never; Returns: number }
      process_session_side_effects_eager: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      queue_engagement_delivery: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      refresh_economy_snapshot_daily: {
        Args: { p_day?: string; p_gym_id: string }
        Returns: undefined
      }
      refresh_friend_challenge_scores: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      refresh_leaderboard_live_scores: { Args: never; Returns: number }
      remove_staff_role: {
        Args: { p_gym_id: string; p_removed_by: string; p_user_id: string }
        Returns: undefined
      }
      resend_staff_invitation_email: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      reset_daily_challenges: { Args: never; Returns: undefined }
      reset_machine_rpm: { Args: never; Returns: undefined }
      reset_stale_streaks: { Args: never; Returns: number }
      reset_weekly_challenges: { Args: never; Returns: undefined }
      respond_friend_challenge: {
        Args: { p_accept: boolean; p_challenge_id: string }
        Returns: Json
      }
      respond_to_arena_invitation: {
        Args: { p_invitation_id: string; p_response: string }
        Returns: {
          error_message: string
          success: boolean
        }[]
      }
      send_arena_invitations: {
        Args: {
          p_arena_id: string
          p_gym_ids: string[]
          p_revenue_share_note?: string
          p_revenue_share_percent?: number
        }
        Returns: {
          error_message: string
          sent_count: number
        }[]
      }
      set_happy_hour_reminder_pref: {
        Args: { p_enabled: boolean; p_offset_min: number }
        Returns: Json
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
      start_session_safely: {
        Args: {
          p_device_hash?: string
          p_machine_id: string
          p_started_at?: string
        }
        Returns: {
          action: string
          error_code: string
          error_message: string
          session_id: string
          success: boolean
        }[]
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
      update_arena_scores: {
        Args: { p_drops: number; p_gym_id: string; p_user_id: string }
        Returns: undefined
      }
      update_arena_scores_periodic: { Args: never; Returns: number }
      update_challenge_progress: {
        Args: {
          p_drops: number
          p_gym_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_checkin_challenge_progress: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: undefined
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
          date_of_birth: string | null
          email: string | null
          email_verified_at: string | null
          expo_push_token: string | null
          fitness_goal: string | null
          full_name: string | null
          gender: string | null
          happy_hour_reminder_offset_min: number
          happy_hour_reminders_enabled: boolean
          height_cm: number | null
          home_gym_id: string | null
          id: string
          is_demo: boolean
          is_newcomer: boolean
          last_visit_date: string | null
          monthly_drops: number
          onboarding_completed: boolean
          owner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          streak_days: number
          terms_privacy_acknowledged_at: string | null
          terms_privacy_document_version: string | null
          total_drops: number
          updated_at: string
          username: string
          weekly_drops: number
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_live_session: {
        Args: {
          p_current_exercise_index: number
          p_current_item_id: string
          p_current_machine_id: string
          p_current_metrics: Json
          p_plan_id: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: string
      }
      upsert_physical_member_identity: {
        Args: {
          p_external_membership_id?: string
          p_full_name_verified?: string
          p_gym_id: string
          p_user_id: string
          p_verification_notes?: string
        }
        Returns: Json
      }
      user_has_active_subscription: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_plan_access: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      uuid_generate_v4: { Args: never; Returns: string }
      verify_member_identity: {
        Args: {
          p_external_membership_id?: string
          p_full_name_verified?: string
          p_gym_id: string
          p_user_id: string
          p_verification_notes?: string
        }
        Returns: Json
      }
      withdraw_gym_from_arena: {
        Args: { p_arena_id: string; p_gym_id: string }
        Returns: Json
      }
    }
    Enums: {
      access_type: "free" | "membership_required" | "paid_one_time"
      challenge_type:
        | "daily"
        | "weekly"
        | "monthly"
        | "streak"
        | "milestone"
        | "checkin_streak"
        | "checkin_count"
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
      challenge_type: [
        "daily",
        "weekly",
        "monthly",
        "streak",
        "milestone",
        "checkin_streak",
        "checkin_count",
      ],
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
} as const
