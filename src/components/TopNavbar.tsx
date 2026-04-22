
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styles from './TopNavbar.module.css';

const TopNavbar: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu on route change
  React.useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <nav className={styles['top-navbar']}>
      <div className={styles['navbar-logo'] + ' gradient-text fw-bold'}>PhotoLab</div>
      <div
        className={styles.hamburger}
        onClick={() => setMenuOpen(m => !m)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        tabIndex={0}
        role="button"
      >
        <span></span>
        <span></span>
        <span></span>
      </div>
      {/* Mobile menu backdrop */}
      {menuOpen && (
        <div
          className={styles['nav-backdrop']}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={styles['nav-links'] + (menuOpen ? ' ' + styles.open : '')}>
        <Link to="/albums" className={styles['nav-link'] + (location.pathname.startsWith('/albums') ? ' ' + styles.active : '')} onClick={() => setMenuOpen(false)}>Albums</Link>
        <Link to="/orders" className={styles['nav-link'] + (location.pathname.startsWith('/orders') ? ' ' + styles.active : '')} onClick={() => setMenuOpen(false)}>Orders</Link>
        <Link to="/login" className={styles['nav-link'] + (location.pathname.startsWith('/login') ? ' ' + styles.active : '')} onClick={() => setMenuOpen(false)}>Login</Link>
        <Link to="/register" className={styles['nav-link'] + (location.pathname.startsWith('/register') ? ' ' + styles.active : '')} onClick={() => setMenuOpen(false)}>Register</Link>
      </div>
    </nav>
  );
};

export default TopNavbar;
