/**
 * POST /api/bulk-sync
 * Body: { logs: Array<{ id, meal, scanned_at }> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isValidMeal, normalizeScannedMeals } from '@/lib/meals';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { logs } = body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No logs provided.' },
        { status: 400 },
      );
    }

    const capped = logs.slice(0, 500);
    const results = { synced: 0, skipped: 0, errors: 0 };
    const syncedKeys: string[] = [];

    for (const log of capped) {
      const { id, meal, scanned_at } = log;
      if (!id || !meal) {
        results.errors++;
        continue;
      }

      const sanitizedId = String(id).trim().toUpperCase();
      const sanitizedMeal = String(meal).trim().toUpperCase();
      if (!sanitizedId || !sanitizedMeal) {
        results.errors++;
        continue;
      }
      if (!isValidMeal(sanitizedMeal)) {
        results.errors++;
        continue;
      }

      const { data: row, error: fetchErr } = await supabase
        .from('participants')
        .select('scanned_meals')
        .eq('id', sanitizedId)
        .single();

      if (fetchErr || !row) {
        results.errors++;
        continue;
      }

      const prev = normalizeScannedMeals(row.scanned_meals);
      if (prev.includes(sanitizedMeal)) {
        results.skipped++;
        continue;
      }

      let ts = new Date().toISOString();
      if (scanned_at) {
        const parsed = new Date(scanned_at);
        if (!isNaN(parsed.getTime())) ts = parsed.toISOString();
      }

      const nextMeals = [...new Set([...prev, sanitizedMeal])];

      const { data: updated, error } = await supabase
        .from('participants')
        .update({
          scanned_meals: nextMeals,
          scanned: true,
          scanned_at: ts,
        })
        .eq('id', sanitizedId)
        .select('id');

      if (error) {
        results.errors++;
        continue;
      }
      if (!updated?.length) {
        results.errors++;
        continue;
      }

      syncedKeys.push(`${sanitizedId}|${sanitizedMeal}`);
      results.synced++;
    }

    return NextResponse.json({ success: true, results, syncedKeys });
  } catch (err) {
    console.error('[/api/bulk-sync] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
