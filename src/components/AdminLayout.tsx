
import React from 'react';
import '../PhotoLabStyles.css';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation } from 'react-router-dom';

const adminLinks = [
  { label: 'Dashboard', to: '/admin/dashboard' },
  { label: 'Albums', to: '/admin/albums' },
  { label: 'Orders', to: '/admin/orders' },
];
const superAdminLinks = [
  { label: 'Super Admin Dashboard', to: '/admin/dashboard' },
  { label: 'Payment Methods', to: '/admin/payment-methods' },
  { label: 'Studio Subscription Payment Gateway', to: '/admin/subscription-gateway' },
  { label: 'Subscription Pricing', to: '/admin/subscription-pricing' },
  { label: 'Lab Configuration', to: '/admin/lab-config' },
  { label: 'Price Lists', to: '/admin/price-lists' },
  { label: 'Users', to: '/admin/users' },
  { label: 'Studio Admins', to: '/admin/studio-admins' },
  { label: 'Analytics', to: '/admin/analytics' },
  { label: 'Profile', to: '/admin/profile' },
];

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="page-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/admin/dashboard" className="sidebar-logo">PhotoLab Portal</Link>
        </div>
        <nav className="sidebar-menu">
          {adminLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={
                'sidebar-link' + (location.pathname === link.to ? ' active' : '')
              }
            >
              {link.label}
            </Link>
          ))}
          <div className="sidebar-section-header">Admin</div>
          {isSuperAdmin && <>
            <div className="sidebar-section-header">Super Admin</div>
            {superAdminLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={
                  'sidebar-link' + (location.pathname === link.to ? ' active' : '')
                }
              >
                {link.label}
              </Link>
            ))}
          </>}
        </nav>
        {/* Sidebar footer removed: Customer Site and Logout now in navbar */}
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
