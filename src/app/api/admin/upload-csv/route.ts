/**
 * POST /api/admin/upload-csv
 * Parses a CSV of participants and bulk-upserts them into Supabase.
 * Expected CSV columns: id, name, meal
 * Uses upsert so existing rows update name/meal but preserve scanned state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided.' }, { status: 400 });
    }

    const text = await file.text();
    // Handle both \r\n (Windows) and \n (Unix) line endings
    const lines = text.trim().split(/\r?\n/);

    if (lines.length < 2) {
      return NextResponse.json({ success: false, message: 'CSV must have at least one data row.' }, { status: 400 });
    }

    // Parse header (case-insensitive, trimmed, strip BOM)
    const rawHeader = lines[0].replace(/^\uFEFF/, ''); // strip UTF-8 BOM if present
    const headers = rawHeader.split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const idIdx   = headers.indexOf('id');
    const nameIdx = headers.indexOf('name');
    const mealIdx = headers.indexOf('meal');

    if (idIdx === -1 || nameIdx === -1 || mealIdx === -1) {
      return NextResponse.json(
        { success: false, message: 'CSV must have columns: id, name, meal' },
        { status: 422 }
      );
    }

    const participants = lines.slice(1)
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
        return {
          id:   cols[idIdx]?.toUpperCase()?.trim(),
          name: cols[nameIdx]?.trim(),
          meal: cols[mealIdx]?.toUpperCase()?.trim(),
        };
      })
      .filter((p) => p.id && p.name && p.meal); // skip blank/incomplete rows

    if (participants.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid rows found.' }, { status: 422 });
    }

    // Upsert: on conflict of `id`, update name and meal but do NOT overwrite scanned/scanned_at.
    // ignoreDuplicates: false means we DO update existing rows.
    const { error } = await supabase
      .from('participants')
      .upsert(
        participants.map((p) => ({ id: p.id, name: p.name, meal: p.meal })),
        { onConflict: 'id', ignoreDuplicates: false }
      );

    if (error) {
      console.error('[upload-csv] Supabase error:', error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, inserted: participants.length });
  } catch (err) {
    console.error('[upload-csv] Error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}
