import React from 'react';
import { Link } from 'react-router-dom';
import '../AdminStyles.css';

const TopNavbar: React.FC = () => {
  return (
    <nav className="top-navbar">
      <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent)' }}>PhotoLab</div>
      <div className="nav-links">
        <Link to="/albums" className="nav-link">Albums</Link>
        <Link to="/orders" className="nav-link">Orders</Link>
        <Link to="/login" className="nav-link">Login</Link>
        <Link to="/register" className="nav-link">Register</Link>
      </div>
    </nav>
  );
};

export default TopNavbar;
