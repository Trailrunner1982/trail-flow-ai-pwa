ALTER TABLE public.daily_biometrics
  ADD COLUMN IF NOT EXISTS soreness_score smallint,
  ADD COLUMN IF NOT EXISTS soreness_zones text[],
  ADD COLUMN IF NOT EXISTS mood smallint,
  ADD COLUMN IF NOT EXISTS weight_kg numeric;