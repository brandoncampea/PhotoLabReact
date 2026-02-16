import React, { useState, useEffect, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { profileService } from '../services/profileService';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { getTotalItems } = useCart();
  const navigate = useNavigate();
  const [quickSearch, setQuickSearch] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    loadLogo();
  }, []);

  const loadLogo = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setLogoUrl('');
        return;
      }
      const config = await profileService.getConfig();
      setLogoUrl(config.logoUrl || '');
    } catch (error) {
      console.warn('Failed to load logo:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleQuickSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && quickSearch.trim()) {
      navigate(`/search?q=${encodeURIComponent(quickSearch)}`);
      setQuickSearch('');
    }
  };

  return (
    <header className="navbar" role="navigation">
      <div className="nav-container">
        <Link to="/albums" className="nav-brand">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Site Logo" 
              className="nav-logo"
            />
          ) : (
            <>📸 Photo Lab</>
          )}
        </Link>

        <div className="nav-links">
          {user ? (
            <>
              <div className="nav-search">
                <input
                  type="text"
                  placeholder="Quick search..."
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  onKeyDown={handleQuickSearch}
                  className="nav-search-input"
                />
              </div>
              <Link to="/albums" className="nav-link">
                Albums
              </Link>
              <Link to="/search" className="nav-link">
                🔍 Search
              </Link>
              <Link to="/orders" className="nav-link">
                Orders
              </Link>
              <Link to="/cart" className="nav-link cart-link">
                🛒 Cart
                {getTotalItems() > 0 && (
                  <span className="cart-badge">{getTotalItems()}</span>
                )}
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin/dashboard" className="nav-link" style={{ color: '#ff6b35', fontWeight: '600' }}>
                  ⚙️ Admin
                </Link>
              )}
              {user.role === 'studio_admin' && (
                <Link to="/admin/dashboard" className="nav-link" style={{ color: '#7c3aed', fontWeight: '600' }}>
                  📊 Studio Dashboard
                </Link>
              )}
              {user.role === 'super_admin' && (
                <Link to="/super-admin" className="nav-link" style={{ color: '#d32f2f', fontWeight: '600' }}>
                  👑 Super Admin
                </Link>
              )}
              <div className="user-actions">
                <span className="user-name">
                  {user.firstName} {user.lastName}
                </span>
                <button onClick={handleLogout} className="btn-logout">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/" className="nav-link">
                Home
              </Link>
              <Link to="/albums" className="nav-link">
                Albums
              </Link>
              <Link to="/login" className="nav-link">
                Login
              </Link>
              <Link to="/register" className="nav-link">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
