import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Navbar.module.css';
import { useAuth } from '../../contexts/AuthContext';
import ticketBadgeStyles from './TicketBadge.module.css';

const Navbar: React.FC = () => {
  const location = useLocation();
  const [publicStudioBrand, setPublicStudioBrand] = useState<{ name: string; logoUrl: string | null } | null>(null);

  const studioSlug = useMemo(() => {
    const pathMatch = location.pathname.match(/^\/(?:s|studio)\/([^/]+)/i);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('studioSlug');
    return fromQuery ? decodeURIComponent(fromQuery) : '';
  }, [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;

    if (!studioSlug) {
      setPublicStudioBrand(null);
      return;
    }

    fetch(`/api/studios/public/${encodeURIComponent(studioSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const name = String(data.displayName || data.businessName || data.name || 'Studio Name');
        const logoRaw = String(data.logoUrl || '').trim();
        const logoUrl = logoRaw
          ? (logoRaw.startsWith('http://') || logoRaw.startsWith('https://') || logoRaw.startsWith('/api/') || logoRaw.startsWith('/uploads/')
              ? logoRaw
              : `/${logoRaw.replace(/^\/+/, '')}`)
          : null;
        setPublicStudioBrand({ name, logoUrl });
      })
      .catch(() => {
        if (!cancelled) setPublicStudioBrand(null);
      });

    return () => {
      cancelled = true;
    };
  }, [studioSlug]);

  const studioName = publicStudioBrand?.name || 'Studio Name';
  const studioLogo = publicStudioBrand?.logoUrl || '/logo.png';
  const { user, logout } = useAuth();
  const isLoggedIn = Boolean(user);

  // Unread ticket badge state
  const [studioUnread, setStudioUnread] = useState(0);
  const [adminUnread, setAdminUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'studio') {
      fetch('/api/tickets/mine/unread', {
        headers: { Authorization: user.token ? `Bearer ${user.token}` : '' },
      })
        .then((res) => (res.ok ? res.json() : { count: 0 }))
        .then((data) => setStudioUnread(data.count || 0))
        .catch(() => setStudioUnread(0));
    } else if (user.role === 'super-admin') {
      fetch('/api/tickets/all/unread', {
        headers: { Authorization: user.token ? `Bearer ${user.token}` : '' },
      })
        .then((res) => (res.ok ? res.json() : { count: 0 }))
        .then((data) => setAdminUnread(data.count || 0))
        .catch(() => setAdminUnread(0));
    }
  }, [user]);

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarBrand}>
        <img src={studioLogo} alt="Studio Logo" className={styles.navbarBrandImg} />
        {studioName}
      </div>
      <div className={styles.navbarLinks}>
        <Link to={studioSlug ? `/albums?studioSlug=${encodeURIComponent(studioSlug)}` : '/albums'} className={styles.navbarLink}>Albums</Link>
        <Link to="/orders" className={styles.navbarLink}>Orders</Link>
        <Link to="/cart" className={styles.navbarLink}>Cart</Link>
        {isLoggedIn ? (
          <>
            {/* Ticket links moved to Sidebar for all roles */}
            <Link
              to={studioSlug ? `/account?studioSlug=${encodeURIComponent(studioSlug)}` : '/account'}
              className={styles.navbarLink}
            >
              My Account
            </Link>
            {/* Customer: My Tickets under My Account */}
            {user?.role === 'customer' && (
              <Link
                to="/account/tickets"
                className={styles.navbarLink}
              >
                My Tickets
              </Link>
            )}
            <button
              className={styles.navbarLink}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}
              onClick={logout}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className={styles.navbarLink}>Login</Link>
            <Link to="/register" className={styles.navbarLink}>Register</Link>
          </>
        )}
      </div>
      <div className={styles.navbarUser}>
        {isLoggedIn && user ? (
          <span className={styles.navbarUserInfo}>
            {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email}
          </span>
        ) : null}
      </div>
    </nav>
  );
};


// Add floating ticket button to all pages
import TicketFab from '../TicketFab';

const NavbarWithFab: React.FC = (props) => (
  <>
    <Navbar {...props} />
    <TicketFab />
  </>
);

export default NavbarWithFab;
