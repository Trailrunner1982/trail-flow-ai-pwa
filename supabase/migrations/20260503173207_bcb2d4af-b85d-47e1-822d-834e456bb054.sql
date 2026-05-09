-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.race_priority AS ENUM ('A', 'B', 'C');
CREATE TYPE public.race_goal_type AS ENUM ('finish', 'target_time', 'target_pace');
CREATE TYPE public.terrain_profile AS ENUM ('rolling', 'big_climbs', 'sustained', 'mixed');
CREATE TYPE public.workout_type AS ENUM (
  'easy_z2', 'long_run', 'tempo', 'intervals', 'hill_repeats',
  'vert_session', 'downhill_repeats', 'recovery', 'rest',
  'strength', 'cross_training', 'race'
);
CREATE TYPE public.training_zone AS ENUM ('Z1', 'Z2', 'Z3', 'Z4', 'Z5');
CREATE TYPE public.display_preference AS ENUM ('pace', 'distance', 'time', 'heart_rate');

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  date_of_birth DATE,
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,2),
  bmi NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE WHEN height_cm IS NOT NULL AND height_cm > 0 AND weight_kg IS NOT NULL
      THEN ROUND((weight_kg / ((height_cm/100.0) * (height_cm/100.0)))::numeric, 2)
    END
  ) STORED,
  baseline_km_per_week NUMERIC(5,2),
  baseline_avg_pace_sec_per_km INTEGER,
  display_preference public.display_preference NOT NULL DEFAULT 'pace',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- ============================================
-- RACES
-- ============================================
CREATE TABLE public.races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  race_date DATE NOT NULL,
  distance_km NUMERIC(6,2) NOT NULL,
  elevation_gain_m INTEGER NOT NULL DEFAULT 0,
  priority public.race_priority NOT NULL DEFAULT 'B',
  goal_type public.race_goal_type NOT NULL DEFAULT 'finish',
  target_time_minutes INTEGER,
  target_pace_sec_per_km INTEGER,
  terrain_profile public.terrain_profile NOT NULL DEFAULT 'mixed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_races_user_date ON public.races(user_id, race_date);

ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own races" ON public.races
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own races" ON public.races
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own races" ON public.races
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own races" ON public.races
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- DAILY BIOMETRICS
-- ============================================
CREATE TABLE public.daily_biometrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_date DATE NOT NULL,
  hrv INTEGER,
  garmin_readiness INTEGER,
  sleep_score INTEGER,
  stress_level INTEGER,
  vo2_max NUMERIC(5,2),
  body_battery INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, measurement_date)
);

CREATE INDEX idx_biometrics_user_date ON public.daily_biometrics(user_id, measurement_date DESC);

ALTER TABLE public.daily_biometrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own biometrics" ON public.daily_biometrics
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own biometrics" ON public.daily_biometrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own biometrics" ON public.daily_biometrics
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own biometrics" ON public.daily_biometrics
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- PLANNED WORKOUTS
-- ============================================
CREATE TABLE public.planned_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  race_id UUID REFERENCES public.races(id) ON DELETE SET NULL,
  workout_date DATE NOT NULL,
  workout_type public.workout_type NOT NULL,
  zone public.training_zone,
  target_distance_km NUMERIC(6,2),
  target_elevation_m INTEGER,
  target_duration_min INTEGER,
  target_pace_sec_per_km INTEGER,
  target_hr_min INTEGER,
  target_hr_max INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  week_number INTEGER,
  phase TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  is_skipped BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planned_user_date ON public.planned_workouts(user_id, workout_date);

ALTER TABLE public.planned_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own planned" ON public.planned_workouts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own planned" ON public.planned_workouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own planned" ON public.planned_workouts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own planned" ON public.planned_workouts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- COMPLETED WORKOUTS (check-out)
-- ============================================
CREATE TABLE public.completed_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_workout_id UUID REFERENCES public.planned_workouts(id) ON DELETE SET NULL,
  workout_date DATE NOT NULL,
  actual_distance_km NUMERIC(6,2),
  actual_elevation_m INTEGER,
  actual_duration_min INTEGER,
  actual_avg_pace_sec_per_km INTEGER,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_completed_user_date ON public.completed_workouts(user_id, workout_date DESC);

ALTER TABLE public.completed_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own completed" ON public.completed_workouts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own completed" ON public.completed_workouts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own completed" ON public.completed_workouts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own completed" ON public.completed_workouts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- AI FEEDBACK
-- ============================================
CREATE TABLE public.ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_date DATE NOT NULL,
  feedback_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  context_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_user_date ON public.ai_feedback(user_id, feedback_date DESC);

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own feedback" ON public.ai_feedback
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own feedback" ON public.ai_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own feedback" ON public.ai_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_races_updated BEFORE UPDATE ON public.races
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_planned_updated BEFORE UPDATE ON public.planned_workouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();