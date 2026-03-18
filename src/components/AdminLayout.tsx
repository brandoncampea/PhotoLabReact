import React, { useEffect, useMemo, useState } from 'react';
import '../PhotoLabStyles.css';
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
  const [viewAsStudioId, setViewAsStudioId] = useState<number | null>(() => {
    const id = localStorage.getItem('viewAsStudioId');
    return id ? parseInt(id, 10) : null;
  });
  const [studios, setStudios] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (isSuperAdmin) {
      const fetchStudios = async () => {
        try {
          // Try both adminToken and token for compatibility
          const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
          // Use correct backend port (3000)
          const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';
          const response = await fetch(`${apiUrl}/api/studios`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) throw new Error('Failed to fetch studios');
          const data = await response.json();
          setStudios(data.map((studio: any) => ({ id: studio.id, name: studio.name })));
        } catch (err) {
          setStudios([]);
        }
      };
      fetchStudios();
    }
  }, [isSuperAdmin]);

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
    setViewAsStudioId(null);
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
      { to: '/admin/stripe', label: '💳 Payment Methods' },
      { to: '/admin/subscription-gateway', label: '💳 Studio Subscription Payment Gateway' },
      { to: '/admin/subscription', label: '💼 Subscription Pricing' },
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
      { to: '/admin/album-styles', label: '🎨 Album Styles' },
      { to: '/admin/discount-codes', label: '🎟️ Discount Codes' },
      { to: '/admin/watermarks', label: '💧 Watermarks' },
      { to: '/admin/profile', label: '👤 Profile' },
    ],
    []
  );

  const linksToRender = menuMode === 'super' ? superAdminLinks : studioAdminLinks;

  return (
    <div className="admin-layout">
      <aside className="admin-panel">
        {isSuperAdmin && (
          <div className="admin-studio-select-row">
            <label htmlFor="studio-select" style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>Select Studio:</label>
            <select
              id="studio-select"
              style={{ fontSize: '1rem', padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid #e0e0e0', marginBottom: '1rem' }}
              value={viewAsStudioId || ''}
              onChange={e => {
                const studioId = parseInt(e.target.value, 10);
                const studio = studios.find(s => s.id === studioId);
                setViewAsStudioId(studioId);
                setViewAsStudioName(studio ? studio.name : null);
                localStorage.setItem('viewAsStudioId', String(studioId));
                localStorage.setItem('viewAsStudioName', studio ? studio.name : '');
                // Optionally trigger studio view logic here
              }}
            >
              <option value="">-- Choose Studio --</option>
              {studios.map(studio => (
                <option key={studio.id} value={studio.id}>{studio.name}</option>
              ))}
            </select>
            <button
              style={{ fontSize: '0.95rem', padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid #e0e0e0', background: '#f7f7fa', marginLeft: '0.5rem' }}
              onClick={clearStudioView}
            >
              Exit Studio View
            </button>
          </div>
        )}
      </aside>
      <main className="admin-content">
        {viewAsStudioName && isSuperAdmin && (
          <div className="card admin-view-studio-banner">
            Viewing as studio: <strong>{viewAsStudioName}</strong>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
export default AdminLayout;
