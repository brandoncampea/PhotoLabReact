import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const { login, logout } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const authResponse = await login({ email, password });

      if (authResponse.role !== 'admin' && authResponse.role !== 'studio_admin') {
        setError('Admin access only. Please log in with an admin or studio admin account.');
        logout();
        return;
      }

      navigate('/admin/dashboard');
    } catch (err: any) {
      setError('Invalid admin credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Admin Login</h1>
        <p className="auth-subtitle">Photo Lab Administration</p>
        
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
              placeholder="admin@photolab.com"
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
            />
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Admin Sign In'}
          </button>
        </form>
        
        <p className="auth-footer">
          <Link to="/login">Customer Login</Link>
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
