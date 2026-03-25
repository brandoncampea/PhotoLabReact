
import React from 'react';
import styles from './Navbar.module.css';
// import { useAuth } from '../../contexts/AuthContext';
// import { profileService } from '../../services/profileService';

const Navbar: React.FC = () => {
  // Placeholder: Replace with studio config/profileService when available
  const studioName = "Studio Name";
  const studioLogo = "/logo.png"; // Replace with dynamic logo URL if available
  const isLoggedIn = false; // Replace with auth context
  const user = null; // Replace with auth context user

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarBrand}>
        <img src={studioLogo} alt="Studio Logo" className={styles.navbarBrandImg} />
        {studioName}
      </div>
      <div className={styles.navbarLinks}>
        <a href="/albums" className={styles.navbarLink}>Albums</a>
        <a href="/orders" className={styles.navbarLink}>Orders</a>
        <a href="/cart" className={styles.navbarLink}>Cart</a>
        <a href="/" className={styles.navbarLink}>Customer Site</a>
        {isLoggedIn ? (
          <a href="/logout" className={styles.navbarLink}>Logout</a>
        ) : (
          <>
            <a href="/login" className={styles.navbarLink}>Login</a>
            <a href="/register" className={styles.navbarLink}>Register</a>
          </>
        )}
      </div>
      <div className={styles.navbarUser}>
        {isLoggedIn && user ? (
          <span className={styles.navbarUserInfo}>
            <img src={'/default-avatar.png'} alt="User Avatar" className={styles.navbarUserImg} />
            {'User'}
          </span>
        ) : null}
      </div>
    </nav>
  );
};

export default Navbar;
