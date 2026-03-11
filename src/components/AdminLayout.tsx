import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/admin/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="admin-layout">
      <aside className="admin-panel">
        <div className="admin-brand">
          <h2>📸 Photo Lab Admin</h2>
        </div>
        <nav className="admin-nav">
          <Link
            to="/admin/dashboard"
            className={`admin-nav-link ${isActive('/admin/dashboard') ? 'active' : ''}`}
          >
            📊 Dashboard
          </Link>
          <Link
            to="/admin/analytics"
            className={`admin-nav-link ${isActive('/admin/analytics') ? 'active' : ''}`}
          >
            📈 Analytics
          </Link>
          <Link
            to="/admin/albums"
            className={`admin-nav-link ${isActive('/admin/albums') ? 'active' : ''}`}
          >
            📁 Albums
          </Link>
          <Link
            to="/admin/photos"
            className={`admin-nav-link ${isActive('/admin/photos') ? 'active' : ''}`}
          >
            📷 Photos
          </Link>
          <Link
            to="/admin/products"
            className={`admin-nav-link ${isActive('/admin/products') ? 'active' : ''}`}
          >
            📦 Products
          </Link>
          {isSuperAdmin && (
            <Link
              to="/admin/price-lists"
              className={`admin-nav-link ${isActive('/admin/price-lists') ? 'active' : ''}`}
            >
              💰 Price Lists
            </Link>
          )}
          <Link
            to="/admin/watermarks"
            className={`admin-nav-link ${isActive('/admin/watermarks') ? 'active' : ''}`}
          >
            💧 Watermarks
          </Link>
          <Link
            to="/admin/orders"
            className={`admin-nav-link ${isActive('/admin/orders') ? 'active' : ''}`}
          >
            🛒 Orders
          </Link>
          <Link
            to="/admin/customers"
            className={`admin-nav-link ${isActive('/admin/customers') ? 'active' : ''}`}
          >
            👥 Customers
          </Link>
          <Link
            to="/admin/shipping"
            className={`admin-nav-link ${isActive('/admin/shipping') ? 'active' : ''}`}
          >
            🚚 Shipping
          </Link>
          <Link
            to="/admin/payments"
            className={`admin-nav-link ${isActive('/admin/payments') ? 'active' : ''}`}
          >
            💳 Payments
          </Link>
          <Link
            to="/admin/users"
            className={`admin-nav-link ${isActive('/admin/users') ? 'active' : ''}`}
          >
            👥 Users
          </Link>
          <Link
            to="/admin/studio-admins"
            className={`admin-nav-link ${isActive('/admin/studio-admins') ? 'active' : ''}`}
          >
            🏢 Studio Admins
          </Link>
          <Link
            to="/admin/profile"
            className={`admin-nav-link ${isActive('/admin/profile') ? 'active' : ''}`}
          >
            👤 Profile
          </Link>
          <Link
            to="/admin/discount-codes"
            className={`admin-nav-link ${isActive('/admin/discount-codes') ? 'active' : ''}`}
          >
            🎟️ Discount Codes
          </Link>

          {/* Photo Lab Section */}
          <Link
            to="/admin/configuration"
            className={`admin-nav-link ${isActive('/admin/configuration') ? 'active' : ''}`}
          >
            🖼️ Lab Configuration
          </Link>
        </nav>
        <div className="admin-panel-footer">
          <Link to="/" className="admin-nav-link">🏠 Customer Site</Link>
          <button onClick={handleLogout} className="admin-nav-link logout-btn">
            🚪 Logout
          </button>
        </div>
      </aside>
      <main className="admin-content">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
