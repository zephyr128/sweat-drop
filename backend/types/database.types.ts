export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      devices: {
        Row: {
          id: string
          user_id: string
          device_name: string
          device_identifier: string
          firmware_version: string | null
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_name: string
          device_identifier: string
          firmware_version?: string | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          device_name?: string
          device_identifier?: string
          firmware_version?: string | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      workouts: {
        Row: {
          id: string
          user_id: string
          device_id: string | null
          workout_name: string | null
          workout_type: string
          started_at: string
          ended_at: string | null
          duration_seconds: number | null
          calories_burned: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_id?: string | null
          workout_name?: string | null
          workout_type: string
          started_at: string
          ended_at?: string | null
          duration_seconds?: number | null
          calories_burned?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          device_id?: string | null
          workout_name?: string | null
          workout_type?: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          calories_burned?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      workout_metrics: {
        Row: {
          id: string
          workout_id: string
          timestamp: string
          heart_rate: number | null
          temperature: number | null
          steps: number | null
          distance_meters: number | null
          cadence: number | null
          created_at: string
        }
        Insert: {
          id?: string
          workout_id: string
          timestamp: string
          heart_rate?: number | null
          temperature?: number | null
          steps?: number | null
          distance_meters?: number | null
          cadence?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          workout_id?: string
          timestamp?: string
          heart_rate?: number | null
          temperature?: number | null
          steps?: number | null
          distance_meters?: number | null
          cadence?: number | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
