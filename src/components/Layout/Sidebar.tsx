import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';

const superAdminLinks = [
  { to: '/super-admin', label: 'Dashboard', icon: '🛡️' },
  { to: '/admin/whcc-price-audit', label: 'WHCC Price Audit', icon: '🔍' },
  { to: '/admin/super-pricing', label: 'Pricing', icon: '💲' },
  { to: '/admin/users', label: 'Users', icon: '👤' },
  { to: '/admin/studio-admins', label: 'Studio Admins', icon: '🏢' },
  { to: '/admin/subscription-gateway', label: 'Subscription Gateway', icon: '💳' },
  { to: '/admin/subscription', label: 'Subscription Pricing', icon: '📋' },
  { to: '/admin/scheduling-fees', label: 'Scheduling Fees', icon: '📅' },
  { to: '/admin/configuration', label: 'Lab Configuration', icon: '⚙️' },
];

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { open, close } = useSidebar();
  const [superOpen, setSuperOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.role === 'super_admin';
  const isStudioAdmin = user?.role === 'studio_admin';
  const viewAsStudioId = Number(localStorage.getItem('viewAsStudioId'));
  const isActingAsStudio = isSuperAdmin && Number.isInteger(viewAsStudioId) && viewAsStudioId > 0;
  const inStudioAdminMenu = isStudioAdmin || isActingAsStudio;
  const dashboardPath = isSuperAdmin && !isActingAsStudio ? '/super-admin' : '/admin/dashboard';

  if (!isSuperAdmin && !isStudioAdmin) return null;

  // Close on route change
  useEffect(() => { close(); }, [location.pathname]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        const btn = document.getElementById('hamburger-btn');
        if (btn && btn.contains(e.target as Node)) return;
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isActive = (path: string) => location.pathname === path;

  const link = (to: string, label: string, icon: string) => (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        padding: '0.55rem 0.85rem',
        borderRadius: 10,
        color: isActive(to) ? '#a78bfa' : '#c4c4de',
        background: isActive(to) ? 'rgba(124,92,255,0.14)' : 'transparent',
        border: `1px solid ${isActive(to) ? 'rgba(124,92,255,0.35)' : 'transparent'}`,
        fontWeight: isActive(to) ? 700 : 500,
        fontSize: '0.92rem',
        textDecoration: 'none',
        transition: 'background 0.15s, color 0.15s',
        letterSpacing: '0.01em',
      }}
      onMouseEnter={e => { if (!isActive(to)) { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.color = '#fff'; } }}
      onMouseLeave={e => { if (!isActive(to)) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#c4c4de'; } }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0, width: 20, textAlign: 'center' }}>{icon}</span>
      {label}
    </Link>
  );

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.5rem 0.85rem 0.3rem', marginTop: '0.25rem' }}>
      {text}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 1050,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s',
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: 260,
          background: '#1a1a24',
          borderRight: '1px solid rgba(124,92,255,0.15)',
          boxShadow: open ? '4px 0 32px rgba(0,0,0,0.5)' : 'none',
          zIndex: 1060,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Drawer header */}
        <div style={{ padding: '1.1rem 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #7c5cff, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>📸</div>
          <div>
            <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.95rem', lineHeight: 1.2 }}>Photo Lab</div>
            <div style={{ color: '#6b6b80', fontSize: '0.72rem' }}>{isStudioAdmin ? 'Studio Admin' : isSuperAdmin ? 'Super Admin' : ''}</div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ padding: '0.5rem 0.6rem', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Studio */}
          {sectionLabel('Studio')}
          {link(dashboardPath, 'Dashboard', '🏠')}
          {link('/admin/albums', 'Albums', '📸')}
          {inStudioAdminMenu && link('/admin/scheduling', 'Scheduling', '📅')}

          {/* Commerce */}
          {sectionLabel('Commerce')}
          {link('/admin/orders', 'Orders', '🛒')}
          {inStudioAdminMenu && link('/admin/packages', 'Packages', '📦')}
          {inStudioAdminMenu && link('/admin/discount-codes', 'Discounts', '🏷️')}

          {/* Settings */}
          {sectionLabel('Settings')}
          {link('/admin/watermarks', 'Watermarks', '💧')}
          {link('/admin/shipping', 'Shipping', '🚚')}
          {link(
            inStudioAdminMenu ? '/admin/vendor-integrations' : '/admin/configuration',
            inStudioAdminMenu ? 'Vendor Integrations' : 'Lab Configuration',
            '🔌'
          )}

          {/* Account */}
          {sectionLabel('Account')}
          {link('/admin/profile', 'Profile', '👤')}
          {inStudioAdminMenu && link('/admin/team', 'Team', '👥')}
          {isStudioAdmin && link('/admin/profile', 'Subscription', '💳')}

          {/* Support */}
          {sectionLabel('Support')}
          {link(isSuperAdmin ? '/super-admin/reports' : '/admin/reports', 'Reports', '📈')}
          {isStudioAdmin && link('/admin/studio-tickets', 'My Tickets', '🎫')}
          {isSuperAdmin && link('/admin/tickets', 'All Tickets', '📋')}
          {isSuperAdmin && link('/admin/price-lists', 'Studio Price Lists', '💲')}

          {/* Super Admin section */}
          {isSuperAdmin && (
            <>
              <div style={{ margin: '0.75rem 0 0.1rem', height: 1, background: 'rgba(124,92,255,0.15)' }} />
              <button
                onClick={() => setSuperOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.85rem', borderRadius: 10, background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.2)', color: '#a78bfa', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', width: '100%', textAlign: 'left', marginTop: '0.25rem' }}
              >
                <span style={{ width: 20, textAlign: 'center' }}>🛡️</span>
                <span style={{ flex: 1 }}>Super Admin</span>
                <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: superOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
              </button>
              {superOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                  {superAdminLinks.map(l => link(l.to, l.label, l.icon))}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: '#4a4a6a' }}>
          {user?.email}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
