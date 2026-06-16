'use client';

/**
 * /scan – QR Scanner Page
 * Volunteer selects the meal line BEFORE scanning.
 * On scan, result is shown as a full-screen overlay with sound + vibration.
 * Works offline: local-first via localStorage, syncs when online.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  isScannedLocally,
  markScannedLocally,
  addToSyncQueue,
  removeFromLocalCache,
} from '@/lib/localStorage';
import { initSyncManager } from '@/lib/syncQueue';
import { MEALS, isValidMeal } from '@/lib/meals';

const SERVING_SESSION_KEY = 'foodpass_serving_meal';

/* ── Types ─────────────────────────────────────────────────── */
type ScanState = 'idle' | 'scanning' | 'success' | 'already_taken' | 'error' | 'invalid';

interface ScanResult {
  state: ScanState;
  name?: string;
  id?: string;
  meal?: string;
  message?: string;
  errorKind?: 'camera' | 'api';
}

/* ── Audio helpers ─────────────────────────────────────────── */
function playBeep(type: 'success' | 'error') {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'success' ? 880 : 300;
    osc.type = type === 'success' ? 'sine' : 'sawtooth';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore audio errors */ }
}

function vibrate(pattern: number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function parseParticipantId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const id = t.includes('|') ? t.split('|')[0].trim() : t;
  if (!id) return null;
  return id.toUpperCase();
}

/* ── Meal colour + icon map ────────────────────────────────── */
const MEAL_COLORS: Record<string, string> = {
  BREAKFAST: '#f59e0b',
  LUNCH:     '#6c63ff',
  DINNER:    '#8b5cf6',
  SNACKS:    '#22d3ee',
};
const MEAL_ICONS: Record<string, string> = {
  BREAKFAST: '☀️',
  LUNCH:     '🍛',
  DINNER:    '🌙',
  SNACKS:    '🍿',
};

/* ── Component ─────────────────────────────────────────────── */
export default function ScanPage() {
  const scannerDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const [result, setResult] = useState<ScanResult>({ state: 'idle' });
  const [isOnline, setIsOnline] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const cooldownRef = useRef(false);
  const [servingMeal, setServingMeal] = useState<string>(MEALS[0]);
  const servingMealRef = useRef<string>(MEALS[0]);

  /* ── Restore serving meal from session ─── */
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SERVING_SESSION_KEY);
      if (stored && isValidMeal(stored)) {
        const u = stored.trim().toUpperCase();
        servingMealRef.current = u;
        setServingMeal(u);
      }
    } catch { /* ignore */ }
  }, []);

  /* ── Sync manager & online tracking ─── */
  useEffect(() => {
    const cleanup = initSyncManager();
    const up = () => setIsOnline(true);
    const dn = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', dn);
    return () => { cleanup(); window.removeEventListener('online', up); window.removeEventListener('offline', dn); };
  }, []);

  /* ── Handle successful QR decode ──────────────────────────── */
  const handleScanSuccess = useCallback(async (rawValue: string) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    try { scannerRef.current?.pause(); } catch { /* ignore */ }

    const id = parseParticipantId(rawValue);
    const meal = servingMealRef.current.trim().toUpperCase();

    if (!id) {
      vibrate([200, 100, 200]);
      playBeep('error');
      setResult({ state: 'invalid', message: 'Unrecognised QR — need a valid wristband code.' });
      setTimeout(() => {
        setResult({ state: 'scanning' });
        try { scannerRef.current?.resume(); } catch { /* ignore */ }
        cooldownRef.current = false;
      }, 2500);
      return;
    }

    if (!isValidMeal(meal)) {
      vibrate([200, 100, 200]);
      playBeep('error');
      setResult({ state: 'invalid', message: 'Select a meal line from the dropdown above first.' });
      setTimeout(() => {
        setResult({ state: 'scanning' });
        try { scannerRef.current?.resume(); } catch { /* ignore */ }
        cooldownRef.current = false;
      }, 2500);
      return;
    }

    if (isScannedLocally(id, meal)) {
      vibrate([300, 100, 300]);
      playBeep('error');
      setResult({ state: 'already_taken', id, meal, message: `Already got ${meal} on this device.` });
      setTimeout(() => {
        setResult({ state: 'scanning' });
        try { scannerRef.current?.resume(); } catch { /* ignore */ }
        cooldownRef.current = false;
      }, 3000);
      return;
    }

    markScannedLocally(id, meal);
    setScanCount((c) => c + 1);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, meal }),
        signal: AbortSignal.timeout(5000),
      });

      let data: { success?: boolean; message?: string; participant?: { name?: string } } = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (res.ok && data.success) {
        vibrate([100, 50, 100]);
        playBeep('success');
        setResult({ state: 'success', id, meal, name: data.participant?.name, message: data.message });
      } else if (res.status === 409) {
        vibrate([300, 100, 300]);
        playBeep('error');
        setResult({ state: 'already_taken', id, meal, name: data.participant?.name, message: data.message });
      } else if (!res.ok && res.status >= 500) {
        vibrate([100, 50, 100]);
        playBeep('success');
        const msg = typeof data.message === 'string' && data.message.trim() ? data.message : 'Server error – saved offline, will retry.';
        setResult({ state: 'success', id, meal, message: msg });
        addToSyncQueue({ id, meal, scanned_at: new Date().toISOString() });
      } else if (!res.ok) {
        removeFromLocalCache(id);
        setScanCount((c) => Math.max(0, c - 1));
        vibrate([300, 100, 300]);
        playBeep('error');
        const msg = typeof data.message === 'string' && data.message.trim() ? data.message : res.status === 404 ? 'Participant not found.' : 'Could not record scan. Try again.';
        setResult({ state: 'error', errorKind: 'api', message: msg });
      } else {
        removeFromLocalCache(id);
        setScanCount((c) => Math.max(0, c - 1));
        vibrate([300, 100, 300]);
        playBeep('error');
        setResult({ state: 'error', errorKind: 'api', message: typeof data.message === 'string' && data.message.trim() ? data.message : 'Unexpected server response.' });
      }
    } catch {
      vibrate([100, 50, 100]);
      playBeep('success');
      setResult({ state: 'success', id, meal, message: 'Saved offline – will sync when online.' });
      addToSyncQueue({ id, meal, scanned_at: new Date().toISOString() });
    }

    setTimeout(() => {
      setResult({ state: 'scanning' });
      try { scannerRef.current?.resume(); } catch { /* ignore */ }
      cooldownRef.current = false;
    }, 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Initialize html5-qrcode ──────────────────────────────── */
  useEffect(() => {
    let mounted = true;
    const initScanner = async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!mounted || !scannerDivRef.current) return;
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
          handleScanSuccess,
          () => { /* ignore frame errors */ }
        );
        if (mounted) setResult({ state: 'scanning' });
      } catch (err) {
        console.error('Camera error:', err);
        if (mounted) setResult({ state: 'error', errorKind: 'camera', message: 'Camera permission denied or unavailable.' });
      }
    };
    initScanner();
    return () => {
      mounted = false;
      scannerRef.current?.stop().catch(() => {});
    };
  }, [handleScanSuccess]);

  /* ── Overlay rendering ────────────────────────────────────── */
  const renderOverlay = () => {
    if (result.state === 'success') {
      const mc = MEAL_COLORS[result.meal || ''] ?? '#6c63ff';
      return (
        <div className="scan-overlay success" role="status" aria-live="polite" aria-atomic="true">
          <div className="scan-result-icon">✅</div>
          <div className="scan-result-title">Food Given!</div>
          {result.name && (
            <div style={{ fontSize: 'clamp(1.1rem,4vw,1.5rem)', fontWeight: 800, color: '#fff', textAlign: 'center' }}>
              {result.name}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            {result.id && (
              <code style={{ background: 'rgba(255,255,255,0.12)', padding: '0.3rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.9rem', color: '#fff' }}>
                {result.id}
              </code>
            )}
            {result.meal && (
              <span style={{ padding: '0.3rem 1rem', borderRadius: '999px', background: `${mc}22`, border: `1px solid ${mc}55`, color: mc, fontSize: '0.85rem', fontWeight: 700 }}>
                {MEAL_ICONS[result.meal] ?? '🍽️'} {result.meal}
              </span>
            )}
          </div>
          {result.message && (
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.5rem', padding: '0 2rem', textAlign: 'center', maxWidth: 320 }}>
              {result.message}
            </div>
          )}
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>Resuming scanner…</div>
        </div>
      );
    }

    if (result.state === 'already_taken') {
      return (
        <div className="scan-overlay error" role="alert" aria-live="assertive" aria-atomic="true">
          <div className="scan-result-icon">🚫</div>
          <div className="scan-result-title">Already Taken!</div>
          {result.name && (
            <div style={{ fontSize: 'clamp(1.1rem,4vw,1.4rem)', fontWeight: 800, color: '#fff', textAlign: 'center' }}>{result.name}</div>
          )}
          <div className="scan-result-sub">{result.id} · {result.meal}</div>
          {result.message && (
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center', padding: '0 2rem', maxWidth: 300 }}>
              {result.message}
            </div>
          )}
        </div>
      );
    }

    if (result.state === 'invalid') {
      return (
        <div className="scan-overlay warning" role="alert" aria-live="assertive" aria-atomic="true">
          <div className="scan-result-icon">⚠️</div>
          <div className="scan-result-title">Invalid QR</div>
          <div className="scan-result-sub">{result.message}</div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>Make sure you scan a FoodPass wristband</div>
        </div>
      );
    }

    if (result.state === 'error') {
      const camera = result.errorKind !== 'api';
      return (
        <div className="scan-overlay error" role="alert" aria-live="assertive" aria-atomic="true">
          <div className="scan-result-icon">{camera ? '📷' : '⛔'}</div>
          <div className="scan-result-title">{camera ? 'Camera Error' : 'Scan Not Recorded'}</div>
          <div className="scan-result-sub">{result.message}</div>
          {camera ? (
            <Link href="/" className="btn btn-ghost" style={{ marginTop: '1.5rem', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
              ← Go Back
            </Link>
          ) : (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>Resuming scanner…</div>
          )}
        </div>
      );
    }
    return null;
  };

  const activeMealColor = MEAL_COLORS[servingMeal] ?? '#6c63ff';
  const activeMealIcon  = MEAL_ICONS[servingMeal]  ?? '🍽️';

  /* ── Main render ───────────────────────────────────────────── */
  return (
    <div className="page">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="topnav">
        <Link href="/" className="topnav-brand" style={{ color: 'var(--text)' }}>
          <div className="topnav-brand-icon">🍱</div>
          <span className="hide-mobile">FoodPass</span>
        </Link>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            📷 <span className="hide-mobile">QR Scanner</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: isOnline ? '#4ade80' : '#f87171' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{scanCount} scanned</span>
          </div>
        </div>

        <div className="topnav-actions">
          <Link href="/admin" className="btn btn-secondary btn-sm" id="scan-admin-link">
            🛠️ <span className="hide-mobile">Admin</span>
          </Link>
        </div>
      </header>

      {/* ── Scanner area ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem var(--page-px)', gap: '1.25rem' }}>

        {/* ── Meal Selector ──────────────────────────────────────── */}
        <div className="glass" style={{ width: '100%', maxWidth: 360, padding: '1.1rem 1.25rem' }}>
          <label htmlFor="serving-meal" style={{ display: 'block', fontWeight: 800, fontSize: '0.75rem', color: 'var(--text-sub)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            🍽️ Serving Line
          </label>

          {/* Visual meal tab switcher */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginBottom: '0.7rem' }}>
            {MEALS.map((m) => {
              const mc = MEAL_COLORS[m];
              const mi = MEAL_ICONS[m];
              const active = servingMeal === m;
              return (
                <button
                  key={m}
                  onClick={() => {
                    servingMealRef.current = m;
                    setServingMeal(m);
                    try { sessionStorage.setItem(SERVING_SESSION_KEY, m); } catch { /* ignore */ }
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                    padding: '0.65rem 0.25rem', borderRadius: '0.75rem', cursor: 'pointer', border: 'none',
                    background: active ? `${mc}22` : 'rgba(255,255,255,0.04)',
                    outline: active ? `2px solid ${mc}70` : '2px solid transparent',
                    transition: 'all 0.18s ease',
                    transform: active ? 'scale(1.04)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{mi}</span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, color: active ? mc : 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {m}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active meal indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: `${activeMealColor}12`, border: `1px solid ${activeMealColor}30` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeMealColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: activeMealColor }}>
              Serving: {activeMealIcon} {servingMeal}
            </span>
          </div>
        </div>

        {/* ── Camera viewfinder ──────────────────────────────────── */}
        <div style={{
          position: 'relative', width: '100%', maxWidth: 360, minHeight: 280,
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,99,255,0.15)',
          background: '#000',
        }}>
          <div id="qr-reader" ref={scannerDivRef} style={{ width: '100%', minHeight: 280 }} />

          {/* Corner bracket overlay */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 200, height: 200,
              border: `2.5px solid ${activeMealColor}cc`,
              borderRadius: '1rem',
              boxShadow: `0 0 0 9999px rgba(0,0,0,0.5), 0 0 20px ${activeMealColor}40`,
              animation: 'scanPulse 2.5s ease-in-out infinite',
              position: 'relative',
            }}>
              <span style={{ position: 'absolute', width: 18, height: 18, top: -3, left: -3, borderTop: `3px solid ${activeMealColor}`, borderLeft: `3px solid ${activeMealColor}`, borderRadius: '3px 0 0 0' }} />
              <span style={{ position: 'absolute', width: 18, height: 18, top: -3, right: -3, borderTop: `3px solid ${activeMealColor}`, borderRight: `3px solid ${activeMealColor}`, borderRadius: '0 3px 0 0' }} />
              <span style={{ position: 'absolute', width: 18, height: 18, bottom: -3, left: -3, borderBottom: `3px solid ${activeMealColor}`, borderLeft: `3px solid ${activeMealColor}`, borderRadius: '0 0 0 3px' }} />
              <span style={{ position: 'absolute', width: 18, height: 18, bottom: -3, right: -3, borderBottom: `3px solid ${activeMealColor}`, borderRight: `3px solid ${activeMealColor}`, borderRadius: '0 0 3px 0' }} />
            </div>
          </div>
        </div>

        {/* ── Status pill ────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {result.state === 'idle' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
              <div className="spinner spinner-sm" /> Starting camera…
            </div>
          )}
          {result.state === 'scanning' && (
            <div style={{
              padding: '0.55rem 1.35rem', borderRadius: '999px',
              background: `${activeMealColor}15`, border: `1px solid ${activeMealColor}40`,
              color: activeMealColor, fontSize: '0.85rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeMealColor, display: 'inline-block', animation: 'blink 1.2s ease-in-out infinite' }} />
              {activeMealIcon} Ready — scan for {servingMeal}
            </div>
          )}
        </div>

        {/* ── How it works ───────────────────────────────────────── */}
        <div className="glass" style={{ width: '100%', maxWidth: 360, padding: '1rem 1.25rem' }}>
          <div style={{ fontWeight: 800, fontSize: '0.75rem', color: 'var(--text-sub)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            How it works
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {[
              { icon: '1️⃣', label: 'Pick the meal line above (Breakfast, Lunch…)' },
              { icon: '2️⃣', label: 'Scan the participant\'s wristband QR code' },
              { icon: '✅', label: 'Green = recorded · 🚫 Red = already served' },
              { icon: '📴', label: 'Works offline — auto syncs when back online' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                <span style={{ fontSize: '0.95rem', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Full-screen result overlay ──────────────────────────── */}
      {renderOverlay()}

      <style>{`
        @keyframes scanPulse {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 20px ${activeMealColor}30; }
          50%       { box-shadow: 0 0 0 9999px rgba(0,0,0,0.5), 0 0 32px ${activeMealColor}60; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
