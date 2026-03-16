import React, { useEffect, useMemo, useState } from 'react';
import '../AdminStyles.css';
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
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    navigate('/admin/login');
  };

  const isActive = (path: string) => {
    const [pathname, hash] = path.split('#');
    if (hash) {
      return location.pathname === pathname && location.hash === `#${hash}`;
    }
    return location.pathname === pathname;
  };

  const superAdminLinks = useMemo(
    () => [
      { to: '/super-admin', label: '🛡️ Super Admin Dashboard' },
      { to: '/super-admin-pricing#subscription-settings', label: '💳 Studio Subscription Payment Gateway' },
      { to: '/super-admin-pricing', label: '💼 Subscription Pricing' },
      { to: '/admin/configuration', label: '🖼️ Lab Configuration' },
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
      { to: '/admin/studio-dashboard', label: '🏢 Studio Dashboard' },
      { to: '/admin/smugmug', label: '🗂️ SmugMug Import' },
      { to: '/admin/dashboard', label: '📊 Operations Dashboard' },
      { to: '/admin/analytics', label: '📈 Analytics' },
      { to: '/admin/albums', label: '📁 Albums' },
      { to: '/admin/photos', label: '📷 Photos' },
      { to: '/admin/products', label: '📦 Products' },
      { to: '/admin/orders', label: '🛒 Orders' },
      { to: '/admin/customers', label: '👥 Customers' },
      { to: '/admin/shipping', label: '🚚 Shipping' },
      { to: '/admin/discount-codes', label: '🎟️ Discount Codes' },
      { to: '/admin/watermarks', label: '💧 Watermarks' },
      { to: '/admin/profile', label: '👤 Profile' },
    ],
    []
  );

  const linksToRender = menuMode === 'super' ? superAdminLinks : studioAdminLinks;

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-header">PhotoLab</div>
        <div className="sidebar-links">
          {canSwitchMenu && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                onClick={() => {
                  clearStudioView();
                  setMenuMode('super');
                }}
                className={menuMode === 'super' ? 'button' : 'button'}
                style={{ background: menuMode === 'super' ? 'var(--accent)' : 'var(--bg-panel)' }}
              >
                Super
              </button>
              <button
                onClick={() => setMenuMode('studio')}
                className={menuMode === 'studio' ? 'button' : 'button'}
                style={{ background: menuMode === 'studio' ? 'var(--accent)' : 'var(--bg-panel)' }}
              >
                Studio
              </button>
            </div>
          )}
          {viewAsStudioName && isSuperAdmin && (
            <div style={{ color: 'var(--accent)', marginBottom: '16px' }}>
              Viewing as studio: <strong>{viewAsStudioName}</strong>
              <button
                onClick={() => {
                  clearStudioView();
                  setMenuMode('super');
                  navigate('/super-admin');
                }}
                className="button"
                style={{ marginTop: '8px', width: '100%' }}
              >
                Exit Studio View
              </button>
            </div>
          )}
          {linksToRender.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`sidebar-link${isActive(link.to) ? ' active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
          <div style={{ marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <Link to="/" className="sidebar-link">🏠 Customer Site</Link>
            <button onClick={handleLogout} className="sidebar-link" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-secondary)', marginTop: '8px' }}>
              🚪 Logout
            </button>
          </div>
        </div>
      </aside>
      <main className="admin-content">
        {viewAsStudioName && isSuperAdmin && (
          <div className="card" style={{ marginBottom: '1rem', background: 'var(--bg-panel)' }}>
            Viewing as studio: <strong>{viewAsStudioName}</strong>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
