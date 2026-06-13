import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #3a3656',
  background: '#1e1c30',
  color: '#e0e0e0',
  fontSize: '1rem',
  boxSizing: 'border-box',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontWeight: 600,
  color: '#bdbdbd',
  fontSize: '0.9rem',
};

type InviteInfo = { email: string; name: string | null; studioName: string };

const AcceptInvite: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin-invites/accept/${token}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setLoadError(data.error || 'Invalid invite'); return; }
        setInvite(data);
        if (data.name) setName(data.name);
      })
      .catch(() => setLoadError('Failed to load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (password !== confirmPassword) { setFormError('Passwords do not match'); return; }
    if (password.length < 8) { setFormError('Password must be at least 8 characters'); return; }
    if (!name.trim()) { setFormError('Name is required'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin-invites/accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to accept invite'); return; }

      // Log the user in automatically
      try {
        await login({ email: invite!.email, password });
        navigate('/admin/dashboard');
      } catch {
        // Login may fail if session isn't ready — redirect to login
        navigate('/login');
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
        Validating invite...
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#ffb3b3', margin: '0 0 0.75rem 0', fontWeight: 700 }}>Invite Invalid</h2>
          <p style={{ color: '#a1a1aa', margin: '0 0 1.5rem 0' }}>{loadError}</p>
          <a href="/login" style={{ color: '#a78bfa', fontWeight: 600, fontSize: '0.95rem' }}>Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#181a1b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#23232a', border: '1px solid #3a3656', borderRadius: 18, boxShadow: '0 8px 40px rgba(0,0,0,0.4)', padding: '2.5rem 2rem' }}>
        <h1 style={{
          margin: '0 0 0.25rem 0',
          fontSize: '2rem',
          fontWeight: 800,
          background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textAlign: 'center',
        }}>
          You're Invited!
        </h1>
        <p style={{ color: '#a1a1aa', textAlign: 'center', margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
          Join <strong style={{ color: '#e0e0e0' }}>{invite?.studioName}</strong> as an admin
        </p>
        <p style={{ color: '#6b6b80', textAlign: 'center', margin: '0 0 1.75rem 0', fontSize: '0.85rem' }}>
          Signing in as <strong style={{ color: '#bdbdbd' }}>{invite?.email}</strong>
        </p>

        {formError && (
          <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.92rem' }}>
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Your Name <span style={{ color: '#ff6b6b' }}>*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              required
              disabled={submitting}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Password <span style={{ color: '#ff6b6b' }}>*</span></label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              disabled={submitting}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Confirm Password <span style={{ color: '#ff6b6b' }}>*</span></label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              disabled={submitting}
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 24px',
              fontSize: '1.05rem',
              fontWeight: 700,
              borderRadius: 12,
              background: submitting ? '#5a3cff99' : '#7c5cff',
              color: '#fff',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 12px rgba(124,92,255,0.3)',
              transition: 'background 0.2s',
            }}
          >
            {submitting ? 'Setting up account...' : 'Accept & Create Account'}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: 'center', color: '#6b6b80', fontSize: '0.85rem' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#a78bfa', fontWeight: 600, textDecoration: 'none' }}>Sign in</a>
        </p>
      </div>
    </div>
  );
};

export default AcceptInvite;
