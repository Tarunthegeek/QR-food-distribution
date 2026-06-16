'use client';

/**
 * /generate – QR Code Generator (login-protected)
 * - Requires admin password (same session as /admin)
 * - Loads ALL participants from Supabase on mount
 * - Manually added entries are upserted to Supabase immediately
 * - QR codes auto-generate whenever the list changes
 * - QR payload: participant id only (volunteer picks meal on scanner).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { MEALS } from '@/lib/meals';

interface QREntry { id: string; name: string; meal?: string; scanned?: boolean; }

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

const MEAL_COLORS: Record<string, string> = {
  BREAKFAST: '#f59e0b', LUNCH: '#6c63ff', DINNER: '#8b5cf6', SNACKS: '#22d3ee',
};

export default function GeneratePage() {
  /* ── Auth ──────────────────────────────────────────────── */
  const [authed, setAuthed]   = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [showPw, setShowPw]   = useState(false);

  /* ── Data ──────────────────────────────────────────────── */
  const [entries, setEntries]     = useState<QREntry[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [manualId, setManualId]   = useState('');
  const [manualName, setManualName] = useState('');
  const [syncMsg, setSyncMsg]     = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [searchQ, setSearchQ]     = useState('');

  /* ── QR ────────────────────────────────────────────────── */
  const [generated, setGenerated] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const canvasRefs    = useRef<Record<string, HTMLCanvasElement | null>>({});
  const fileRef       = useRef<HTMLInputElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /* ── Login ─────────────────────────────────────────────── */
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem('admin_authed', '1');
    } else {
      setPwError('Incorrect password. Try again.');
    }
  }

  useEffect(() => {
    if (sessionStorage.getItem('admin_authed') === '1') setAuthed(true);
  }, []);

  /* ── Load from Supabase on auth ────────────────────────── */
  const loadFromDB = useCallback(async () => {
    setDbLoading(true);
    setSyncMsg('⏳ Loading participants…');
    try {
      let all: QREntry[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(`/api/admin/participants?page=${page}&limit=100`);
        const data = await res.json();
        if (!data.success || !data.data?.length) break;
        all = [...all, ...data.data];
        if (all.length >= data.total) break;
        page++;
      }
      setEntries(all);
      setSyncMsg(`✅ Loaded ${all.length} participants from database`);
      setTimeout(() => setSyncMsg(''), 4000);
    } catch {
      setSyncMsg('❌ Could not load from database');
    }
    setDbLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadFromDB();
  }, [authed, loadFromDB]);

  /* ── Draw QR on canvas ─────────────────────────────────── */
  const generateQRCanvas = useCallback(async (entry: QREntry, canvas: HTMLCanvasElement) => {
    const QRCode = (await import('qrcode')).default;
    await QRCode.toCanvas(canvas, entry.id, {
      width: 200, margin: 2,
      color: { dark: '#0b0f1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
  }, []);

  /* ── Generate all QR codes ─────────────────────────────── */
  const runGenerate = useCallback(async (list: QREntry[]) => {
    if (list.length === 0) return;
    setQrLoading(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise((r) => setTimeout(r, 100));
    for (const entry of list) {
      const canvas = canvasRefs.current[entry.id];
      if (canvas) await generateQRCanvas(entry, canvas);
    }
    setGenerated(true);
    setQrLoading(false);
  }, [generateQRCanvas]);

  useEffect(() => {
    if (entries.length > 0) { setGenerated(false); runGenerate(entries); }
    else setGenerated(false);
  }, [entries, runGenerate]);

  /* ── Upsert to Supabase ────────────────────────────────── */
  async function syncToDatabase(list: QREntry[]) {
    if (list.length === 0) return;
    setSyncMsg('⏳ Saving to database…');
    try {
      const csv = 'id,name,meal\n' + list.map((e) => `${e.id},${e.name},${e.meal}`).join('\n');
      const fd = new FormData();
      fd.append('file', new File([csv], 'participants.csv', { type: 'text/csv' }));
      const res  = await fetch('/api/admin/upload-csv', { method: 'POST', body: fd });
      const data = await res.json();
      setSyncMsg(data.success ? '✅ Saved to database' : `❌ ${data.message}`);
    } catch {
      setSyncMsg('❌ Could not reach database');
    }
    setTimeout(() => setSyncMsg(''), 4000);
  }

  /* ── Parse CSV upload ──────────────────────────────────── */
  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text    = ev.target?.result as string;
      // Handle both \r\n (Windows) and \n (Unix) line endings
      const lines   = text.trim().split(/\r?\n/);
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, ''));
      const idIdx   = headers.indexOf('id');
      const nameIdx = headers.indexOf('name');
      const mealIdx = headers.indexOf('meal');
      if (idIdx === -1 || nameIdx === -1 || mealIdx === -1) {
        alert('CSV must have columns: id, name, meal');
        setCsvFileName('');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      const parsed: QREntry[] = lines.slice(1)
        .map((line) => {
          const c = line.split(',').map((x) => x.trim().replace(/"/g, ''));
          const inputMeal = mealIdx !== -1 ? c[mealIdx]?.toUpperCase() : '';
          return { id: c[idIdx]?.toUpperCase(), name: c[nameIdx], meal: inputMeal || 'ALL' };
        })
        .filter((en) => en.id && en.name);
      if (parsed.length === 0) {
        alert('No valid rows found in CSV. Check column names and data.');
        setCsvFileName('');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      setEntries((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        parsed.forEach((p) => map.set(p.id, p));
        return Array.from(map.values());
      });
      await syncToDatabase(parsed);
      await loadFromDB();
      // Reset file input after successful import
      setCsvFileName('');
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsText(file);
  }

  /* ── Add manual entry ──────────────────────────────────── */
  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!manualId || !manualName) return;
    const newEntry: QREntry = { id: manualId.toUpperCase(), name: manualName, meal: 'ALL' };
    setEntries((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      map.set(newEntry.id, newEntry);
      return Array.from(map.values());
    });
    setManualId(''); setManualName('');
    await syncToDatabase([newEntry]);
  }

  /* ── Download PNG ──────────────────────────────────────── */
  function downloadQR(entry: QREntry) {
    const canvas = canvasRefs.current[entry.id];
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QR_${entry.id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  /* ── Delete from DB + local ────────────────────────────── */
  async function handleDelete(id: string) {
    try {
      await fetch(`/api/admin/participants?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      delete canvasRefs.current[id];
    } catch { alert('Delete failed.'); }
    setConfirmDeleteId(null);
  }

  /* ── Filtered entries ──────────────────────────────────── */
  const filtered = searchQ
    ? entries.filter((e) => e.name.toLowerCase().includes(searchQ.toLowerCase()) || e.id.includes(searchQ.toUpperCase()))
    : entries;

  /* ══════════════════════════════════════════════════════════
     LOGIN SCREEN
  ══════════════════════════════════════════════════════════ */
  if (!authed) {
    return (
      <div className="page" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem var(--page-px)' }}>
        <div className="glass" style={{ width: '100%', maxWidth: 380, padding: 'clamp(1.75rem, 5vw, 2.5rem) clamp(1.25rem, 4vw, 2rem)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '1.25rem',
              background: 'linear-gradient(135deg, #ff6584, #c0392b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', margin: '0 auto 1rem',
              boxShadow: '0 8px 32px rgba(255,101,132,0.35)',
            }}>🔖</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>QR Generator</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: '0.35rem' }}>Enter admin password to continue</p>
          </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <label htmlFor="gen-password" className="form-label">Admin Password</label>
              <input
                id="gen-password"
                type={showPw ? 'text' : 'password'}
                className="input"
                placeholder="Password"
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(''); }}
                autoFocus
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem', padding: '0.25rem' }}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>

            {pwError && <div className="alert alert-error">{pwError}</div>}

            <button id="gen-login-btn" type="submit" className="btn btn-primary btn-full">
              Unlock Generator
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Link href="/" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>← Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     MAIN PAGE
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="topnav no-print">
        <Link href="/" className="topnav-brand" style={{ color: 'var(--text)' }}>
          <div className="topnav-brand-icon">🍱</div>
          <span className="hide-mobile">FoodPass</span>
        </Link>

        <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🔖 QR Generator
        </div>

        <div className="topnav-actions">
          <Link href="/admin" className="btn btn-secondary btn-sm">🛠️ <span className="hide-mobile">Admin</span></Link>
          <Link href="/scan" className="btn btn-secondary btn-sm">📷 <span className="hide-mobile">Scan</span></Link>
          <button className="btn btn-secondary btn-sm"
            onClick={() => { sessionStorage.removeItem('admin_authed'); setAuthed(false); }}>
            <span className="hide-mobile">Logout</span>
            <span className="show-mobile">⏏️</span>
          </button>
        </div>
      </header>

      <div className="container" style={{ paddingTop: 'var(--page-pt)', paddingBottom: '3rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* ── Input Cards ──────────────────────────────────────── */}
        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>

          {/* CSV Upload */}
          <div className="glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.25rem' }}>📄 Upload CSV</div>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>
                Columns: <code>id, name</code> — (optional: <code>meal</code>). Wristbands encode <strong>id only</strong> and work for all meals.
              </p>
            </div>

            <div className="file-input-wrapper">
              <label htmlFor="csv-file-gen" className="form-label sr-only" style={{ display: 'none' }}>Upload CSV</label>
              <div className="file-input-display">
                <span>📎</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: csvFileName ? 'var(--text)' : 'var(--muted)' }}>
                  {csvFileName || 'Choose CSV file…'}
                </span>
              </div>
              <input
                id="csv-file-gen"
                ref={fileRef}
                type="file"
                accept=".csv"
                className="file-input-native"
                onChange={handleCSV}
              />
            </div>

            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={loadFromDB}
              disabled={dbLoading}
            >
              {dbLoading ? <><div className="spinner spinner-sm" /> Loading…</> : '🔄 Reload from Database'}
            </button>
          </div>

          {/* Manual Add */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '1rem' }}>✍️ Add Manually</div>
            <form onSubmit={handleManualAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div>
                <label htmlFor="gen-id" className="form-label sr-only" style={{ display: 'none' }}>Participant ID</label>
                <input
                  id="gen-id"
                  className="input"
                  placeholder="Participant ID (e.g. USER0001)"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="gen-name" className="form-label sr-only" style={{ display: 'none' }}>Full Name</label>
                <input
                  id="gen-name"
                  className="input"
                  placeholder="Full Name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  required
                />
              </div>
              <button id="add-manual-btn" type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                + Add & Save to Database
              </button>
            </form>
          </div>
        </div>

        {/* ── Status / Action bar ───────────────────────────────── */}
        {(entries.length > 0 || syncMsg) && (
          <div className="glass-solid no-print" style={{ padding: '1rem 1.25rem', display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap', borderRadius: 'var(--radius)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                {qrLoading
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="spinner spinner-sm" /> Generating QR codes…</span>
                  : generated
                    ? `✅ ${entries.length} QR code${entries.length > 1 ? 's' : ''} ready`
                    : `${entries.length} participants loaded`}
              </span>
              {syncMsg && (
                <span style={{ fontSize: '0.82rem', color: syncMsg.startsWith('✅') ? '#4ade80' : syncMsg.startsWith('⏳') ? '#fbbf24' : '#f87171' }}>
                  {syncMsg}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setGenerated(false); runGenerate(entries); }}
                disabled={qrLoading}
              >
                ⚡ Regenerate
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={qrLoading}>
                🖨️ Print All
              </button>
            </div>
          </div>
        )}

        {/* ── QR Grid ──────────────────────────────────────────── */}
        {entries.length > 0 && (
          <>
            {/* Search filter */}
            <div className="no-print" style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
              <input
                className="input"
                style={{ maxWidth: 280 }}
                placeholder="Filter by name or ID…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              {searchQ && (
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div id="print-area" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem' }}>
              {filtered.map((entry) => (
                <div key={entry.id} className="qr-card" style={{ gap: '0.75rem', padding: '0.85rem' }}>

                  {/* Top row: scanned status + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {entry.scanned
                      ? <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>✓ Served</span>
                      : <span className="badge badge-amber" style={{ fontSize: '0.68rem' }}>⏳ Pending</span>}
                    {confirmDeleteId === entry.id ? (
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: '#f87171' }}>Remove?</span>
                        <button className="btn btn-danger btn-sm" style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }} onClick={() => handleDelete(entry.id)}>Yes</button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', padding: '0.15rem', lineHeight: 1, transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color='#f87171')} onMouseLeave={e => (e.currentTarget.style.color='var(--muted)')}>🗑️</button>
                    )}
                  </div>

                  {/* QR Canvas */}
                  <div style={{ borderRadius: '0.85rem', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '3px solid rgba(255,255,255,0.06)' }}>
                    <canvas ref={(el) => { canvasRefs.current[entry.id] = el; }} style={{ display: 'block', width: '100%' }} />
                  </div>

                  {/* Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', textAlign: 'center', color: 'var(--text)', letterSpacing: '-0.01em' }}>{entry.name}</div>
                    <code style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.5rem', borderRadius: '0.4rem', border: '1px solid rgba(255,255,255,0.07)' }}>{entry.id}</code>
                    <div style={{ display: 'flex', gap: '0.22rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.2rem' }}>
                      {MEALS.map(m => {
                        const mc = MEAL_COLORS[m];
                        return (
                          <span key={m} style={{ fontSize: '0.6rem', padding: '0.12rem 0.42rem', borderRadius: '999px', background: `${mc}18`, color: mc, border: `1px solid ${mc}35`, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {m}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Download */}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', gap: '0.4rem', borderColor: 'rgba(255,255,255,0.07)' }}
                    onClick={() => downloadQR(entry)}
                    disabled={qrLoading || !generated}
                  >
                    ⬇ Download PNG
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {entries.length === 0 && !dbLoading && (
          <div className="empty-state glass">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No participants yet</div>
            <div className="empty-state-sub">
              Upload a CSV file or add participants manually above. They are saved to the database automatically.
            </div>
          </div>
        )}

        {entries.length === 0 && dbLoading && (
          <div className="loading-center glass" style={{ borderRadius: 'var(--radius)' }}>
            <div className="spinner" /> Loading participants from database…
          </div>
        )}
      </div>
    </div>
  );
}
