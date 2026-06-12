import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  fontSize: '0.92rem',
};

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login({ email, password });

      if (!user.isActive) {
        setError('Your account has been deactivated. Please contact support.');
        setLoading(false);
        return;
      }

      if (user.role === 'admin' || user.role === 'studio_admin' || user.role === 'super_admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/albums');
      }
    } catch (err: any) {
      const isNetworkError = err.code === 'ERR_NETWORK' || (!navigator.onLine && typeof navigator !== 'undefined');
      const errorMessage = isNetworkError
        ? 'Network error. Please try again.'
        : err.response?.data?.message
          || err.response?.data?.title
          || (err.response?.status === 403 ? 'Access forbidden. Please check your backend configuration.' : '')
          || 'Failed to login. Please check your credentials.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#181a1b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#23232a',
          border: '1px solid #3a3656',
          borderRadius: 18,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          padding: '2.5rem 2rem',
        }}
      >
        <h1
          style={{
            margin: '0 0 0.25rem 0',
            fontSize: '2.2rem',
            fontWeight: 800,
            background: 'linear-gradient(90deg, #a78bfa 0%, #6366f1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textAlign: 'center',
          }}
        >
          Sign In
        </h1>
        <p style={{ color: '#a1a1aa', textAlign: 'center', margin: '0 0 1.75rem 0', fontSize: '1rem' }}>
          Welcome back to Photo Lab
        </p>

        {error && (
          <div style={{ background: '#2d1a1a', color: '#ffb3b3', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.95rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 24px',
              fontSize: '1.08rem',
              fontWeight: 700,
              borderRadius: 12,
              background: loading ? '#5a3cff99' : '#7c5cff',
              color: '#fff',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 12px rgba(124,92,255,0.3)',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: 'center', color: '#a1a1aa', fontSize: '0.95rem' }}>
          Don't have an account?{' '}
          <Link to="/studio-signup" style={{ color: '#a78bfa', fontWeight: 600, textDecoration: 'none' }}>
            Create a studio
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
