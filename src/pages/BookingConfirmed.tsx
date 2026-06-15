import React, { useEffect, useState } from 'react';

export default function BookingConfirmed() {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) { setVerified(true); return; }
    fetch('/api/scheduling/public/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(r => r.json())
      .then(d => setVerified(d.paid !== false))
      .catch(() => setVerified(true));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, padding: '2.5rem 2rem', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
        {verified === null ? (
          <p style={{ color: '#6b6b80' }}>Confirming payment…</p>
        ) : (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✓</div>
            <h1 style={{ background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 800, fontSize: '1.6rem', margin: '0 0 0.5rem 0' }}>
              Payment Complete
            </h1>
            <p style={{ color: '#bdbdbd', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
              Your payment was successful and your session is confirmed. You'll receive a confirmation email shortly.
            </p>
            <a href="/" style={{ display: 'inline-block', padding: '10px 24px', background: '#7c5cff', color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
              Back to Home
            </a>
          </>
        )}
      </div>
    </div>
  );
}
