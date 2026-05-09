-- Enums
CREATE TYPE strength_category AS ENUM ('legs','push','pull','core','plyo','specific','mobility');
CREATE TYPE strength_session_type AS ENUM ('max_strength','muscular_endurance','core','plyo','specific','mobility');
CREATE TYPE training_phase AS ENUM ('transition','base','build','specific','taper');

-- Library
CREATE TABLE public.strength_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category strength_category NOT NULL,
  equipment text,
  description text,
  cues text,
  video_url text,
  image_url text,
  target_muscles text[] DEFAULT '{}',
  phase_relevance training_phase[] DEFAULT '{}',
  difficulty smallint DEFAULT 2,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strength_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "everyone reads exercises" ON public.strength_exercises FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages exercises" ON public.strength_exercises FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Sessions
CREATE TABLE public.strength_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_date date NOT NULL,
  session_type strength_session_type NOT NULL,
  phase training_phase,
  title text NOT NULL,
  notes text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  rpe smallint,
  duration_min integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strength_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users crud own strength sessions" ON public.strength_sessions FOR ALL
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE INDEX idx_strength_sessions_user_date ON public.strength_sessions(user_id, session_date);

-- Junction
CREATE TABLE public.strength_session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.strength_sessions(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.strength_exercises(id) ON DELETE SET NULL,
  display_order smallint NOT NULL DEFAULT 0,
  sets smallint,
  reps text,
  tempo text,
  rest_sec integer,
  load_kg numeric,
  notes text,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.strength_session_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users crud own session exercises" ON public.strength_session_exercises FOR ALL
  USING (EXISTS (SELECT 1 FROM public.strength_sessions s WHERE s.id = session_id AND (s.user_id = auth.uid() OR has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.strength_sessions s WHERE s.id = session_id AND (s.user_id = auth.uid() OR has_role(auth.uid(),'admin'))));

-- Triggers updated_at
CREATE TRIGGER trg_strength_exercises_updated BEFORE UPDATE ON public.strength_exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_strength_sessions_updated BEFORE UPDATE ON public.strength_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed library (30 essential trail running exercises)
INSERT INTO public.strength_exercises (name, category, equipment, description, cues, target_muscles, phase_relevance, difficulty) VALUES
('Back Squat','legs','barbell','Agachamento com barra nas costas. Base de força máxima para trail.','Peito alto, joelhos alinhados com pés, descida controlada até paralelo.','{quadríceps,glúteos,core}','{base,build,specific}',3),
('Front Squat','legs','barbell','Agachamento frontal — exige mais postura e core.','Cotovelos altos, tronco vertical.','{quadríceps,core,glúteos}','{build,specific}',3),
('Bulgarian Split Squat','legs','dumbbells','Agachamento unilateral com pé traseiro elevado.','Joelho da frente sobre o tornozelo, tronco ligeiramente inclinado.','{quadríceps,glúteos}','{base,build,specific}',2),
('Step-Up','legs','dumbbells/box','Subida a caixa alta — específica para uphill.','Empurra com toda a planta, evita impulsionar com pé de trás.','{quadríceps,glúteos}','{base,build,specific,transition}',2),
('Walking Lunges','legs','bodyweight/dumbbells','Lunges em deslocamento.','Passada longa, joelho de trás quase toca o chão.','{quadríceps,glúteos,adutores}','{transition,base,build}',2),
('Reverse Lunge','legs','dumbbells','Lunge para trás — mais amigo dos joelhos.','Tronco vertical, descida controlada.','{quadríceps,glúteos}','{transition,base}',1),
('Romanian Deadlift','pull','barbell','Peso morto romeno — cadeia posterior.','Joelhos ligeiramente fletidos, anca para trás, costas neutras.','{isquiotibiais,glúteos,lombar}','{base,build,specific}',2),
('Single-Leg RDL','pull','dumbbells','Peso morto romeno unilateral.','Anca alinhada com o ombro do pé apoiado.','{isquiotibiais,glúteos,core}','{base,build,specific}',2),
('Hip Thrust','legs','barbell','Extensão de anca — força glútea.','Queixo para o peito, costelas para baixo, contrai glúteos no topo.','{glúteos,isquiotibiais}','{base,build,specific}',1),
('Calf Raise','legs','bodyweight/dumbbells','Elevação de gémeos.','Subida explosiva, descida lenta abaixo do degrau.','{gastrocnémio,sóleo}','{transition,base,build,specific}',1),
('Single-Leg Calf Raise','legs','bodyweight','Elevação de gémeo unilateral — essencial trail.','Amplitude completa, equilíbrio sem apoio.','{gastrocnémio,sóleo}','{transition,base,build,specific}',2),
('Box Jump','plyo','box','Salto a caixa — potência para uphill.','Aterragem suave, joelhos alinhados.','{quadríceps,glúteos,gémeos}','{build,specific}',2),
('Depth Jump','plyo','box','Drop e salto — RBE para descidas.','Contacto curto, mãos acompanham.','{quadríceps,glúteos,gémeos}','{build,specific}',3),
('Pogo Hops','plyo','bodyweight','Saltinhos no lugar — rigidez do tornozelo.','Contacto < 0.2s, joelhos quase rígidos.','{gémeos,tibial}','{base,build,specific}',1),
('Single-Leg Hop','plyo','bodyweight','Saltos unilaterais — específicos trail.','Aterragem controlada, sem colapso do joelho.','{quadríceps,glúteos,gémeos}','{build,specific}',2),
('Lateral Bound','plyo','bodyweight','Saltos laterais — estabilidade trail.','Aterra num pé, amortece, lança para o outro lado.','{glúteos,adutores}','{build,specific}',2),
('Push-Up','push','bodyweight','Flexão clássica.','Corpo em prancha, cotovelos a 45°.','{peito,tríceps,core}','{transition,base,build}',1),
('Dumbbell Row','pull','dumbbells','Remada unilateral.','Cotovelo junto ao tronco, escápula retraída.','{dorsal,trapézio,bíceps}','{transition,base,build}',1),
('Pull-Up','pull','bar','Tração na barra.','Escápulas primeiro, queixo acima da barra.','{dorsal,bíceps,core}','{base,build}',3),
('Overhead Press','push','dumbbells/barbell','Pressão acima da cabeça.','Glúteos e core ativos, evita extensão lombar.','{deltoides,tríceps,core}','{base,build}',2),
('Plank','core','bodyweight','Prancha frontal.','Anca alinhada, glúteos contraídos.','{core,glúteos}','{transition,base,build,specific,taper}',1),
('Side Plank','core','bodyweight','Prancha lateral.','Anca elevada, corpo em linha.','{oblíquos,core,glúteo médio}','{transition,base,build,specific,taper}',1),
('Dead Bug','core','bodyweight','Anti-extensão lombar deitado.','Lombar fixa no chão, movimento lento.','{core}','{transition,base,build,taper}',1),
('Bird Dog','core','bodyweight','Estabilidade contralateral.','Anca não roda, movimento lento.','{core,glúteos,lombar}','{transition,base,build,taper}',1),
('Pallof Press','core','band/cable','Anti-rotação.','Braços rígidos, resiste à rotação.','{core,oblíquos}','{base,build,specific}',2),
('Hanging Leg Raise','core','bar','Elevação de pernas suspenso.','Sem balanço, anca enrola no topo.','{core,flexores anca}','{build,specific}',3),
('Weighted Vest Hike','specific','vest','Caminhada com colete em subida — específica trail.','Cadência alta, postura ligeiramente inclinada.','{quadríceps,glúteos,gémeos,core}','{build,specific}',2),
('Uphill Bounding','specific','none','Saltos longos em subida.','Impulso máximo, braços ativos.','{quadríceps,glúteos,gémeos}','{specific}',3),
('Downhill Repeats','specific','none','Repetições em descida — RBE.','Cadência alta, evita travar com calcanhar.','{quadríceps excêntrico}','{specific}',3),
('Hip 90/90 Mobility','mobility','none','Mobilidade da anca em 90/90.','Tronco vertical, transições lentas.','{anca}','{transition,base,build,specific,taper}',1);