import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './Navbar.module.css';
import { useAuth } from '../../contexts/AuthContext';

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
            <Link
              to={studioSlug ? `/account?studioSlug=${encodeURIComponent(studioSlug)}` : '/account'}
              className={styles.navbarLink}
            >
              My Account
            </Link>
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
