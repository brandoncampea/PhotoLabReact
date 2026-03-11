import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';
  const isStudioAdmin = user?.role === 'studio_admin';
  const canSwitchMenu = isSuperAdmin;

  const [menuMode, setMenuMode] = useState<'super' | 'studio'>(() => {
    const stored = localStorage.getItem('adminMenuMode');
    return stored === 'studio' ? 'studio' : 'super';
  });
  const [viewAsStudioName, setViewAsStudioName] = useState<string | null>(() => localStorage.getItem('viewAsStudioName'));

  useEffect(() => {
    if (isStudioAdmin) {
      setMenuMode('studio');
      return;
    }

    if (isSuperAdmin) {
      return;
    }

    setMenuMode('studio');
  }, [isStudioAdmin, isSuperAdmin, canSwitchMenu, menuMode]);

  useEffect(() => {
    localStorage.setItem('adminMenuMode', menuMode);
  }, [menuMode]);

  const clearStudioView = () => {
    localStorage.removeItem('viewAsStudioId');
    localStorage.removeItem('viewAsStudioName');
    setViewAsStudioName(null);
  };

  const handleLogout = () => {
    clearStudioView();
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/admin/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const superAdminLinks = useMemo(
    () => [
      { to: '/super-admin', label: '🛡️ Super Admin Dashboard' },
      { to: '/admin/dashboard', label: '🏢 Studio Admin Dashboard' },
      { to: '/super-admin-pricing', label: '💼 Subscription Pricing' },
      { to: '/admin/price-lists', label: '💰 Price Lists' },
      { to: '/admin/users', label: '👥 Users' },
      { to: '/admin/studio-admins', label: '🏢 Studio Admins' },
      { to: '/admin/analytics', label: '📈 Analytics' },
      { to: '/admin/profile', label: '👤 Profile' },
    ],
    []
  );

  const studioAdminLinks = useMemo(
    () => [
      { to: '/admin/dashboard', label: '📊 Dashboard' },
      { to: '/admin/analytics', label: '📈 Analytics' },
      { to: '/admin/albums', label: '📁 Albums' },
      { to: '/admin/photos', label: '📷 Photos' },
      { to: '/admin/products', label: '📦 Products' },
      { to: '/admin/orders', label: '🛒 Orders' },
      { to: '/admin/customers', label: '👥 Customers' },
      { to: '/admin/shipping', label: '🚚 Shipping' },
      { to: '/admin/payments', label: '💳 Payments' },
      { to: '/admin/discount-codes', label: '🎟️ Discount Codes' },
      { to: '/admin/configuration', label: '🖼️ Lab Configuration' },
      { to: '/admin/watermarks', label: '💧 Watermarks' },
      { to: '/admin/profile', label: '👤 Profile' },
    ],
    []
  );

  const linksToRender = menuMode === 'super' ? superAdminLinks : studioAdminLinks;

  return (
    <div className="admin-layout">
      <aside className="admin-panel">
        <div className="admin-brand">
          <h2>📸 Photo Lab Admin</h2>
        </div>

        {canSwitchMenu && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', padding: '0 0.5rem' }}>
            <button
              onClick={() => {
                clearStudioView();
                setMenuMode('super');
              }}
              className={menuMode === 'super' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ flex: 1 }}
            >
              Super
            </button>
            <button
              onClick={() => setMenuMode('studio')}
              className={menuMode === 'studio' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ flex: 1 }}
            >
              Studio
            </button>
          </div>
        )}

        {viewAsStudioName && isSuperAdmin && (
          <div style={{ padding: '0 0.75rem 0.75rem 0.75rem' }}>
            <div className="admin-summary-box" style={{ fontSize: '0.8rem' }}>
              Viewing as studio: <strong>{viewAsStudioName}</strong>
              <button
                onClick={() => {
                  clearStudioView();
                  setMenuMode('super');
                  navigate('/super-admin');
                }}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '0.5rem', width: '100%' }}
              >
                Exit Studio View
              </button>
            </div>
          </div>
        )}

        <nav className="admin-nav">
          {linksToRender.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`admin-nav-link ${isActive(link.to) ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="admin-panel-footer">
          <Link to="/" className="admin-nav-link">🏠 Customer Site</Link>
          <button onClick={handleLogout} className="admin-nav-link logout-btn">
            🚪 Logout
          </button>
        </div>
      </aside>
      <main className="admin-content">
        {viewAsStudioName && isSuperAdmin && (
          <div className="info-box-blue" style={{ marginBottom: '1rem' }}>
            Viewing as studio: <strong>{viewAsStudioName}</strong>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
