


import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Navbar.module.css';

const Navbar: React.FC = () => {
    const { items, getTotalItems } = useCart();
    const cartCount = typeof getTotalItems === 'function' ? getTotalItems() : (Array.isArray(items) ? items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0);
  const location = useLocation();
  const [publicStudioBrand, setPublicStudioBrand] = useState<{ name: string; logoUrl: string | null } | null>(null);

  const studioSlug = useMemo(() => {
    // Extract /studio/:studioSlug or /s/:studioSlug from pathname
    const pathMatch = location.pathname.match(/(?:\/studio\/|\/s\/)([\w-]+)/);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);

    // If on /cart, try to get studioSlug from query param
    if (location.pathname === '/cart') {
      const params = new URLSearchParams(location.search);
      const fromQuery = params.get('studioSlug');
      if (fromQuery) return decodeURIComponent(fromQuery);
    }

    // Fallback: empty string (default studio)
    return '';
  }, [location.pathname, location.search]);

  // Debug: Log studioSlug and logoUrl
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[Navbar DEBUG]', { studioSlug, logoUrl: publicStudioBrand?.logoUrl });
  }, [studioSlug, publicStudioBrand?.logoUrl]);

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
          ? (
              logoRaw.startsWith('http://') ||
              logoRaw.startsWith('https://') ||
              logoRaw.startsWith('/api/') ||
              logoRaw.startsWith('/uploads/') ||
              logoRaw.startsWith('data:')
                ? logoRaw
                : `/${logoRaw.replace(/^\/+/, '')}`
            )
          : null;
      {/* Cart icon outside hamburger on mobile */}
      <div className={styles.cartMobile + ' ' + styles.mobileOnly}>
        <Link to="/cart" aria-label="Cart" className={styles.cartIconWrapper} style={{ textDecoration: 'none' }}>
          <span className={styles.cartIcon + ' material-icons'}>shopping_cart</span>
          {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
        </Link>
      </div>
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

  // Responsive mobile menu state
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarBrand}>
        {publicStudioBrand?.logoUrl ? (
          <img src={studioLogo} alt={studioName + ' Logo'} className={styles.navbarBrandImg} />
        ) : (
          studioName
        )}
      </div>

      {/* Cart icon outside hamburger on mobile */}
      <div className={styles.cartMobile + ' ' + styles.mobileOnly}>
        <Link to="/cart" aria-label="Cart" className={styles.cartIconWrapper} style={{ textDecoration: 'none' }}>
          <span className={styles.cartIcon + ' material-icons'}>shopping_cart</span>
          {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
        </Link>
      </div>

      {/* Desktop nav links always visible */}
      <div className={styles.navbarLinks + ' ' + styles.desktopOnly}>
        <Link to={studioSlug ? `/albums?studioSlug=${encodeURIComponent(studioSlug)}` : '/albums'} className={styles.navbarLink}>Albums</Link>
        <Link to="/orders" className={styles.navbarLink}>Orders</Link>
        <div className={styles.cartIconWrapper + ' ' + styles.desktopOnly}>
          <Link to="/cart" aria-label="Cart" className={styles.cartIcon} style={{ textDecoration: 'none', position: 'relative' }}>
            <span className="material-icons">shopping_cart</span>
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
          </Link>
        </div>
        {isLoggedIn ? (
          <>
            <Link
              to={studioSlug ? `/account?studioSlug=${encodeURIComponent(studioSlug)}` : '/account'}
              className={styles.navbarLink}
            >
              My Account
            </Link>
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
        <div className={styles.navbarUser}>
          {isLoggedIn && user ? (
            <span className={styles.navbarUserInfo}>
              {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email}
            </span>
          ) : null}
        </div>
      </div>

      {/* Mobile hamburger toggle and menu */}
      <div className={styles.mobileMenuWrapper + ' ' + styles.mobileOnly}>
        <button
          className={styles.navbarToggle}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          type="button"
        >
          {menuOpen ? (
            <span>&#x2715;</span>
          ) : (
            <span>&#9776;</span>
          )}
        </button>
        <div className={styles.navbarLinks + (menuOpen ? ' ' + styles.open : '')}>
          <Link to={studioSlug ? `/albums?studioSlug=${encodeURIComponent(studioSlug)}` : '/albums'} className={styles.navbarLink}>Albums</Link>
          <Link to="/orders" className={styles.navbarLink}>Orders</Link>
          {isLoggedIn ? (
            <>
              <Link
                to={studioSlug ? `/account?studioSlug=${encodeURIComponent(studioSlug)}` : '/account'}
                className={styles.navbarLink}
              >
                My Account
              </Link>
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
          <div className={styles.navbarUser}>
            {isLoggedIn && user ? (
              <span className={styles.navbarUserInfo}>
                {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email}
              </span>
            ) : null}
          </div>
        </div>
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
