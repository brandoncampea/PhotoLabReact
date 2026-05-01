


import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Navbar.module.css';

const Navbar: React.FC = () => {
    const { items, getTotalItems } = useCart();
    const cartCount = typeof getTotalItems === 'function' ? getTotalItems() : (Array.isArray(items) ? items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0);
  const location = useLocation();
  const [publicStudioBrand, setPublicStudioBrand] = useState<{ name: string; logoUrl: string | null; instagramUrl?: string | null; facebookUrl?: string | null } | null>(null);

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

  // ...existing code...

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
        setPublicStudioBrand({
          name,
          logoUrl,
          instagramUrl: data.instagramUrl || null,
          facebookUrl: data.facebookUrl || null,
        });
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
        {publicStudioBrand?.instagramUrl && (
          <a
            href={publicStudioBrand.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '0.5rem', color: 'inherit', opacity: 0.85 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.337 3.608 1.312.975.975 1.25 2.242 1.312 3.608.058 1.266.07 1.646.07 4.847s-.012 3.581-.07 4.847c-.062 1.366-.337 2.633-1.312 3.608-.975.975-2.242 1.25-3.608 1.312-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.337-3.608-1.312-.975-.975-1.25-2.242-1.312-3.608C2.175 15.581 2.163 15.201 2.163 12s.012-3.584.07-4.85c.062-1.366.337-2.633 1.312-3.608.975-.975 2.242-1.25 3.608-1.312C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038C3.355 23.327 5.197 23.843 7.052 23.928 8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038C23.986 15.668 24 15.259 24 12c0-3.259-.014-3.668-.072-4.948-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
            </svg>
          </a>
        )}
        {publicStudioBrand?.facebookUrl && (
          <a
            href={publicStudioBrand.facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '0.4rem', color: 'inherit', opacity: 0.85 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
            </svg>
          </a>
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
