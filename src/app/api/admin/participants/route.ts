/**
 * GET    /api/admin/participants?search=&page=1&limit=20  – paginated list
 * POST   /api/admin/participants  { id, action:'reset' }  – reset scan status
 * PUT    /api/admin/participants  { id, name, meal }      – edit participant
 * DELETE /api/admin/participants?id=USER001               – delete participant
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const pageRaw = Number.parseInt(searchParams.get('page') || '1', 10);
    const limitRaw = Number.parseInt(searchParams.get('limit') || '20', 10);
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
    const from   = (page - 1) * limit;
    const to     = from + limit - 1;

    let query = supabase
      .from('participants')
      .select('id, name, meal, scanned, scanned_at, scanned_meals', { count: 'exact' })
      .order('id', { ascending: true })
      .range(from, to);

    if (search) {
      query = query.or(`id.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('[GET /api/admin/participants]', err);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json();
    if (!id || action !== 'reset')
      return NextResponse.json({ success: false, message: 'Invalid request.' }, { status: 400 });

    const { error } = await supabase
      .from('participants')
      .update({ scanned: false, scanned_at: null, scanned_meals: [] })
      .eq('id', String(id).toUpperCase());

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: `Scan reset for ${id}.` });
  } catch (err) {
    console.error('[POST /api/admin/participants]', err);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, name, meal } = await req.json();
    if (!id || !name || !meal)
      return NextResponse.json({ success: false, message: 'id, name, and meal are required.' }, { status: 400 });

    const { data, error } = await supabase
      .from('participants')
      .update({ name: String(name).trim(), meal: String(meal).trim().toUpperCase() })
      .eq('id', String(id).toUpperCase())
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: `Updated ${id}.`, participant: data });
  } catch (err) {
    console.error('[PUT /api/admin/participants]', err);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id)
      return NextResponse.json({ success: false, message: 'id query param required.' }, { status: 400 });

    const { error } = await supabase
      .from('participants')
      .delete()
      .eq('id', String(id).toUpperCase());

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: `Deleted ${id}.` });
  } catch (err) {
    console.error('[DELETE /api/admin/participants]', err);
    return NextResponse.json({ success: false, message: 'Internal server error.' }, { status: 500 });
  }
}
