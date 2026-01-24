import React, { useState, useEffect, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { adminMockApi } from '../services/adminMockApi';

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
      const config = await adminMockApi.profile.getConfig();
      setLogoUrl(config.logoUrl || '');
    } catch (error) {
      console.error('Failed to load logo:', error);
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
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/albums" className="navbar-brand">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Site Logo" 
              className="navbar-logo"
            />
          ) : (
            <>📸 Photo Lab</>
          )}
        </Link>

        <div className="navbar-menu">
          {user && (
            <>
              <div className="navbar-search">
                <input
                  type="text"
                  placeholder="Quick search..."
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  onKeyDown={handleQuickSearch}
                  className="navbar-search-input"
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
              <div className="user-menu">
                <span className="user-name">
                  {user.firstName} {user.lastName}
                </span>
                <button onClick={handleLogout} className="btn-logout">
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
