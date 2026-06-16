/**
 * GET /api/admin/stats
 * mealStats = servings per line (everyone is eligible; total = headcount).
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { MEALS, normalizeScannedMeals } from '@/lib/meals';

export async function GET() {
  try {
    const { count: total } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true });

    const { data: rows } = await supabase.from('participants').select('meal, scanned, scanned_meals');

    const t = total ?? 0;
    const mealStats: Record<string, { total: number; scanned: number }> = {};
    for (const m of MEALS) mealStats[m] = { total: t, scanned: 0 };

    let peopleWithAnyMeal = 0;

    for (const row of rows || []) {
      let list = normalizeScannedMeals(row.scanned_meals);
      if (list.length === 0 && row.scanned && row.meal != null && String(row.meal).trim()) {
        list = [String(row.meal).trim().toUpperCase()];
      }
      if (list.length > 0) peopleWithAnyMeal++;

      for (const m of list) {
        if (m in mealStats) mealStats[m].scanned++;
      }
    }

    return NextResponse.json({
      success: true,
      total: t,
      scanned: peopleWithAnyMeal,
      pending: t - peopleWithAnyMeal,
      mealStats,
    });
  } catch (err) {
    console.error('[/api/admin/stats]', err);
    return NextResponse.json({ success: false, message: 'Error fetching stats.' }, { status: 500 });
  }
}
