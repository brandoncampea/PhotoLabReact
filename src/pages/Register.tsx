import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ACCENT = '#a78bfa';
const ACCENT_DIM = 'rgba(167,139,250,0.14)';
const BORDER = '#1d1d2c';
const INPUT_BG = '#0c0c14';
const CARD_BG = '#111118';
const TEXT = '#dce0ec';
const MUTED = '#55556e';
const ERROR_BG = 'rgba(239,68,68,0.09)';
const ERROR_BORDER = 'rgba(239,68,68,0.3)';
const ERROR_TEXT = '#f87171';

const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });
      navigate('/albums');
    } catch (err: any) {
      let msg = 'Registration failed.';
      if (err.response?.data?.message) msg = err.response.data.message;
      else if (err.response?.data?.title) msg = err.response.data.title;
      else if (err.response?.data?.error) msg = err.response.data.error;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const field = (name: string): React.CSSProperties => ({
    width: '100%',
    padding: '10px 13px',
    background: INPUT_BG,
    border: `1.5px solid ${focused === name ? ACCENT : BORDER}`,
    borderRadius: 8,
    color: TEXT,
    fontSize: '0.94rem',
    outline: 'none',
    boxSizing: 'border-box',
    fontStyle: formData[name as keyof typeof formData] ? 'normal' : 'italic',
    boxShadow: focused === name ? `0 0 0 3px ${ACCENT_DIM}` : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  });

  const label: React.CSSProperties = {
    display: 'block',
    marginBottom: 5,
    fontSize: '0.72rem',
    fontWeight: 600,
    color: MUTED,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  };

  const focus = (name: string) => () => setFocused(name);
  const blur = () => setFocused(null);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2.5rem 1rem',
      background: '#09090f',
      backgroundImage: `
        radial-gradient(ellipse 800px 420px at 30% 0%, rgba(124,92,255,0.15) 0%, transparent 65%),
        radial-gradient(ellipse 600px 300px at 80% 90%, rgba(99,102,241,0.10) 0%, transparent 65%)
      `,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 430,
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        boxShadow: '0 0 0 1px rgba(167,139,250,0.04), 0 24px 64px rgba(0,0,0,0.6)',
        padding: '2.25rem 2rem 1.75rem',
      }}>

        {/* Wordmark */}
        <div style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ACCENT,
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6.25" stroke={ACCENT} strokeWidth="1.5" />
            <circle cx="7" cy="7" r="2.75" fill={ACCENT} opacity="0.7" />
            <line x1="7" y1="0.5" x2="7" y2="2.5" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="11.5" x2="7" y2="13.5" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="0.5" y1="7" x2="2.5" y2="7" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11.5" y1="7" x2="13.5" y2="7" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Photo Lab
        </div>

        <h1 style={{
          margin: '0 0 0.3rem',
          fontSize: '1.7rem',
          fontWeight: 700,
          color: TEXT,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}>
          Create your account
        </h1>
        <p style={{ margin: '0 0 1.75rem', color: MUTED, fontSize: '0.93rem', lineHeight: 1.5 }}>
          Start sharing galleries and delivering photos to clients.
        </p>

        {error && (
          <div style={{
            background: ERROR_BG,
            border: `1.5px solid ${ERROR_BORDER}`,
            borderRadius: 8,
            padding: '9px 13px',
            marginBottom: '1.25rem',
            color: ERROR_TEXT,
            fontSize: '0.88rem',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <div>
              <label htmlFor="firstName" style={label}>First name</label>
              <input
                type="text" id="firstName" name="firstName"
                value={formData.firstName} onChange={handleChange}
                onFocus={focus('firstName')} onBlur={blur}
                required disabled={loading} placeholder="Jane"
                autoComplete="given-name"
                style={field('firstName')}
              />
            </div>
            <div>
              <label htmlFor="lastName" style={label}>Last name</label>
              <input
                type="text" id="lastName" name="lastName"
                value={formData.lastName} onChange={handleChange}
                onFocus={focus('lastName')} onBlur={blur}
                required disabled={loading} placeholder="Smith"
                autoComplete="family-name"
                style={field('lastName')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" style={label}>Email address</label>
            <input
              type="email" id="email" name="email"
              value={formData.email} onChange={handleChange}
              onFocus={focus('email')} onBlur={blur}
              required disabled={loading} placeholder="you@studio.com"
              autoComplete="email"
              style={field('email')}
            />
          </div>

          <div>
            <label htmlFor="password" style={label}>Password</label>
            <input
              type="password" id="password" name="password"
              autoComplete="new-password"
              value={formData.password} onChange={handleChange}
              onFocus={focus('password')} onBlur={blur}
              required disabled={loading} placeholder="8 or more characters"
              style={field('password')}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" style={label}>Confirm password</label>
            <input
              type="password" id="confirmPassword" name="confirmPassword"
              autoComplete="new-password"
              value={formData.confirmPassword} onChange={handleChange}
              onFocus={focus('confirmPassword')} onBlur={blur}
              required disabled={loading} placeholder="Repeat your password"
              style={field('confirmPassword')}
            />
          </div>

          {/* Honeypot */}
          <input
            type="text" value={honeypot}
            onChange={e => setHoneypot(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.25rem',
              padding: '12px 0',
              background: loading ? '#2e2a48' : '#7c5cff',
              color: loading ? MUTED : '#fff',
              border: 'none',
              borderRadius: 9,
              fontSize: '0.97rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(124,92,255,0.38), inset 0 1px 0 rgba(255,255,255,0.12)',
              transition: 'background 0.15s, box-shadow 0.15s, transform 0.1s',
            }}
            onMouseOver={e => { if (!loading) (e.currentTarget.style.background = '#8f6dff'); }}
            onMouseOut={e => { if (!loading) (e.currentTarget.style.background = '#7c5cff'); }}
            onMouseDown={e => { if (!loading) (e.currentTarget.style.transform = 'translateY(1px)'); }}
            onMouseUp={e => { (e.currentTarget.style.transform = 'none'); }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: `1px solid ${BORDER}`,
          textAlign: 'center',
          color: MUTED,
          fontSize: '0.88rem',
        }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
