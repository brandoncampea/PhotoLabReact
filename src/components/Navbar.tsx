import React from 'react';
// import { Link } from 'react-router-dom';
// import { useAuth } from '../contexts/AuthContext';
// import { profileService } from '../services/profileService';

const Navbar: React.FC = () => {
  // const { user, logout } = useAuth();
  // ...existing code...
  // const [logoUrl, setLogoUrl] = useState('');

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <a href="/" className="navbar-logo">📸 Photo Lab</a>
      </div>
      <div className="navbar-links">
        <a href="/albums" className="navbar-link">Albums</a>
        <a href="/orders" className="navbar-link">Orders</a>
        <a href="/cart" className="navbar-link">Cart</a>
        <a href="/login" className="navbar-link">Login</a>
        <a href="/register" className="navbar-link">Register</a>
      </div>
    </nav>
  );
};

export default Navbar;
