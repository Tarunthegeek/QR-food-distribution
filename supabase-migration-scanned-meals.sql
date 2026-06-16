-- Run once in Supabase SQL Editor for existing databases.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS scanned_meals jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.participants
SET scanned_meals = jsonb_build_array(upper(trim(meal)))
WHERE scanned = true
  AND jsonb_array_length(scanned_meals) = 0
  AND trim(meal) <> '';
