
import React from 'react';
// import { useAuth } from '../../contexts/AuthContext';
// import { profileService } from '../../services/profileService';

const Navbar: React.FC = () => {
  // Placeholder: Replace with studio config/profileService when available
  const studioName = "Studio Name";
  const studioLogo = "/logo.png"; // Replace with dynamic logo URL if available
  const isLoggedIn = false; // Replace with auth context
  const user = null; // Replace with auth context user

  return (
    <nav className="navbar">
      <div className="navbar-brand" style={{ fontFamily: 'Montserrat, Inter, Segoe UI, Arial, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img src={studioLogo} alt="Studio Logo" style={{ height: '2.2rem', width: '2.2rem', borderRadius: '0.5rem', background: '#fff', objectFit: 'cover', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }} />
        {studioName}
      </div>
      <div className="navbar-links">
        <a href="/albums" className="navbar-link">Albums</a>
        <a href="/orders" className="navbar-link">Orders</a>
        <a href="/cart" className="navbar-link">Cart</a>
        <a href="/customer" className="navbar-link">Customer Site</a>
        {isLoggedIn ? (
          <a href="/logout" className="navbar-link">Logout</a>
        ) : (
          <>
            <a href="/login" className="navbar-link">Login</a>
            <a href="/register" className="navbar-link">Register</a>
          </>
        )}
      </div>
      <div className="navbar-user">
        {isLoggedIn && user ? (
          <span style={{ fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src={user.avatarUrl || '/default-avatar.png'} alt="User Avatar" style={{ width: '2rem', height: '2rem', borderRadius: '50%', objectFit: 'cover', background: '#fff' }} />
            {user.name || user.email}
          </span>
        ) : null}
      </div>
    </nav>
  );
};

export default Navbar;
