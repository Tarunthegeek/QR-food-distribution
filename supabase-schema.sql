-- ============================================================
-- FoodPass - Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Create the participants table
CREATE TABLE IF NOT EXISTS public.participants (
  id             TEXT PRIMARY KEY,              -- e.g. USER0001
  name           TEXT NOT NULL,
  meal           TEXT NOT NULL,                 -- Registration / cohort tag (CSV); scan meal chosen on device
  scanned        BOOLEAN NOT NULL DEFAULT false, -- true if received at least one meal
  scanned_at     TIMESTAMPTZ DEFAULT NULL,      -- last scan time (any meal)
  scanned_meals  JSONB NOT NULL DEFAULT '[]'::jsonb -- distinct meals served e.g. ["DINNER","SNACKS"]
);

-- Index for faster scanned queries (admin stats)
CREATE INDEX IF NOT EXISTS idx_participants_scanned ON public.participants (scanned);
CREATE INDEX IF NOT EXISTS idx_participants_meal    ON public.participants (meal);

-- Enable Row Level Security (RLS)
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations via anon key (service is internal)
-- For production, you'd restrict this further with authenticated policies.
CREATE POLICY "Allow all for anon" ON public.participants
  FOR ALL USING (true) WITH CHECK (true);

-- ── Sample data (optional, for testing) ─────────────────────
-- INSERT INTO public.participants (id, name, meal) VALUES
--   ('USER0001', 'Alice Johnson', 'LUNCH'),
--   ('USER0002', 'Bob Smith',     'DINNER'),
--   ('USER0003', 'Carol White',   'LUNCH'),
--   ('USER0004', 'Dave Brown',    'BREAKFAST');
