import React, { useState } from 'react';
import '../App.css';
import '../AdminStyles.css';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TopNavbar from '../components/TopNavbar';

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
      
      // Check if user is inactive
      if (!user.isActive) {
        setError('Your account has been deactivated. Please contact support.');
        setLoading(false);
        return;
      }
      
      // Redirect based on role
      if (user.role === 'admin' || user.role === 'studio_admin' || user.role === 'super_admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/albums');
      }
    } catch (err: any) {
      console.error('Login failed:', err);
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
    <>
      <TopNavbar />
      <div className="main-content dark-bg" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="auth-container dark-bg">
          <div className="auth-card dark-card">
            <h1 className="auth-title">Sign In</h1>
            <p className="auth-subtitle">Welcome back to Photo Lab</p>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="input-dark"
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="input-dark"
                />
              </div>
              <button type="submit" className="btn btn-primary dark-btn" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            <p className="auth-footer">
              Don't have an account? <Link to="/register">Register</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
