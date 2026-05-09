// Shared types for the interactive calendar (real DB + in-memory simulator).
export interface CalendarPlannedWorkout {
  id?: string; // present in DB mode, absent in simulator memory mode
  workout_date: string; // YYYY-MM-DD
  workout_type: string;
  zone: string | null;
  target_distance_km: number | null;
  target_elevation_m: number | null;
  target_duration_min: number | null;
  target_pace_sec_per_km: number | null;
  title: string;
  description: string | null;
  week_number: number | null;
  phase: string | null;
}

export interface CalendarCompletedWorkout {
  id?: string;
  planned_workout_id?: string | null;
  workout_date: string;
  actual_distance_km: number | null;
  actual_elevation_m: number | null;
  actual_duration_min: number | null;
  actual_avg_pace_sec_per_km: number | null;
  rpe: number | null;
  notes: string | null;
}

export type Verdict = "great" | "good" | "ok" | "poor" | "concern";

export interface QuickFeedback {
  verdict: Verdict;
  headline: string;
  highlights: string[];
  improvements: string[];
  next_session_tip: string;
}

export interface AdaptationProposal {
  workout_date: string;
  reason: string;
  new_title: string;
  new_target_distance_km?: number | null;
  new_target_elevation_m?: number | null;
  new_target_duration_min?: number | null;
}

export interface DeepFeedback {
  verdict: Verdict;
  summary: string;
  highlights: string[];
  improvements: string[];
  adaptations: AdaptationProposal[];
}

export interface CalendarStorage {
  /** Save executed workout (and return updated record). */
  saveCompleted: (
    planned: CalendarPlannedWorkout,
    data: Omit<CalendarCompletedWorkout, "workout_date">,
  ) => Promise<CalendarCompletedWorkout>;
  /** Apply a list of adaptations to planned workouts. */
  applyAdaptations: (adaptations: AdaptationProposal[]) => Promise<void>;
  /** Optional: persist AI feedback to history (no-op in simulator). */
  persistFeedback?: (
    mode: "quick" | "deep",
    planned: CalendarPlannedWorkout,
    executed: Omit<CalendarCompletedWorkout, "workout_date">,
    result: QuickFeedback | DeepFeedback,
  ) => Promise<void>;
}
