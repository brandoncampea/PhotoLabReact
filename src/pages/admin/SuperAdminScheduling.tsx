import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';

const card: React.CSSProperties = { background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, padding: '1.75rem 2rem', marginBottom: '1.5rem', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' };
const sectionTitle: React.CSSProperties = { margin: '0 0 0.2rem 0', fontSize: '1.4rem', fontWeight: 800, background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontWeight: 600, color: '#bdbdbd', fontSize: '0.88rem' };
const inputStyle: React.CSSProperties = { background: '#18181f', border: '1px solid #3a3656', borderRadius: 8, color: '#e0e0e0', padding: '9px 12px', fontSize: '0.92rem' };

export default function SuperAdminScheduling() {
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const [feeType, setFeeType] = useState<'percentage' | 'fixed'>('percentage');
  const [feeValue, setFeeValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/scheduling/admin/fee-config', { headers })
      .then(r => r.json())
      .then(d => { setFeeType(d.feeType || 'percentage'); setFeeValue(String(d.feeValue ?? 0)); });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    const res = await fetch('/api/scheduling/admin/fee-config', {
      method: 'PUT', headers,
      body: JSON.stringify({ feeType, feeValue: Number(feeValue) }),
    });
    setSaving(false);
    setMsg(res.ok ? 'Saved.' : 'Failed to save.');
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <AdminLayout>
      <div style={{ minHeight: '100vh', background: '#181a1b', padding: '2.5rem 1.5rem 4rem' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={sectionTitle}>Scheduling Fees</h1>
            <p style={{ color: '#a1a1aa', fontSize: '0.9rem', margin: '0.2rem 0 0 0' }}>
              Platform fee charged on booking payments. Deducted from studio payout before Stripe fees.
            </p>
          </div>

          <div style={card}>
            <form onSubmit={save}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Fee Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['percentage', 'fixed'] as const).map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: feeType === t ? '#a78bfa' : '#6b6b80', fontWeight: feeType === t ? 700 : 400 }}>
                      <input type="radio" value={t} checked={feeType === t} onChange={() => setFeeType(t)} style={{ accentColor: '#7c5cff' }} />
                      {t === 'percentage' ? 'Percentage (%)' : 'Fixed amount ($)'}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>{feeType === 'percentage' ? 'Percentage (e.g. 5 = 5%)' : 'Fixed amount (e.g. 2.50)'}</label>
                <input
                  style={{ ...inputStyle, width: 160 }}
                  type="number" min="0" step={feeType === 'percentage' ? '0.01' : '0.01'}
                  value={feeValue}
                  onChange={e => setFeeValue(e.target.value)}
                />
              </div>

              <div style={{ background: '#1a1a24', border: '1px solid #3a3656', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ color: '#6b6b80', fontSize: '0.82rem', marginBottom: 4 }}>Example: booking payment = $100</div>
                {feeType === 'percentage'
                  ? <div style={{ color: '#bdbdbd', fontSize: '0.88rem' }}>Platform fee: <strong style={{ color: '#a78bfa' }}>${(100 * Number(feeValue || 0) / 100).toFixed(2)}</strong> · Stripe fee (est): <strong style={{ color: '#a78bfa' }}>$3.20</strong> · Studio payout: <strong style={{ color: '#22c55e' }}>${(100 - 100 * Number(feeValue || 0) / 100 - 3.20).toFixed(2)}</strong></div>
                  : <div style={{ color: '#bdbdbd', fontSize: '0.88rem' }}>Platform fee: <strong style={{ color: '#a78bfa' }}>${Number(feeValue || 0).toFixed(2)}</strong> · Stripe fee (est): <strong style={{ color: '#a78bfa' }}>$3.20</strong> · Studio payout: <strong style={{ color: '#22c55e' }}>${(100 - Number(feeValue || 0) - 3.20).toFixed(2)}</strong></div>
                }
              </div>

              <button type="submit" disabled={saving} style={{ padding: '9px 24px', background: saving ? '#333' : '#7c5cff', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {msg && <span style={{ marginLeft: 12, color: msg === 'Saved.' ? '#22c55e' : '#ff6b6b', fontSize: '0.88rem' }}>{msg}</span>}
            </form>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
