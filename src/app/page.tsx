import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      className="home"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem var(--page-px) 3rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative blobs */}
      <div aria-hidden style={{
        position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: 'min(600px, 120vw)', height: 'min(600px, 120vw)',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: '5%', right: '-5%',
        width: 260, height: 260, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,101,132,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', maxWidth: 480, width: '100%', position: 'relative' }}>

        {/* App icon */}
        <div style={{
          width: 88, height: 88, borderRadius: '1.75rem',
          background: 'linear-gradient(135deg, #7c73ff 0%, #ff6584 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.4rem', margin: '0 auto 1.75rem',
          boxShadow: '0 16px 48px rgba(108,99,255,0.45), 0 0 0 1px rgba(255,255,255,0.1) inset',
          animation: 'floatIcon 4s ease-in-out infinite',
        }} aria-hidden>🍱</div>

        {/* Title */}
        <h1 style={{
          fontSize: 'clamp(2.4rem, 6vw, 3.5rem)',
          fontWeight: 900, margin: '0 0 0.6rem',
          letterSpacing: '-0.04em', lineHeight: 1.1,
        }}>
          <span className="gradient-text">FoodPass</span>
        </h1>

        <p style={{
          color: 'var(--text-sub)', fontSize: 'clamp(1rem, 2.5vw, 1.1rem)',
          marginBottom: '2.5rem', lineHeight: 1.7, maxWidth: 380,
          marginLeft: 'auto', marginRight: 'auto',
        }}>
          QR-powered food distribution for college events.
          Fast, offline-ready, and duplicate-proof.
        </p>

        {/* Feature pills */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
          justifyContent: 'center', marginBottom: '2.5rem',
        }}>
          {[
            { icon: '⚡', label: 'Instant scan' },
            { icon: '📴', label: 'Works offline' },
            { icon: '🔒', label: 'No duplicates' },
            { icon: '🍽️', label: 'Multi-meal' },
          ].map(f => (
            <span key={f.label} style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.9rem', borderRadius: '999px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-sub)',
            }}>
              <span>{f.icon}</span>{f.label}
            </span>
          ))}
        </div>

        {/* Action buttons */}
        <nav
          className="home-actions"
          aria-label="Primary actions"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}
        >
          <Link href="/scan" className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
            <span aria-hidden>📷</span> Open Scanner
          </Link>

          <div style={{ display: 'flex', gap: '0.65rem', width: '100%', maxWidth: 380 }}>
            <Link href="/admin" className="btn btn-secondary" style={{ justifyContent: 'center', flex: 1, fontSize: '0.95rem', minHeight: '2.8rem' }}>
              <span aria-hidden>🛠️</span> Admin
            </Link>
            <Link href="/generate" className="btn btn-secondary" style={{ justifyContent: 'center', flex: 1, fontSize: '0.95rem', minHeight: '2.8rem' }}>
              <span aria-hidden>🔖</span> Generate QR
            </Link>
          </div>
        </nav>

        {/* Footer note */}
        <p style={{ marginTop: '2.75rem', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Scan a wristband QR code at each serving station.<br />
          Each meal is independently tracked per participant.
        </p>
      </div>

      <style>{`
        @keyframes floatIcon {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </main>
  );
}
