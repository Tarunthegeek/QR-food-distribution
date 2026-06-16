'use client';

/**
 * /admin – Admin Panel
 * - Stats overview + progress bar
 * - CSV bulk upload to Supabase
 * - Participant table (desktop) / cards (mobile): search, paginate, edit, delete, reset
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { removeFromLocalCache } from '@/lib/localStorage';
import { MEALS, normalizeScannedMeals } from '@/lib/meals';

interface Stats {
  total: number; scanned: number; pending: number;
  mealStats: Record<string, { total: number; scanned: number }>;
}
interface Participant {
  id: string;
  name: string;
  meal: string;
  scanned: boolean;
  scanned_at: string | null;
  scanned_meals?: unknown;
}

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';

function servingsForParticipant(p: Participant): string[] {
  const fromDb = normalizeScannedMeals(p.scanned_meals);
  if (fromDb.length > 0) return fromDb;
  if (p.scanned && p.meal) return [String(p.meal).trim().toUpperCase()].filter(Boolean);
  return [];
}

const MEAL_COLORS: Record<string, string> = {
  BREAKFAST: '#f59e0b', LUNCH: '#6c63ff', DINNER: '#8b5cf6', SNACKS: '#22d3ee',
};

function formatDate(str: string | null) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Page numbers centered on the current page (avoids a useless 1–7 strip on high page counts). */
function visiblePageRange(current: number, total: number, windowSize = 7): number[] {
  if (total <= windowSize) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(total, start + windowSize - 1);
  if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export default function AdminPage() {
  const [authed, setAuthed]     = useState(false);
  const [pwInput, setPwInput]   = useState('');
  const [pwError, setPwError]   = useState('');
  const [showPw, setShowPw]     = useState(false);

  const [stats, setStats]               = useState<Stats | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [loading, setLoading]           = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [uploadMsg, setUploadMsg]       = useState('');
  const [fileName, setFileName]         = useState('');

  const [editId, setEditId]         = useState<string | null>(null);
  const [editName, setEditName]     = useState('');
  const [editMeal, setEditMeal]     = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId]   = useState<string | null>(null);

  const fileRef     = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Auth ─────────────────────────────────────────────────── */
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
    /* eslint-disable react-hooks/set-state-in-effect -- restore session after mount (avoids SSR/client HTML mismatch) */
    if (sessionStorage.getItem('admin_authed') === '1') setAuthed(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /* ── Data fetching ───────────────────────────────────────── */
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) setStats(data);
    } catch { /* ignore */ }
  }, []);

  const fetchParticipants = useCallback(async (p = 1, s = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20', ...(s ? { search: s } : {}) });
      const res = await fetch(`/api/admin/participants?${params}`);
      const data = await res.json();
      if (data.success) { setParticipants(data.data); setTotal(data.total); }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    /* eslint-disable react-hooks/set-state-in-effect -- fetch helpers update UI after auth */
    void fetchStats();
    void fetchParticipants(1, '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [authed, fetchStats, fetchParticipants]);

  /* ── Search debounce ─────────────────────────────────────── */
  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val); setPage(1);
      fetchParticipants(1, val);
    }, 350);
  }

  function goPage(p: number) { setPage(p); fetchParticipants(p, search); }

  /* ── CSV Upload ──────────────────────────────────────────── */
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true); setUploadMsg('');
    const fd = new FormData(); fd.append('file', file);
    try {
      const res  = await fetch('/api/admin/upload-csv', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setUploadMsg(`✅ Inserted ${data.inserted} participants.`);
        fetchStats(); fetchParticipants(1, search);
      } else {
        setUploadMsg(`❌ ${data.message}`);
      }
    } catch { setUploadMsg('❌ Upload failed. Check connection.'); }
    setUploading(false);
    if (fileRef.current) { fileRef.current.value = ''; setFileName(''); }
  }

  /* ── Reset scan ──────────────────────────────────────────── */
  async function handleReset(id: string) {
    try {
      const res = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reset' }),
      });
      const data = await res.json();
      if (data.success) {
        removeFromLocalCache(id);
        fetchParticipants(page, search);
        fetchStats();
      } else alert(data.message);
    } catch { alert('Reset failed.'); }
    setConfirmResetId(null);
  }

  /* ── Edit participant ────────────────────────────────────── */
  function startEdit(p: Participant) {
    setEditId(p.id); setEditName(p.name); setEditMeal(p.meal.toUpperCase());
    setConfirmDeleteId(null); setConfirmResetId(null);
  }

  async function saveEdit() {
    if (!editId) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/admin/participants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name: editName, meal: editMeal }),
      });
      const data = await res.json();
      if (data.success) { setEditId(null); fetchParticipants(page, search); fetchStats(); }
      else alert(data.message);
    } catch { alert('Edit failed.'); }
    setEditSaving(false);
  }

  /* ── Delete participant ──────────────────────────────────── */
  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/participants?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { fetchParticipants(page, search); fetchStats(); }
      else alert(data.message);
    } catch { alert('Delete failed.'); }
    setConfirmDeleteId(null);
  }

  const totalPages  = Math.ceil(total / 20);
  const scannedPct  = stats ? Math.round((stats.scanned / (stats.total || 1)) * 100) : 0;

  /* ══════════════════════════════════════════════════════════
     LOGIN SCREEN
  ══════════════════════════════════════════════════════════ */
  if (!authed) {
    return (
      <div className="page" style={{ alignItems: 'center', justifyContent: 'center', padding: '2rem var(--page-px)' }}>
        <div className="glass" style={{ width: '100%', maxWidth: 380, padding: 'clamp(1.75rem, 5vw, 2.5rem) clamp(1.25rem, 4vw, 2rem)' }}>
          {/* Icon */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '1.25rem',
              background: 'linear-gradient(135deg, #6c63ff, #5a54d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', margin: '0 auto 1rem',
              boxShadow: '0 8px 32px rgba(108,99,255,0.35)',
            }}>🛠️</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Admin Panel</h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: '0.35rem' }}>Enter password to access dashboard</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <label htmlFor="admin-password" className="form-label">Admin Password</label>
              <input
                id="admin-password"
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

            {pwError && (
              <div className="alert alert-error" style={{ fontSize: '0.85rem' }}>
                ⚠️ {pwError}
              </div>
            )}

            <button id="admin-login-btn" type="submit" className="btn btn-primary btn-full">
              Unlock Dashboard
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Link href="/" style={{ color: 'var(--muted)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="page">

      {/* ── Top Nav ───────────────────────────────────────────── */}
      <header className="topnav">
        <Link href="/" className="topnav-brand" style={{ color: 'var(--text)' }}>
          <div className="topnav-brand-icon">🍱</div>
          <span className="hide-mobile">FoodPass</span>
        </Link>

        <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🛠️ Admin Panel
        </div>

        <div className="topnav-actions">
          <Link href="/scan" className="btn btn-secondary btn-sm" id="admin-scanner-link">
            📷 <span className="hide-mobile">Scanner</span>
          </Link>
          <button
            id="admin-logout-btn"
            className="btn btn-secondary btn-sm"
            onClick={() => { sessionStorage.removeItem('admin_authed'); setAuthed(false); }}
          >
            <span className="hide-mobile">Logout</span>
            <span className="show-mobile">⏏️</span>
          </button>
        </div>
      </header>

      <div className="container" style={{ paddingTop: 'var(--page-pt)', paddingBottom: '3rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* ── Stats Grid ────────────────────────────────────────── */}
        {stats && (
          <section>
            <div className="section-heading">📊 Live Overview</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div className="stat-card">
                <span className="stat-icon">👥</span>
                <div className="stat-value gradient-text">{stats.total}</div>
                <div className="stat-label">Registered</div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">✅</span>
                <div className="stat-value" style={{ color: '#4ade80' }}>{stats.scanned}</div>
                <div className="stat-label">Served</div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">⏳</span>
                <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.pending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">📈</span>
                <div className="stat-value" style={{ color: '#818cf8' }}>{scannedPct}%</div>
                <div className="stat-label">Complete</div>
              </div>
            </div>

            <div className="glass" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', fontSize: '0.88rem' }}>
                <span style={{ fontWeight: 600 }}>People with at least one meal</span>
                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{stats.scanned} / {stats.total}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${scannedPct}%` }} />
              </div>

              {Object.keys(stats.mealStats).length > 0 && (
                <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Servings per line (each person can appear in multiple lines)
                </div>
              )}
              {Object.keys(stats.mealStats).length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {Object.entries(stats.mealStats).map(([meal, ms]) => {
                    const pct = Math.round((ms.scanned / (ms.total || 1)) * 100);
                    const c = MEAL_COLORS[meal] ?? '#818cf8';
                    return (
                      <div key={meal} style={{
                        background: `${c}11`, border: `1px solid ${c}33`,
                        borderRadius: '0.75rem', padding: '0.5rem 0.85rem', fontSize: '0.83rem',
                        display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 90,
                      }}>
                        <span style={{ fontWeight: 700, color: c }}>{meal}</span>
                        <span style={{ color: 'var(--muted)' }}>{ms.scanned}/{ms.total} · {pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── CSV Upload ────────────────────────────────────────── */}
        <section>
          <div className="section-heading">📤 Upload Participants</div>
          <div className="glass" style={{ padding: '1.5rem' }}>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="file-input-wrapper">
                <label htmlFor="csv-file-input" className="form-label sr-only" style={{ display: 'none' }}>Choose CSV File</label>
                <div className="file-input-display">
                  <span>📎</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: fileName ? 'var(--text)' : 'var(--muted)' }}>
                    {fileName || 'Choose a CSV file…'}
                  </span>
                </div>
                <input
                  id="csv-file-input"
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="file-input-native"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button id="csv-upload-btn" type="submit" className="btn btn-primary" disabled={uploading || !fileName}>
                  {uploading ? <><div className="spinner spinner-sm" /> Uploading…</> : '📤 Upload CSV'}
                </button>
                {fileName && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (fileRef.current) fileRef.current.value = ''; setFileName(''); }}>
                    ✕ Clear
                  </button>
                )}
              </div>
            </form>

            {uploadMsg && (
              <div className={`alert ${uploadMsg.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '0.75rem' }}>
                {uploadMsg}
              </div>
            )}

            <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Required columns: <code>id, name, meal</code> — meal is a registration tag; volunteers pick the serving line on the scanner.
            </p>
          </div>
        </section>

        {/* ── Participants ──────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="section-heading" style={{ margin: 0, flex: 1 }}>
              👥 Participants{total > 0 && <span style={{ color: 'var(--text-sub)', fontWeight: 600 }}> ({total})</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                id="participant-search"
                className="input"
                style={{ width: 'min(220px, 100%)' }}
                placeholder="Search ID or name…"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { fetchStats(); fetchParticipants(page, search); }} title="Refresh list" aria-label="Refresh participant list">
                🔄
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-center">
              <div className="spinner" /> Loading participants…
            </div>
          ) : participants.length === 0 ? (
            <div className="empty-state glass">
              <div className="empty-state-icon">{search ? '🔍' : '📭'}</div>
              <div className="empty-state-title">{search ? 'No results found' : 'No participants yet'}</div>
              <div className="empty-state-sub">{search ? `No match for "${search}"` : 'Upload a CSV file above to get started.'}</div>
            </div>
          ) : (
            <>
              {/* ── Desktop Table ─────────────────────── */}
              <div className="data-table-wrapper glass" style={{ overflow: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Reg.</th>
                      <th>Served</th>
                      <th>Last scan</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => {
                      const sv = servingsForParticipant(p);
                      return (
                      <tr key={p.id} style={{ opacity: editId && editId !== p.id ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                        <td>
                          <code style={{ fontSize: '0.82rem' }}>{p.id}</code>
                        </td>

                        {editId === p.id ? (
                          <>
                            <td>
                              <input className="input" style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                                value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </td>
                            <td>
                              <select className="input" style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                                value={editMeal} onChange={(e) => setEditMeal(e.target.value)}>
                                {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ fontWeight: 600 }}>{p.name}</td>
                            <td>
                              <span className="badge" style={{
                                background: `${MEAL_COLORS[p.meal] ?? '#6c63ff'}20`,
                                color: MEAL_COLORS[p.meal] ?? '#818cf8',
                                border: `1px solid ${MEAL_COLORS[p.meal] ?? '#6c63ff'}40`,
                              }}>{p.meal}</span>
                            </td>
                          </>
                        )}

                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {sv.length > 0 ? (
                              sv.map((m) => (
                                <span key={m} className="badge" style={{
                                  background: `${MEAL_COLORS[m] ?? '#6c63ff'}20`,
                                  color: MEAL_COLORS[m] ?? '#818cf8',
                                  border: `1px solid ${MEAL_COLORS[m] ?? '#6c63ff'}40`,
                                }}>{m}</span>
                              ))
                            ) : (
                              <span className="badge badge-amber">⏳ None yet</span>
                            )}
                          </div>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {formatDate(p.scanned_at)}
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'nowrap' }}>
                            {editId === p.id ? (
                              <>
                                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving}>
                                  {editSaving ? '…' : '💾'}
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>✕</button>
                              </>
                            ) : (
                              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)} style={{ color: '#818cf8' }}>✏️</button>
                            )}

                            {sv.length > 0 && (
                              confirmResetId === p.id ? (
                                <div className="inline-confirm inline-confirm-warning">
                                  <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>Reset?</span>
                                  <button className="btn btn-amber btn-sm" onClick={() => handleReset(p.id)}>Yes</button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmResetId(null)}>No</button>
                                </div>
                              ) : (
                                <button className="btn btn-ghost btn-sm" style={{ color: '#fbbf24' }} onClick={() => setConfirmResetId(p.id)}>↩</button>
                              )
                            )}

                            {confirmDeleteId === p.id ? (
                              <div className="inline-confirm inline-confirm-danger">
                                <span style={{ fontSize: '0.72rem', color: '#f87171' }}>Sure?</span>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Yes</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                              </div>
                            ) : (
                              <button className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={() => setConfirmDeleteId(p.id)}>🗑️</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile Card List ───────────────────── */}
              <div className="participant-cards-mobile" style={{ flexDirection: 'column', gap: '0.65rem' }}>
                {participants.map((p) => {
                  const sv = servingsForParticipant(p);
                  return (
                  <div key={p.id} className="participant-card">
                    {/* Header */}
                    <div className="pc-row">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                        {editId === p.id ? (
                          <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ padding: '0.4rem 0.7rem', fontSize: '0.9rem' }} />
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        )}
                        <code style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{p.id}</code>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                        {editId === p.id ? (
                          <select className="input" value={editMeal} onChange={(e) => setEditMeal(e.target.value)} style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem', width: 'auto' }}>
                            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <span className="badge" style={{
                            background: `${MEAL_COLORS[p.meal] ?? '#6c63ff'}20`,
                            color: MEAL_COLORS[p.meal] ?? '#818cf8',
                            border: `1px solid ${MEAL_COLORS[p.meal] ?? '#6c63ff'}40`,
                          }}>{p.meal}</span>
                        )}
                        {sv.length > 0
                          ? <span className="badge badge-green">✓ {sv.length}</span>
                          : <span className="badge badge-amber">⏳</span>}
                      </div>
                    </div>

                    {/* Scanned at */}
                    {sv.length > 0 && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                        Lines: {sv.join(', ')}
                        {p.scanned_at && <> · Last: {formatDate(p.scanned_at)}</>}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pc-actions">
                      {editId === p.id ? (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving}>
                            {editSaving ? '…' : '💾 Save'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)} style={{ color: '#818cf8' }}>✏️ Edit</button>
                      )}

                      {sv.length > 0 && (
                        confirmResetId === p.id ? (
                          <div className="inline-confirm inline-confirm-warning">
                            <span style={{ fontSize: '0.78rem', color: '#fbbf24' }}>Reset?</span>
                            <button className="btn btn-amber btn-sm" onClick={() => handleReset(p.id)}>Yes</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmResetId(null)}>No</button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" style={{ color: '#fbbf24' }} onClick={() => setConfirmResetId(p.id)}>↩ Reset</button>
                        )
                      )}

                      {confirmDeleteId === p.id ? (
                        <div className="inline-confirm inline-confirm-danger">
                          <span style={{ fontSize: '0.78rem', color: '#f87171' }}>Delete?</span>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Yes</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" style={{ color: '#f87171' }} onClick={() => setConfirmDeleteId(p.id)}>🗑️ Delete</button>
                      )}
                    </div>
                  </div>
                );})}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <nav style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginTop: '1.25rem', flexWrap: 'wrap' }} aria-label="Participant pages">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => goPage(page - 1)}>← Prev</button>
              {visiblePageRange(page, totalPages).map((p) => (
                <button key={p} type="button" className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`} onClick={() => goPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => goPage(page + 1)}>Next →</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
