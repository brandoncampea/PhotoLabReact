import React from 'react';
import { Link } from 'react-router-dom';

const TopNavbar: React.FC = () => {
  return (
    <nav className="top-navbar">
      <div className="navbar-logo gradient-text fw-bold">PhotoLab</div>
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
