import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton client for browser usage
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types matching the participants table
export interface Participant {
  id: string;
  name: string;
  meal: string; // Registration / cohort (CSV); serving line is chosen on scanner
  scanned: boolean; // true once any meal recorded
  scanned_at: string | null; // last scan (any meal)
  /** Meals already served (from DB jsonb), uppercase strings */
  scanned_meals?: string[];
}

export interface ScanLog {
  id: string;
  meal: string;
  scanned_at: string;
}
