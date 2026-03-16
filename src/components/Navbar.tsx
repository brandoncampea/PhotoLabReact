import React, { useState, useEffect, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
// import { profileService } from '../services/profileService';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { getTotalItems } = useCart();
  const navigate = useNavigate();
  const [quickSearch, setQuickSearch] = useState('');
  // const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    // If you need to load logo asynchronously, do it here
  }, []);

  const handleQuickSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && quickSearch.trim()) {
      navigate(`/search?q=${encodeURIComponent(quickSearch)}`);
      setQuickSearch('');
    }
  };

  return (
    <header className="navbar dark-bg" role="navigation">
      <div className="nav-container">
        <Link to="/" className="nav-brand dark-card">
          PhotoLab
        </Link>
        <nav className="nav-links">
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link to="/admin/dashboard" className="admin-nav-link dark-btn">
                  ⚙️ Admin
                </Link>
              )}
              {user.role === 'studio_admin' && (
                <Link to="/admin/studio-dashboard" className="admin-nav-link dark-btn">
                  📊 Studio Dashboard
                </Link>
              )}
              {user.role === 'super_admin' && (
                <Link to="/super-admin" className="admin-nav-link dark-btn">
                  👑 Super Admin
                </Link>
              )}
              <div className="user-actions">
                <span className="user-name">
                  {user.firstName} {user.lastName}
                </span>
                <button onClick={logout} className="btn-logout">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/" className="nav-link">
                Home
              </Link>
              <Link to="/studio-signup" className="nav-link nav-trial">
                🚀 Start Free Trial
              </Link>
              <Link to="/login" className="nav-link">
                Login
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
