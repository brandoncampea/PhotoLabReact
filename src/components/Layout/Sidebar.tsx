import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const adminLinks = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/albums', label: 'Albums' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/shipping', label: 'Shipping' },
  { to: '/admin/album-styles', label: 'Album Styles' },
  { to: '/admin/discount-codes', label: 'Discount Codes' },
  { to: '/admin/watermarks', label: 'Watermarks' },
  { to: '/admin/profile', label: 'Profile' },
];

const superAdminLinks = [
  { to: '/super-admin', label: 'Super Admin Dashboard' },
  { to: '/admin/stripe', label: 'Payment Methods' },
  { to: '/admin/subscription-gateway', label: 'Studio Subscription Payment Gateway' },
  { to: '/admin/subscription', label: 'Subscription Pricing' },
  { to: '/admin/configuration', label: 'Lab Configuration' },
  { to: '/admin/price-lists', label: 'Price Lists' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/studio-admins', label: 'Studio Admins' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/profile', label: 'Profile' },
];

const Sidebar: React.FC = () => {
  const [adminOpen, setAdminOpen] = useState(false);
  const [superAdminOpen, setSuperAdminOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/admin/login';
  };

  return (
    <aside className="sidebar">
      <ul className="sidebar-menu">
        <li><Link to="/admin/dashboard">Dashboard</Link></li>
        <li><Link to="/admin/albums">Albums</Link></li>
        <li><Link to="/admin/orders">Orders</Link></li>
        <li>
          <div className="admin-menu-section">
            <button className="sidebar-expand-btn admin-menu-section-header" onClick={() => setAdminOpen(v => !v)}>
              Admin {adminOpen ? '▼' : '▶'}
            </button>
            {adminOpen && (
              <ul className="sidebar-submenu admin-menu-submenu">
                {adminLinks.map(link => (
                  <li key={link.to}>
                    <Link to={link.to} className="admin-customer-site">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
        <li>
          <div className="admin-menu-section">
            <button className="sidebar-expand-btn admin-menu-section-header" onClick={() => setSuperAdminOpen(v => !v)}>
              Super Admin {superAdminOpen ? '▼' : '▶'}
            </button>
            {superAdminOpen && (
              <ul className="sidebar-submenu admin-menu-submenu">
                {superAdminLinks.map(link => (
                  <li key={link.to}>
                    <Link to={link.to} className="admin-customer-site">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      </ul>
      <div className="sidebar-footer">
        <Link to="/" className="sidebar-footer-link">🏠 Customer Site</Link>
        <button onClick={handleLogout} className="sidebar-footer-logout">🚪 Logout</button>
      </div>
    </aside>
  );
};

export default Sidebar;
