
-- ============ PROFILES: campos avançados ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_hr integer,
  ADD COLUMN IF NOT EXISTS resting_hr integer,
  ADD COLUMN IF NOT EXISTS vo2_max numeric,
  ADD COLUMN IF NOT EXISTS metabolic_age integer,
  ADD COLUMN IF NOT EXISTS available_run_days integer[] DEFAULT ARRAY[1,2,3,4,5,6]::integer[],
  ADD COLUMN IF NOT EXISTS available_strength_days integer[] DEFAULT ARRAY[2,4]::integer[],
  ADD COLUMN IF NOT EXISTS long_run_day integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- ============ DAILY BIOMETRICS: novos campos ============
ALTER TABLE public.daily_biometrics
  ADD COLUMN IF NOT EXISTS resting_hr integer,
  ADD COLUMN IF NOT EXISTS energy_level integer;

-- ============ RACES: âncora + tipo ============
DO $$ BEGIN
  CREATE TYPE public.race_type AS ENUM ('official','personal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS is_anchor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS race_type public.race_type NOT NULL DEFAULT 'official';

-- ============ MESSAGES (admin <-> atleta + broadcast) ============
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid,            -- null = broadcast
  body text NOT NULL,
  is_broadcast boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id, created_at DESC);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own or broadcast"
ON public.messages FOR SELECT
USING (
  is_broadcast
  OR sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "users send messages"
ON public.messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND (
    -- broadcast só por admin
    (is_broadcast = false) OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "recipients mark read"
ON public.messages FOR UPDATE
USING (recipient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete messages"
ON public.messages FOR DELETE
USING (sender_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- ============ CONTENT LIBRARY ============
DO $$ BEGIN
  CREATE TYPE public.content_type AS ENUM ('video','article','gpx');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.content_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  content_type public.content_type NOT NULL,
  title text NOT NULL,
  description text,
  url text,                       -- vídeo/artigo
  storage_path text,              -- gpx/file uploaded
  technicity smallint CHECK (technicity BETWEEN 1 AND 5),
  location text,
  distance_km numeric,
  elevation_gain_m integer,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "everyone can read content"
ON public.content_library FOR SELECT
TO authenticated USING (true);

CREATE POLICY "admin manages content"
ON public.content_library FOR ALL
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_content_updated
BEFORE UPDATE ON public.content_library
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ FREE WORKOUTS (treinos não planeados) ============
CREATE TABLE IF NOT EXISTS public.free_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workout_date date NOT NULL,
  activity text NOT NULL,         -- swim, bike, gym, hike...
  duration_min integer,
  distance_km numeric,
  notes text,
  rpe smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.free_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users crud own free workouts"
ON public.free_workouts FOR ALL
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- ============ TRAINING ZONES (cache calculada) ============
CREATE TABLE IF NOT EXISTS public.training_zones (
  user_id uuid PRIMARY KEY,
  z1_hr_min int, z1_hr_max int, z1_pace_sec int,
  z2_hr_min int, z2_hr_max int, z2_pace_sec int,
  z3_hr_min int, z3_hr_max int, z3_pace_sec int,
  z4_hr_min int, z4_hr_max int, z4_pace_sec int,
  z5_hr_min int, z5_hr_max int, z5_pace_sec int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own zones"
ON public.training_zones FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "users upsert own zones"
ON public.training_zones FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own zones"
ON public.training_zones FOR UPDATE
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- ============ ADMIN GLOBAL READ ACCESS (Modo Espelho) ============
-- admins podem ler/editar dados de qualquer atleta
CREATE POLICY "admin read all profiles"
ON public.profiles FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update all profiles"
ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read all biometrics"
ON public.daily_biometrics FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read all planned"
ON public.planned_workouts FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write all planned"
ON public.planned_workouts FOR ALL
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read all completed"
ON public.completed_workouts FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read all races"
ON public.races FOR SELECT USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read all feedback"
ON public.ai_feedback FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('gpx-files','gpx-files', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('content-media','content-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read gpx"
ON storage.objects FOR SELECT
USING (bucket_id = 'gpx-files');

CREATE POLICY "admin write gpx"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'gpx-files' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin update gpx"
ON storage.objects FOR UPDATE
USING (bucket_id = 'gpx-files' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin delete gpx"
ON storage.objects FOR DELETE
USING (bucket_id = 'gpx-files' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "public read content media"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-media');

CREATE POLICY "admin write content media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'content-media' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin update content media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'content-media' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin delete content media"
ON storage.objects FOR DELETE
USING (bucket_id = 'content-media' AND public.has_role(auth.uid(),'admin'));
