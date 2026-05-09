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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_feedback: {
        Row: {
          context_data: Json | null
          created_at: string
          decision: string
          feedback_date: string
          feedback_type: string
          id: string
          reasoning: string
          user_id: string
        }
        Insert: {
          context_data?: Json | null
          created_at?: string
          decision: string
          feedback_date: string
          feedback_type: string
          id?: string
          reasoning: string
          user_id: string
        }
        Update: {
          context_data?: Json | null
          created_at?: string
          decision?: string
          feedback_date?: string
          feedback_type?: string
          id?: string
          reasoning?: string
          user_id?: string
        }
        Relationships: []
      }
      completed_workouts: {
        Row: {
          actual_avg_pace_sec_per_km: number | null
          actual_distance_km: number | null
          actual_duration_min: number | null
          actual_elevation_m: number | null
          created_at: string
          id: string
          notes: string | null
          planned_workout_id: string | null
          rpe: number | null
          user_id: string
          workout_date: string
        }
        Insert: {
          actual_avg_pace_sec_per_km?: number | null
          actual_distance_km?: number | null
          actual_duration_min?: number | null
          actual_elevation_m?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_workout_id?: string | null
          rpe?: number | null
          user_id: string
          workout_date: string
        }
        Update: {
          actual_avg_pace_sec_per_km?: number | null
          actual_distance_km?: number | null
          actual_duration_min?: number | null
          actual_elevation_m?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_workout_id?: string | null
          rpe?: number | null
          user_id?: string
          workout_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_workouts_planned_workout_id_fkey"
            columns: ["planned_workout_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_library: {
        Row: {
          content_type: Database["public"]["Enums"]["content_type"]
          created_at: string
          created_by: string
          description: string | null
          distance_km: number | null
          elevation_gain_m: number | null
          id: string
          location: string | null
          storage_path: string | null
          tags: string[] | null
          technicity: number | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          content_type: Database["public"]["Enums"]["content_type"]
          created_at?: string
          created_by: string
          description?: string | null
          distance_km?: number | null
          elevation_gain_m?: number | null
          id?: string
          location?: string | null
          storage_path?: string | null
          tags?: string[] | null
          technicity?: number | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          content_type?: Database["public"]["Enums"]["content_type"]
          created_at?: string
          created_by?: string
          description?: string | null
          distance_km?: number | null
          elevation_gain_m?: number | null
          id?: string
          location?: string | null
          storage_path?: string | null
          tags?: string[] | null
          technicity?: number | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      daily_biometrics: {
        Row: {
          body_battery: number | null
          created_at: string
          energy_level: number | null
          garmin_readiness: number | null
          hrv: number | null
          id: string
          measurement_date: string
          mood: number | null
          notes: string | null
          resting_hr: number | null
          sleep_score: number | null
          soreness_score: number | null
          soreness_zones: string[] | null
          stress_level: number | null
          user_id: string
          vo2_max: number | null
          weight_kg: number | null
        }
        Insert: {
          body_battery?: number | null
          created_at?: string
          energy_level?: number | null
          garmin_readiness?: number | null
          hrv?: number | null
          id?: string
          measurement_date: string
          mood?: number | null
          notes?: string | null
          resting_hr?: number | null
          sleep_score?: number | null
          soreness_score?: number | null
          soreness_zones?: string[] | null
          stress_level?: number | null
          user_id: string
          vo2_max?: number | null
          weight_kg?: number | null
        }
        Update: {
          body_battery?: number | null
          created_at?: string
          energy_level?: number | null
          garmin_readiness?: number | null
          hrv?: number | null
          id?: string
          measurement_date?: string
          mood?: number | null
          notes?: string | null
          resting_hr?: number | null
          sleep_score?: number | null
          soreness_score?: number | null
          soreness_zones?: string[] | null
          stress_level?: number | null
          user_id?: string
          vo2_max?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          page_url: string | null
          status: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      free_workouts: {
        Row: {
          activity: string
          created_at: string
          distance_km: number | null
          duration_min: number | null
          id: string
          notes: string | null
          rpe: number | null
          user_id: string
          workout_date: string
        }
        Insert: {
          activity: string
          created_at?: string
          distance_km?: number | null
          duration_min?: number | null
          id?: string
          notes?: string | null
          rpe?: number | null
          user_id: string
          workout_date: string
        }
        Update: {
          activity?: string
          created_at?: string
          distance_km?: number | null
          duration_min?: number | null
          id?: string
          notes?: string | null
          rpe?: number | null
          user_id?: string
          workout_date?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_broadcast: boolean
          read_at: string | null
          recipient_id: string | null
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
          read_at?: string | null
          recipient_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_broadcast?: boolean
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      planned_workouts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_completed: boolean
          is_skipped: boolean
          phase: string | null
          race_id: string | null
          skip_reason: string | null
          target_distance_km: number | null
          target_duration_min: number | null
          target_elevation_m: number | null
          target_hr_max: number | null
          target_hr_min: number | null
          target_pace_sec_per_km: number | null
          title: string
          updated_at: string
          user_id: string
          week_number: number | null
          workout_date: string
          workout_type: Database["public"]["Enums"]["workout_type"]
          zone: Database["public"]["Enums"]["training_zone"] | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          is_skipped?: boolean
          phase?: string | null
          race_id?: string | null
          skip_reason?: string | null
          target_distance_km?: number | null
          target_duration_min?: number | null
          target_elevation_m?: number | null
          target_hr_max?: number | null
          target_hr_min?: number | null
          target_pace_sec_per_km?: number | null
          title: string
          updated_at?: string
          user_id: string
          week_number?: number | null
          workout_date: string
          workout_type: Database["public"]["Enums"]["workout_type"]
          zone?: Database["public"]["Enums"]["training_zone"] | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          is_skipped?: boolean
          phase?: string | null
          race_id?: string | null
          skip_reason?: string | null
          target_distance_km?: number | null
          target_duration_min?: number | null
          target_elevation_m?: number | null
          target_hr_max?: number | null
          target_hr_min?: number | null
          target_pace_sec_per_km?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          week_number?: number | null
          workout_date?: string
          workout_type?: Database["public"]["Enums"]["workout_type"]
          zone?: Database["public"]["Enums"]["training_zone"] | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_workouts_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          available_run_days: number[] | null
          available_strength_days: number[] | null
          avatar_url: string | null
          baseline_avg_pace_sec_per_km: number | null
          baseline_km_per_week: number | null
          bmi: number | null
          created_at: string
          date_of_birth: string | null
          display_preference: Database["public"]["Enums"]["display_preference"]
          full_name: string | null
          height_cm: number | null
          id: string
          is_suspended: boolean
          long_run_day: number | null
          max_hr: number | null
          metabolic_age: number | null
          onboarding_completed: boolean
          resting_hr: number | null
          subscription_end_date: string | null
          updated_at: string
          vo2_max: number | null
          weight_kg: number | null
        }
        Insert: {
          available_run_days?: number[] | null
          available_strength_days?: number[] | null
          avatar_url?: string | null
          baseline_avg_pace_sec_per_km?: number | null
          baseline_km_per_week?: number | null
          bmi?: number | null
          created_at?: string
          date_of_birth?: string | null
          display_preference?: Database["public"]["Enums"]["display_preference"]
          full_name?: string | null
          height_cm?: number | null
          id: string
          is_suspended?: boolean
          long_run_day?: number | null
          max_hr?: number | null
          metabolic_age?: number | null
          onboarding_completed?: boolean
          resting_hr?: number | null
          subscription_end_date?: string | null
          updated_at?: string
          vo2_max?: number | null
          weight_kg?: number | null
        }
        Update: {
          available_run_days?: number[] | null
          available_strength_days?: number[] | null
          avatar_url?: string | null
          baseline_avg_pace_sec_per_km?: number | null
          baseline_km_per_week?: number | null
          bmi?: number | null
          created_at?: string
          date_of_birth?: string | null
          display_preference?: Database["public"]["Enums"]["display_preference"]
          full_name?: string | null
          height_cm?: number | null
          id?: string
          is_suspended?: boolean
          long_run_day?: number | null
          max_hr?: number | null
          metabolic_age?: number | null
          onboarding_completed?: boolean
          resting_hr?: number | null
          subscription_end_date?: string | null
          updated_at?: string
          vo2_max?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      races: {
        Row: {
          created_at: string
          distance_km: number
          elevation_gain_m: number
          gear_checklist: Json | null
          goal_type: Database["public"]["Enums"]["race_goal_type"]
          id: string
          is_anchor: boolean
          name: string
          notes: string | null
          nutrition_plan: Json | null
          priority: Database["public"]["Enums"]["race_priority"]
          race_date: string
          race_type: Database["public"]["Enums"]["race_type"]
          target_pace_sec_per_km: number | null
          target_time_minutes: number | null
          terrain_profile: Database["public"]["Enums"]["terrain_profile"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_km: number
          elevation_gain_m?: number
          gear_checklist?: Json | null
          goal_type?: Database["public"]["Enums"]["race_goal_type"]
          id?: string
          is_anchor?: boolean
          name: string
          notes?: string | null
          nutrition_plan?: Json | null
          priority?: Database["public"]["Enums"]["race_priority"]
          race_date: string
          race_type?: Database["public"]["Enums"]["race_type"]
          target_pace_sec_per_km?: number | null
          target_time_minutes?: number | null
          terrain_profile?: Database["public"]["Enums"]["terrain_profile"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          distance_km?: number
          elevation_gain_m?: number
          gear_checklist?: Json | null
          goal_type?: Database["public"]["Enums"]["race_goal_type"]
          id?: string
          is_anchor?: boolean
          name?: string
          notes?: string | null
          nutrition_plan?: Json | null
          priority?: Database["public"]["Enums"]["race_priority"]
          race_date?: string
          race_type?: Database["public"]["Enums"]["race_type"]
          target_pace_sec_per_km?: number | null
          target_time_minutes?: number | null
          terrain_profile?: Database["public"]["Enums"]["terrain_profile"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strength_exercises: {
        Row: {
          category: Database["public"]["Enums"]["strength_category"]
          created_at: string
          created_by: string | null
          cues: string | null
          description: string | null
          difficulty: number | null
          equipment: string | null
          id: string
          image_url: string | null
          name: string
          phase_relevance:
            | Database["public"]["Enums"]["training_phase"][]
            | null
          target_muscles: string[] | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["strength_category"]
          created_at?: string
          created_by?: string | null
          cues?: string | null
          description?: string | null
          difficulty?: number | null
          equipment?: string | null
          id?: string
          image_url?: string | null
          name: string
          phase_relevance?:
            | Database["public"]["Enums"]["training_phase"][]
            | null
          target_muscles?: string[] | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["strength_category"]
          created_at?: string
          created_by?: string | null
          cues?: string | null
          description?: string | null
          difficulty?: number | null
          equipment?: string | null
          id?: string
          image_url?: string | null
          name?: string
          phase_relevance?:
            | Database["public"]["Enums"]["training_phase"][]
            | null
          target_muscles?: string[] | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      strength_session_exercises: {
        Row: {
          created_at: string
          display_order: number
          exercise_id: string | null
          id: string
          is_done: boolean
          load_kg: number | null
          notes: string | null
          reps: string | null
          rest_sec: number | null
          session_id: string
          sets: number | null
          tempo: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          exercise_id?: string | null
          id?: string
          is_done?: boolean
          load_kg?: number | null
          notes?: string | null
          reps?: string | null
          rest_sec?: number | null
          session_id: string
          sets?: number | null
          tempo?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          exercise_id?: string | null
          id?: string
          is_done?: boolean
          load_kg?: number | null
          notes?: string | null
          reps?: string | null
          rest_sec?: number | null
          session_id?: string
          sets?: number | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strength_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "strength_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strength_session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "strength_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      strength_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_min: number | null
          id: string
          is_completed: boolean
          notes: string | null
          phase: Database["public"]["Enums"]["training_phase"] | null
          rpe: number | null
          session_date: string
          session_type: Database["public"]["Enums"]["strength_session_type"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          is_completed?: boolean
          notes?: string | null
          phase?: Database["public"]["Enums"]["training_phase"] | null
          rpe?: number | null
          session_date: string
          session_type: Database["public"]["Enums"]["strength_session_type"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          is_completed?: boolean
          notes?: string | null
          phase?: Database["public"]["Enums"]["training_phase"] | null
          rpe?: number | null
          session_date?: string
          session_type?: Database["public"]["Enums"]["strength_session_type"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_zones: {
        Row: {
          updated_at: string
          user_id: string
          z1_hr_max: number | null
          z1_hr_min: number | null
          z1_pace_sec: number | null
          z2_hr_max: number | null
          z2_hr_min: number | null
          z2_pace_sec: number | null
          z3_hr_max: number | null
          z3_hr_min: number | null
          z3_pace_sec: number | null
          z4_hr_max: number | null
          z4_hr_min: number | null
          z4_pace_sec: number | null
          z5_hr_max: number | null
          z5_hr_min: number | null
          z5_pace_sec: number | null
        }
        Insert: {
          updated_at?: string
          user_id: string
          z1_hr_max?: number | null
          z1_hr_min?: number | null
          z1_pace_sec?: number | null
          z2_hr_max?: number | null
          z2_hr_min?: number | null
          z2_pace_sec?: number | null
          z3_hr_max?: number | null
          z3_hr_min?: number | null
          z3_pace_sec?: number | null
          z4_hr_max?: number | null
          z4_hr_min?: number | null
          z4_pace_sec?: number | null
          z5_hr_max?: number | null
          z5_hr_min?: number | null
          z5_pace_sec?: number | null
        }
        Update: {
          updated_at?: string
          user_id?: string
          z1_hr_max?: number | null
          z1_hr_min?: number | null
          z1_pace_sec?: number | null
          z2_hr_max?: number | null
          z2_hr_min?: number | null
          z2_pace_sec?: number | null
          z3_hr_max?: number | null
          z3_hr_min?: number | null
          z3_pace_sec?: number | null
          z4_hr_max?: number | null
          z4_hr_min?: number | null
          z4_pace_sec?: number | null
          z5_hr_max?: number | null
          z5_hr_min?: number | null
          z5_pace_sec?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      content_type: "video" | "article" | "gpx"
      display_preference: "pace" | "distance" | "time" | "heart_rate"
      race_goal_type:
        | "finish"
        | "target_time"
        | "target_pace"
        | "target_distance"
        | "target_elevation"
      race_priority: "A" | "B" | "C"
      race_type: "official" | "personal" | "training_goal"
      strength_category:
        | "legs"
        | "push"
        | "pull"
        | "core"
        | "plyo"
        | "specific"
        | "mobility"
      strength_session_type:
        | "max_strength"
        | "muscular_endurance"
        | "core"
        | "plyo"
        | "specific"
        | "mobility"
      terrain_profile: "rolling" | "big_climbs" | "sustained" | "mixed"
      training_phase: "transition" | "base" | "build" | "specific" | "taper"
      training_zone: "Z1" | "Z2" | "Z3" | "Z4" | "Z5"
      workout_type:
        | "easy_z2"
        | "long_run"
        | "tempo"
        | "intervals"
        | "hill_repeats"
        | "vert_session"
        | "downhill_repeats"
        | "recovery"
        | "rest"
        | "strength"
        | "cross_training"
        | "race"
        | "hike"
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
      app_role: ["admin", "user"],
      content_type: ["video", "article", "gpx"],
      display_preference: ["pace", "distance", "time", "heart_rate"],
      race_goal_type: [
        "finish",
        "target_time",
        "target_pace",
        "target_distance",
        "target_elevation",
      ],
      race_priority: ["A", "B", "C"],
      race_type: ["official", "personal", "training_goal"],
      strength_category: [
        "legs",
        "push",
        "pull",
        "core",
        "plyo",
        "specific",
        "mobility",
      ],
      strength_session_type: [
        "max_strength",
        "muscular_endurance",
        "core",
        "plyo",
        "specific",
        "mobility",
      ],
      terrain_profile: ["rolling", "big_climbs", "sustained", "mixed"],
      training_phase: ["transition", "base", "build", "specific", "taper"],
      training_zone: ["Z1", "Z2", "Z3", "Z4", "Z5"],
      workout_type: [
        "easy_z2",
        "long_run",
        "tempo",
        "intervals",
        "hill_repeats",
        "vert_session",
        "downhill_repeats",
        "recovery",
        "rest",
        "strength",
        "cross_training",
        "race",
        "hike",
      ],
    },
  },
} as const
