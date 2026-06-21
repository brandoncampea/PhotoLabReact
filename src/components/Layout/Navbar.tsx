import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { setStudioTimezone } from '../../utils/studioDateTime';
import styles from './Navbar.module.css';
import { useSidebar } from '../../contexts/SidebarContext';

type StudioBrand = {
  name: string;
  logoUrl: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
};

const normalizeLogoUrl = (raw: unknown): string | null => {
  const logoRaw = String(raw || '').trim();
  if (!logoRaw) return null;
  if (
    logoRaw.startsWith('http://') ||
    logoRaw.startsWith('https://') ||
    logoRaw.startsWith('/api/') ||
    logoRaw.startsWith('/uploads/') ||
    logoRaw.startsWith('data:')
  ) {
    return logoRaw;
  }
  return `/${logoRaw.replace(/^\/+/, '')}`;
};

const Navbar: React.FC = () => {
  const { items, getTotalItems } = useCart();
  const cartCount = typeof getTotalItems === 'function'
    ? getTotalItems()
    : (Array.isArray(items) ? items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0);
  const location = useLocation();
  const { user, logout } = useAuth();
  const isLoggedIn = Boolean(user);

  const [publicStudioBrand, setPublicStudioBrand] = useState<StudioBrand | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const [brandRefreshTick, setBrandRefreshTick] = useState(0);

  const studioSlug = useMemo(() => {
    const pathMatch = location.pathname.match(/(?:\/studio\/|\/s\/)([\w-]+)/);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('studioSlug');
    return fromQuery ? decodeURIComponent(fromQuery) : '';
  }, [location.pathname, location.search]);

  const persistedStudioSlug = useMemo(() => {
    try {
      return decodeURIComponent(String(localStorage.getItem('studioSlug') || '').trim());
    } catch {
      return '';
    }
  }, [location.pathname, location.search]);

  const studioNavSlug = studioSlug || persistedStudioSlug;

  // Create a stable studio context key to avoid re-fetching on every auth change
  const studioContextKey = useMemo(() => {
    if (studioSlug) {
      return `public:${studioSlug}`;
    }
    if (isLoggedIn) {
      const viewAsStudioId = Number(localStorage.getItem('viewAsStudioId') || '0');
      const isSuperAdmin = user?.role === 'super_admin';
      const effectiveStudioId = isSuperAdmin && viewAsStudioId > 0 ? viewAsStudioId : user?.studioId;
      if (effectiveStudioId) return `admin:${effectiveStudioId}`;
    }
    return '';
  }, [studioSlug, isLoggedIn, user?.role, user?.studioId]);

  useEffect(() => {
    let cancelled = false;

    const setBrandFromData = (data: any) => {
      if (cancelled || !data) return;
      const name = String(data.displayName || data.businessName || data.name || 'Studio Name');
      const logoUrl = normalizeLogoUrl(data.logoUrl);
      setPublicStudioBrand({
        name,
        logoUrl,
        instagramUrl: data.instagramUrl || null,
        facebookUrl: data.facebookUrl || null,
      });
      if (data?.timezone) {
        setStudioTimezone(data.timezone);
      }
      setBrandLogoFailed(false);
    };

    const load = async () => {
      try {
        // Public route branding (slug-based)
        if (studioSlug) {
          const res = await fetch(`/api/studios/public/${encodeURIComponent(studioSlug)}`);
          const data = res.ok ? await res.json() : null;
          setBrandFromData(data);
          return;
        }

        // Admin/view-as-studio branding (auth/profile-based)
        if (isLoggedIn) {
          const viewAsStudioId = Number(localStorage.getItem('viewAsStudioId') || '0');
          const isSuperAdmin = user?.role === 'super_admin';
          // Super admins without a selected studio have no brand to show
          if (isSuperAdmin && !viewAsStudioId && !user?.studioId) return;
          const queryStudioId = isSuperAdmin && viewAsStudioId > 0 ? viewAsStudioId : undefined;

          const response = await api.get('/profile', queryStudioId ? { params: { studioId: queryStudioId } } : undefined);
          const data = response?.data || null;
          if (data) {
            setBrandFromData({
              displayName: data.businessName || data.ownerName || 'Studio Name',
              logoUrl: data.logoUrl,
              instagramUrl: data.instagramUrl,
              facebookUrl: data.facebookUrl,
            });
            return;
          }
        }

        if (!cancelled) setPublicStudioBrand(null);
      } catch {
        if (!cancelled) setPublicStudioBrand(null);
      }
    };

    // Only refetch if studio context actually changed
    if (studioContextKey) {
      load();
    } else {
      setPublicStudioBrand(null);
    }

    return () => {
      cancelled = true;
    };
  }, [studioContextKey, isLoggedIn, user?.studioId, user?.role, brandRefreshTick]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onStudioBrandUpdated = () => setBrandRefreshTick((v) => v + 1);
    window.addEventListener('studio-brand-updated', onStudioBrandUpdated);
    return () => {
      window.removeEventListener('studio-brand-updated', onStudioBrandUpdated);
    };
  }, []);

  const studioName = publicStudioBrand?.name || 'Studio Name';
  const brandLogoUrl = publicStudioBrand?.logoUrl || null;
  const shouldShowBrandLogo = Boolean(brandLogoUrl) && !brandLogoFailed;

  const isAdmin = user?.role === 'super_admin' || user?.role === 'studio_admin';
  const { open: sidebarOpen, toggle: sidebarToggle } = useSidebar();

  return (
    <nav className={styles.navbar}>
      {isAdmin && (
        <button
          id="hamburger-btn"
          onClick={sidebarToggle}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            background: sidebarOpen ? 'rgba(124,92,255,0.2)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${sidebarOpen ? 'rgba(124,92,255,0.45)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 9,
            cursor: 'pointer',
            padding: 0,
            marginRight: '0.75rem',
            transition: 'background 0.18s, border-color 0.18s',
          }}
        >
          <span style={{ display: 'block', width: 16, height: 2, background: sidebarOpen ? '#a78bfa' : '#c4c4de', borderRadius: 2, transition: 'transform 0.2s', transform: sidebarOpen ? 'translateY(7px) rotate(45deg)' : 'none' }} />
          <span style={{ display: 'block', width: 16, height: 2, background: sidebarOpen ? '#a78bfa' : '#c4c4de', borderRadius: 2, transition: 'opacity 0.2s', opacity: sidebarOpen ? 0 : 1 }} />
          <span style={{ display: 'block', width: 16, height: 2, background: sidebarOpen ? '#a78bfa' : '#c4c4de', borderRadius: 2, transition: 'transform 0.2s', transform: sidebarOpen ? 'translateY(-7px) rotate(-45deg)' : 'none' }} />
        </button>
      )}
      <div className={styles.navbarBrand}>
        {shouldShowBrandLogo ? (
          <img
            src={brandLogoUrl as string}
            alt={studioName + ' Logo'}
            className={styles.navbarBrandImg}
            onError={() => setBrandLogoFailed(true)}
          />
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
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.337 3.608 1.312.975.975 1.25 2.242 1.312 3.608.058 1.266.07 1.646.07 4.847s-.012 3.581-.07 4.847c-.062 1.366-.337 2.633-1.312 3.608-.975.975-2.242 1.25-3.608 1.312-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.337-3.608-1.312-.975-.975-1.25-2.242-1.312-3.608C2.175 15.581 2.163 15.201 2.163 12s.012-3.584.07-4.85c.062-1.366.337-2.633 1.312-3.608.975-.975 2.242-1.25 3.608-1.312C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038C3.355 23.327 5.197 23.843 7.052 23.928 8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038C23.986 15.668 24 15.259 24 12c0-3.259-.014-3.668-.072-4.948-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
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
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
            </svg>
          </a>
        )}
      </div>

      <div className={styles.cartMobile + ' ' + styles.mobileOnly}>
        <Link to="/cart" aria-label="Cart" className={styles.cartIconWrapper} style={{ textDecoration: 'none' }}>
          <span className={styles.cartIcon + ' material-icons'}>shopping_cart</span>
          {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
        </Link>
      </div>

      <div className={styles.navbarLinks + ' ' + styles.desktopOnly}>
        <Link to={studioNavSlug ? `/albums?studioSlug=${encodeURIComponent(studioNavSlug)}` : '/albums'} className={styles.navbarLink}>Albums</Link>
        <Link to={studioNavSlug ? `/studio/${encodeURIComponent(studioNavSlug)}/deals` : '/deals'} className={styles.navbarLink}>Deals</Link>
        {studioNavSlug && <Link to={`/studio/${encodeURIComponent(studioNavSlug)}/book`} className={styles.navbarLink}>Book</Link>}
        <div className={styles.cartIconWrapper + ' ' + styles.desktopOnly}>
          <Link to="/cart" aria-label="Cart" className={styles.cartIcon} style={{ textDecoration: 'none', position: 'relative' }}>
            <span className="material-icons">shopping_cart</span>
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount}</span>}
          </Link>
        </div>
        {isLoggedIn ? (
          <>
            <Link to={studioSlug ? `/account?studioSlug=${encodeURIComponent(studioSlug)}` : '/account'} className={styles.navbarLink}>
              My Account
            </Link>
            {user?.role === 'customer' && (
              <Link to="/account/tickets" className={styles.navbarLink}>My Tickets</Link>
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

      {!isAdmin && (
        <div className={styles.mobileMenuWrapper + ' ' + styles.mobileOnly}>
          <button
            className={styles.navbarToggle}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            type="button"
          >
            {menuOpen ? <span>&#x2715;</span> : <span>&#9776;</span>}
          </button>
          <div className={styles.navbarLinks + (menuOpen ? ' ' + styles.open : '')}>
            <Link to={studioNavSlug ? `/albums?studioSlug=${encodeURIComponent(studioNavSlug)}` : '/albums'} className={styles.navbarLink}>Albums</Link>
            <Link to={studioNavSlug ? `/studio/${encodeURIComponent(studioNavSlug)}/deals` : '/deals'} className={styles.navbarLink}>Deals</Link>
            <Link to="/orders" className={styles.navbarLink}>Orders</Link>
            {studioNavSlug && <Link to={`/studio/${encodeURIComponent(studioNavSlug)}/book`} className={styles.navbarLink}>Book</Link>}
            {isLoggedIn ? (
              <>
                <Link to={studioSlug ? `/account?studioSlug=${encodeURIComponent(studioSlug)}` : '/account'} className={styles.navbarLink}>
                  My Account
                </Link>
                {user?.role === 'customer' && (
                  <Link to="/account/tickets" className={styles.navbarLink}>My Tickets</Link>
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
      )}
    </nav>
  );
};

import TicketFab from '../TicketFab';

const NavbarWithFab: React.FC = (props) => (
  <>
    <Navbar {...props} />
    <TicketFab />
  </>
);

export default NavbarWithFab;
