import React from 'react';
import NavbarWithFab from './Navbar';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => (
  <div style={{ minHeight: '100vh', background: '#181829' }}>
    <NavbarWithFab />
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 0 }}>
        <main style={{ flex: 1, padding: '16px 0 0 0', maxWidth: 1100, margin: '0 auto', width: '100%' }}>{children}</main>
      </div>
    </div>
  </div>
);

export default Layout;
