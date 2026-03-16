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
      <div className="nav-container dark-bg">
        <Link to={user ? "/albums" : "/"} className="nav-brand dark-card">
          <span className="brand-title">0 Photo Lab</span>
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
                <Link to="/admin/dashboard" className="nav-link nav-admin">
                  ⚙️ Admin
                </Link>
              )}
              {user.role === 'studio_admin' && (
                <Link to="/admin/studio-dashboard" className="nav-link nav-studio">
                  📊 Studio Dashboard
                </Link>
              )}
              {user.role === 'super_admin' && (
                <Link to="/super-admin" className="nav-link nav-super">
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
        </div>
      </div>
    </header>
  );
};

export default Navbar;
