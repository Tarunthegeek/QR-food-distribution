/**
 * POST /api/scan
 * Body: { id: string, meal: string } — meal is the serving line the operator selected.
 * Same participant may receive multiple meals; duplicate = same id + same meal again.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isValidMeal, normalizeScannedMeals } from '@/lib/meals';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, meal } = body;

    if (!id || typeof id !== 'string' || !meal || typeof meal !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invalid request: id and meal are required.' },
        { status: 400 },
      );
    }

    const sanitizedId = id.trim().toUpperCase();
    const sanitizedMeal = meal.trim().toUpperCase();

    if (!sanitizedId || !sanitizedMeal) {
      return NextResponse.json(
        { success: false, message: 'id and meal must not be blank.' },
        { status: 400 },
      );
    }

    if (!isValidMeal(sanitizedMeal)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid meal "${sanitizedMeal}". Use: BREAKFAST, LUNCH, DINNER, SNACKS.`,
        },
        { status: 400 },
      );
    }

    const { data: participant, error: fetchError } = await supabase
      .from('participants')
      .select('id, name, meal, scanned, scanned_at, scanned_meals')
      .eq('id', sanitizedId)
      .single();

    if (fetchError || !participant) {
      return NextResponse.json(
        { success: false, message: 'Participant not found.' },
        { status: 404 },
      );
    }

    const prevMeals = normalizeScannedMeals(participant.scanned_meals);
    if (prevMeals.includes(sanitizedMeal)) {
      const timeStr = participant.scanned_at
        ? new Date(participant.scanned_at).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour12: true,
          })
        : 'earlier';
      return NextResponse.json(
        {
          success: false,
          alreadyScanned: true,
          message: `${sanitizedMeal} was already recorded for ${participant.name} (${timeStr}).`,
          participant,
        },
        { status: 409 },
      );
    }

    const scanned_at = new Date().toISOString();
    const nextMeals = [...new Set([...prevMeals, sanitizedMeal])];

    const { data: updatedRows, error: updateError } = await supabase
      .from('participants')
      .update({
        scanned_meals: nextMeals,
        scanned: true,
        scanned_at,
      })
      .eq('id', sanitizedId)
      .select('id');

    if (updateError) {
      console.error('[/api/scan] Update error:', updateError);
      if (
        String(updateError.message || '').toLowerCase().includes('scanned_meals') ||
        String(updateError.message || '').toLowerCase().includes('column')
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Database is missing column scanned_meals. Run supabase-migration-scanned-meals.sql in Supabase.',
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { success: false, message: 'Database error while marking scan.' },
        { status: 500 },
      );
    }

    if (!updatedRows?.length) {
      return NextResponse.json(
        { success: false, message: 'Could not update participant (not found).', alreadyScanned: true },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `${sanitizedMeal} recorded for ${participant.name}!`,
      participant: {
        ...participant,
        scanned: true,
        scanned_at,
        scanned_meals: nextMeals,
      },
    });
  } catch (err) {
    console.error('[/api/scan] Unexpected error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
